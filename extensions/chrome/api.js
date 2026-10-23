const TOKEN_KEYS = {
  access: "rebban_access_token",
  refresh: "rebban_refresh_token",
  expires: "rebban_expires_at",
};

const LAST_TIMER_KEYS = {
  clientId: "rebban_last_client_id",
  projectId: "rebban_last_project_id",
  description: "rebban_last_description",
};

const MONEY_NOTIFICATION_TYPES = [
  "invoice_paid",
  "proposal_opened",
  "invoice_opened",
  "proposal_signed",
];

async function getStoredSession() {
  const stored = await chrome.storage.local.get([
    TOKEN_KEYS.access,
    TOKEN_KEYS.refresh,
    TOKEN_KEYS.expires,
  ]);
  return {
    accessToken: stored[TOKEN_KEYS.access] || null,
    refreshToken: stored[TOKEN_KEYS.refresh] || null,
    expiresAt: stored[TOKEN_KEYS.expires] || null,
  };
}

async function saveSession(session) {
  await chrome.storage.local.set({
    [TOKEN_KEYS.access]: session.accessToken,
    [TOKEN_KEYS.refresh]: session.refreshToken,
    [TOKEN_KEYS.expires]: session.expiresAt,
  });
}

async function clearSession() {
  await chrome.storage.local.remove([
    TOKEN_KEYS.access,
    TOKEN_KEYS.refresh,
    TOKEN_KEYS.expires,
  ]);
}

async function getLastTimerPrefs() {
  const stored = await chrome.storage.local.get([
    LAST_TIMER_KEYS.clientId,
    LAST_TIMER_KEYS.projectId,
    LAST_TIMER_KEYS.description,
  ]);
  return {
    clientId: stored[LAST_TIMER_KEYS.clientId] || "",
    projectId: stored[LAST_TIMER_KEYS.projectId] || "",
    description: stored[LAST_TIMER_KEYS.description] || "",
  };
}

async function saveLastTimerPrefs(prefs) {
  await chrome.storage.local.set({
    [LAST_TIMER_KEYS.clientId]: prefs.clientId || "",
    [LAST_TIMER_KEYS.projectId]: prefs.projectId || "",
    [LAST_TIMER_KEYS.description]: prefs.description || "",
  });
}

function authErrorMessage(json, fallback) {
  return (
    json?.error_description ||
    json?.msg ||
    json?.message ||
    json?.error ||
    fallback
  );
}

async function authRequest(path, body) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(authErrorMessage(json, "Could not sign in."));
  }
  return json;
}

async function rest(path, options = {}, allowRefresh = true) {
  const session = await getStoredSession();
  if (!session.accessToken) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (res.status === 401 && allowRefresh && session.refreshToken) {
    const refreshed = await refreshSession(session.refreshToken);
    if (refreshed) return rest(path, options, false);
  }

  return res;
}

async function restJson(path, options) {
  const res = await rest(path, options);
  if (res.status === 401) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(authErrorMessage(json, "Request failed."));
  }
  return json;
}

async function refreshSession(refreshToken) {
  try {
    const json = await authRequest("token?grant_type=refresh_token", {
      refresh_token: refreshToken,
    });
    await saveSession({
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_at ?? null,
    });
    return true;
  } catch {
    await clearSession();
    return false;
  }
}

function parseAuthCookie(raw) {
  let value = raw;
  try {
    value = decodeURIComponent(raw);
  } catch {
    value = raw;
  }
  if (value.startsWith("base64-")) {
    value = atob(value.slice("base64-".length));
  }
  return JSON.parse(value);
}

async function importBrowserSession() {
  if (!chrome.cookies) return false;
  const cookies = await chrome.cookies.getAll({ domain: "rebban.com" });
  const authCookies = cookies.filter((cookie) =>
    /sb-.*-auth-token/.test(cookie.name)
  );
  if (!authCookies.length) return false;

  const grouped = {};
  for (const cookie of authCookies) {
    const base = cookie.name.replace(/\.\d+$/, "");
    const chunk = cookie.name.match(/\.(\d+)$/);
    const index = chunk ? Number(chunk[1]) : 0;
    grouped[base] = grouped[base] || [];
    grouped[base].push({ index, value: cookie.value });
  }

  for (const parts of Object.values(grouped)) {
    const raw = parts
      .sort((a, b) => a.index - b.index)
      .map((part) => part.value)
      .join("");
    try {
      const parsed = parseAuthCookie(raw);
      if (parsed.access_token) {
        await saveSession({
          accessToken: parsed.access_token,
          refreshToken: parsed.refresh_token || null,
          expiresAt: parsed.expires_at ?? null,
        });
        return true;
      }
    } catch {
      /* try next cookie group */
    }
  }
  return false;
}

async function signIn(email, password) {
  const json = await authRequest("token?grant_type=password", {
    email,
    password,
  });
  await saveSession({
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_at ?? null,
  });
}

function clientName(client) {
  return client?.company?.trim() || client?.name || null;
}

function normalizeHost(value) {
  if (!value) return "";
  try {
    const url = value.includes("://")
      ? new URL(value)
      : new URL(`https://${value}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return String(value)
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .toLowerCase();
  }
}

function matchClientToHost(clients, host) {
  const target = normalizeHost(host);
  if (!target) return null;
  let best = null;
  for (const client of clients || []) {
    const site = normalizeHost(client.website);
    if (!site) continue;
    if (target === site || target.endsWith(`.${site}`) || site.endsWith(`.${target}`)) {
      if (!best || site.length > normalizeHost(best.website).length) {
        best = client;
      }
    }
  }
  return best;
}

function startOfLocalDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(date = new Date()) {
  const d = startOfLocalDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function minutesBetween(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.max(1, Math.round((end - start) / 60000));
}

function formatHoursMinutes(totalMinutes) {
  const safe = Math.max(0, Math.round(totalMinutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function sumTrackedMinutes(entries, running, fromMs) {
  let total = 0;
  for (const entry of entries || []) {
    const start = new Date(entry.started_at).getTime();
    if (!Number.isFinite(start) || start < fromMs) continue;
    if (entry.duration_minutes != null) {
      total += Number(entry.duration_minutes) || 0;
      continue;
    }
    if (entry.ended_at) {
      total += minutesBetween(entry.started_at, entry.ended_at);
    }
  }
  if (running?.startedAt) {
    const start = new Date(running.startedAt).getTime();
    if (Number.isFinite(start) && start >= fromMs) {
      total += Math.max(0, Math.floor((Date.now() - start) / 60000));
    }
  }
  return total;
}

async function currentUser() {
  const session = await getStoredSession();
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.accessToken}`,
    },
  });
  if (res.status === 401 && session.refreshToken) {
    const refreshed = await refreshSession(session.refreshToken);
    if (refreshed) return currentUser();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(authErrorMessage(json, "Unauthorized"));
    err.status = res.status;
    throw err;
  }
  return json;
}

async function resolveWorkspace(userId) {
  const profiles = await restJson(
    `profiles?id=eq.${userId}&select=full_name,email,active_organization_id`
  );
  const profile = profiles[0] || {};
  let organizationId = profile.active_organization_id || null;
  if (!organizationId) {
    const memberships = await restJson(
      `organization_members?user_id=eq.${userId}&status=eq.active&select=organization_id&limit=1`
    );
    organizationId = memberships[0]?.organization_id || null;
  }
  return {
    organizationId,
    fullName: profile.full_name || null,
    email: profile.email || null,
  };
}

async function getActiveTab() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url || !/^https?:/i.test(tab.url)) return null;
    return {
      url: tab.url,
      title: tab.title || "",
      host: normalizeHost(tab.url),
    };
  } catch {
    return null;
  }
}

async function loadTimer() {
  try {
    const session = await getStoredSession();
    if (!session.accessToken) {
      await importBrowserSession();
    }
    const nextSession = await getStoredSession();
    if (!nextSession.accessToken) return { unauthorized: true };

    const user = await currentUser();
    const workspace = await resolveWorkspace(user.id);
    if (!workspace.organizationId) {
      throw new Error("No workspace found.");
    }

    const orgId = workspace.organizationId;
    const weekStart = startOfWeekMonday();
    const dayStart = startOfLocalDay();
    const weekIso = weekStart.toISOString();
    const typeFilter = MONEY_NOTIFICATION_TYPES.join(",");

    const [
      clients,
      projects,
      orgs,
      runningRows,
      weekEntries,
      moneyNotes,
      overdueInvoices,
      lastPrefs,
      activeTab,
    ] = await Promise.all([
      restJson(
        `clients?organization_id=eq.${orgId}&deleted_at=is.null&select=id,name,company,website&order=name.asc`
      ),
      restJson(
        `projects?organization_id=eq.${orgId}&deleted_at=is.null&select=id,name,client_id&order=name.asc`
      ),
      restJson(`organizations?id=eq.${orgId}&select=default_hourly_rate`),
      restJson(
        `time_entries?organization_id=eq.${orgId}&user_id=eq.${user.id}&ended_at=is.null&deleted_at=is.null&select=id,description,started_at,client_id,project_id,clients(id,name,company),projects(id,name,client_id)&order=started_at.desc&limit=1`
      ),
      restJson(
        `time_entries?organization_id=eq.${orgId}&user_id=eq.${user.id}&deleted_at=is.null&started_at=gte.${weekIso}&select=id,started_at,ended_at,duration_minutes&order=started_at.asc`
      ),
      restJson(
        `notifications?user_id=eq.${user.id}&organization_id=eq.${orgId}&read_at=is.null&type=in.(${typeFilter})&select=id,type,title,created_at&order=created_at.desc&limit=20`
      ),
      restJson(
        `invoices?organization_id=eq.${orgId}&deleted_at=is.null&status=eq.overdue&select=id&limit=50`
      ).catch(() => []),
      getLastTimerPrefs(),
      getActiveTab(),
    ]);

    const mappedClients = (clients || []).map((client) => ({
      id: client.id,
      name: clientName(client) || client.name,
      website: client.website || null,
    }));

    const runningRow = runningRows[0] || null;
    const clientRel = Array.isArray(runningRow?.clients)
      ? runningRow.clients[0]
      : runningRow?.clients;
    const projectRel = Array.isArray(runningRow?.projects)
      ? runningRow.projects[0]
      : runningRow?.projects;
    const rate = Number(orgs[0]?.default_hourly_rate);

    const running = runningRow
      ? {
          id: runningRow.id,
          startedAt: runningRow.started_at,
          description: runningRow.description,
          clientId: runningRow.client_id,
          projectId: runningRow.project_id,
          clientName: clientName(clientRel),
          projectName: projectRel?.name || null,
        }
      : null;

    const matchedClient = activeTab
      ? matchClientToHost(mappedClients, activeTab.host)
      : null;

    return {
      user: {
        id: user.id,
        email: workspace.email || user.email || null,
        fullName: workspace.fullName,
      },
      organizationId: orgId,
      defaultHourlyRate:
        Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_HOURLY_RATE,
      clients: mappedClients,
      projects: (projects || []).map((project) => ({
        id: project.id,
        name: project.name,
        clientId: project.client_id,
      })),
      running,
      hours: {
        todayMinutes: sumTrackedMinutes(weekEntries, running, dayStart.getTime()),
        weekMinutes: sumTrackedMinutes(weekEntries, running, weekStart.getTime()),
      },
      lastPrefs,
      activeTab,
      matchedClient,
      moneyAlerts: {
        unread: (moneyNotes || []).length,
        overdue: (overdueInvoices || []).length,
        items: (moneyNotes || []).slice(0, 5).map((note) => ({
          id: note.id,
          type: note.type,
          title: note.title,
        })),
      },
    };
  } catch (err) {
    if (err.status === 401) return { unauthorized: true };
    throw err;
  }
}

async function startTimer(payload) {
  const state = await loadTimer();
  if (state.unauthorized) throw new Error("Sign in again to start the timer.");
  const nowIso = new Date().toISOString();
  const orgId = state.organizationId;

  await rest(
    `time_entries?organization_id=eq.${orgId}&user_id=eq.${state.user.id}&ended_at=is.null&deleted_at=is.null`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ended_at: nowIso }),
    }
  );

  const clientId = payload.clientId || null;
  const projectId =
    clientId &&
    payload.projectId &&
    state.projects.some(
      (project) =>
        project.id === payload.projectId && project.clientId === clientId
    )
      ? payload.projectId
      : null;

  const description = payload.description || null;

  const created = await restJson("time_entries", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: orgId,
      user_id: state.user.id,
      client_id: clientId,
      project_id: projectId,
      description,
      started_at: nowIso,
      ended_at: null,
      billable: true,
      hourly_rate: state.defaultHourlyRate,
    }),
  });

  await saveLastTimerPrefs({
    clientId: clientId || "",
    projectId: projectId || "",
    description: description || "",
  });

  return { ok: true, running: created[0] || created };
}

async function stopTimer(description) {
  const state = await loadTimer();
  if (state.unauthorized) throw new Error("Sign in again to stop the timer.");
  if (!state.running) throw new Error("No active timer to stop.");
  const orgId = state.organizationId;
  const note = (description || state.running.description || "Tracked from Chrome").trim();
  await restJson(
    `time_entries?id=eq.${state.running.id}&organization_id=eq.${orgId}&user_id=eq.${state.user.id}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        ended_at: new Date().toISOString(),
        description: note || null,
      }),
    }
  );
  await saveLastTimerPrefs({
    clientId: state.running.clientId || "",
    projectId: state.running.projectId || "",
    description: note || "",
  });
  return { ok: true };
}

async function toggleTimerFromShortcut() {
  const state = await loadTimer();
  if (state.unauthorized) {
    return { ok: false, error: "Sign in to Rebban Timer first." };
  }

  if (state.running) {
    await stopTimer(
      state.running.description ||
        state.lastPrefs.description ||
        "Tracked from Chrome"
    );
    return { ok: true, action: "stopped" };
  }

  const matchedId = state.matchedClient?.id || "";
  const clientId = matchedId || state.lastPrefs.clientId || null;
  const projectId =
    clientId && state.lastPrefs.projectId &&
    state.projects.some(
      (p) => p.id === state.lastPrefs.projectId && p.clientId === clientId
    )
      ? state.lastPrefs.projectId
      : null;

  await startTimer({
    clientId,
    projectId,
    description: state.lastPrefs.description || null,
  });
  return {
    ok: true,
    action: "started",
    clientName:
      state.clients.find((c) => c.id === clientId)?.name ||
      state.matchedClient?.name ||
      null,
  };
}

function leadSourceFromHost(host) {
  if (/linkedin\.com/i.test(host)) return "linkedin";
  if (/instagram\.com/i.test(host)) return "instagram";
  if (/facebook\.com/i.test(host)) return "facebook";
  if (/x\.com|twitter\.com/i.test(host)) return "twitter";
  return "website";
}

function cleanLeadNameFromTab(tab, source) {
  let title = String(tab.title || "").trim();
  title = title.replace(/^\(\d+\)\s*/, "");

  if (source === "linkedin") {
    title = title
      .replace(/\s*\|\s*LinkedIn\s*$/i, "")
      .replace(/\s*-\s*LinkedIn\s*$/i, "")
      .replace(/\s+on LinkedIn\s*$/i, "")
      .trim();
    const dash = title.split(/\s+[-–—]\s+/);
    if (dash.length > 1 && dash[0].trim().split(/\s+/).length <= 4) {
      title = dash[0].trim();
    }
  }

  if (!title || /^linkedin$/i.test(title)) {
    return source === "linkedin" ? "LinkedIn lead" : "Website lead";
  }
  return title;
}

async function scrapeActiveTabLead() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    return null;
  }

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["extract.js"],
    });
    return results?.[0]?.result || null;
  } catch {
    return null;
  }
}

async function savePageAsLead(input = {}) {
  const state = await loadTimer();
  if (state.unauthorized) throw new Error("Sign in again to save a lead.");
  const tab = state.activeTab;
  if (!tab?.url) throw new Error("Open a website tab first.");

  const scraped = await scrapeActiveTabLead();
  const source =
    scraped?.source || leadSourceFromHost(tab.host);
  const isSocial = source !== "website";

  const name =
    String(input.name || "").trim() ||
    scraped?.name ||
    (isSocial ? cleanLeadNameFromTab(tab, source) : null) ||
    scraped?.company ||
    cleanLeadNameFromTab(tab, source);
  const company =
    input.company?.trim() ||
    scraped?.company ||
    null;
  const email =
    String(input.email || "").trim().toLowerCase() ||
    scraped?.email ||
    null;

  const notes = [
    input.notes?.trim() || "",
    scraped?.name ? `Person: ${scraped.name}` : "",
    scraped?.company ? `Company: ${scraped.company}` : "",
    email ? `Email found on page: ${email}` : "No email found on page.",
    `Saved from Chrome: ${tab.title || tab.host}`,
    tab.url,
  ]
    .filter(Boolean)
    .join("\n");

  const created = await restJson("leads", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      organization_id: state.organizationId,
      created_by: state.user.id,
      name: name.slice(0, 160),
      company,
      email,
      website: tab.url.slice(0, 500),
      notes: notes.slice(0, 4000),
      source,
      status: "new",
    }),
  });

  return {
    ok: true,
    lead: created[0] || created,
    foundEmail: Boolean(email),
    foundName: Boolean(scraped?.name || name),
  };
}

function formatElapsed(startedAt) {
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "0:00:00";
  const total = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
