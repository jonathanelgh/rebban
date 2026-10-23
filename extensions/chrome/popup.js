const app = document.getElementById("app");

let state = null;
let tick = null;
let selectedClientId = "";
let selectedProjectId = "";
let description = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setApp(html) {
  app.innerHTML = html;
}

function optionsHtml(items, selected, placeholder) {
  const opts = [`<option value="">${escapeHtml(placeholder)}</option>`];
  for (const item of items) {
    const selectedAttr = item.id === selected ? " selected" : "";
    opts.push(
      `<option value="${escapeHtml(item.id)}"${selectedAttr}>${escapeHtml(item.name)}</option>`
    );
  }
  return opts.join("");
}

function hoursStrip() {
  const today = formatHoursMinutes(state?.hours?.todayMinutes || 0);
  const week = formatHoursMinutes(state?.hours?.weekMinutes || 0);
  return `
    <div class="hours">
      <div><span>Today</span><strong>${escapeHtml(today)}</strong></div>
      <div><span>This week</span><strong>${escapeHtml(week)}</strong></div>
    </div>
  `;
}

function matchBanner() {
  if (!state?.matchedClient) return "";
  return `
    <div class="banner">
      Matched tab to <strong>${escapeHtml(state.matchedClient.name)}</strong>
      ${state.activeTab?.host ? ` · ${escapeHtml(state.activeTab.host)}` : ""}
    </div>
  `;
}

function moneyStrip() {
  const unread = state?.moneyAlerts?.unread || 0;
  const overdue = state?.moneyAlerts?.overdue || 0;
  if (!unread && !overdue) return "";
  const parts = [];
  if (unread) parts.push(`${unread} money alert${unread === 1 ? "" : "s"}`);
  if (overdue) parts.push(`${overdue} overdue`);
  return `
    <a class="money" href="${APP_URL}/notifications" target="_blank" rel="noreferrer">
      ${escapeHtml(parts.join(" · "))}
    </a>
  `;
}

function renderLogin(error) {
  setApp(`
    <div class="brand">
      <div class="logo">R.</div>
    </div>
    <h1>Rebban Timer</h1>
    <p class="sub">Log in to start and stop your timer.</p>
    <form id="login-form" class="card" style="margin-top:14px">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" required placeholder="you@company.com" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" required placeholder="Your password" />
      </div>
      <button class="btn btn-primary" type="submit">Log in</button>
      <p class="error" id="login-error">${error ? escapeHtml(error) : ""}</p>
    </form>
    <p class="hint">
      Google login: stay signed in at
      <a href="${APP_URL}/login" target="_blank" rel="noreferrer">app.rebban.com</a>
      in this browser, then reopen the extension.
    </p>
  `);

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.currentTarget.querySelector("button");
    const errorEl = document.getElementById("login-error");
    button.disabled = true;
    errorEl.textContent = "";
    try {
      await signIn(
        document.getElementById("email").value,
        document.getElementById("password").value
      );
      await boot();
    } catch (err) {
      errorEl.textContent = err.message || "Could not sign in.";
      button.disabled = false;
    }
  });
}

function projectOptions() {
  const projects = (state?.projects || []).filter(
    (project) => project.clientId === selectedClientId
  );
  return optionsHtml(projects, selectedProjectId, "Project (optional)");
}

function bindCommon() {
  const signOut = document.getElementById("signout-btn");
  if (signOut) signOut.addEventListener("click", onSignOut);
  const saveLead = document.getElementById("save-lead-btn");
  if (saveLead) saveLead.addEventListener("click", onSaveLead);
}

function renderTimer(error) {
  const running = state?.running;
  const name = state?.user?.fullName || state?.user?.email || "You";
  const canSaveLead = Boolean(state?.activeTab?.url);

  if (running) {
    description = running.description || description;
    setApp(`
      <div class="brand">
        <div class="logo">R.</div>
        <div class="user">${escapeHtml(name)}</div>
      </div>
      ${hoursStrip()}
      ${moneyStrip()}
      <div class="card">
        <div class="clock" id="clock">${formatElapsed(running.startedAt)}</div>
        <div class="meta">
          ${escapeHtml(running.clientName || "No client")}
          ${running.projectName ? ` · ${escapeHtml(running.projectName)}` : ""}
        </div>
        <div class="field">
          <label for="description">What are you working on?</label>
          <input id="description" value="${escapeHtml(description)}" placeholder="Short note" />
        </div>
        <button class="btn btn-stop" id="stop-btn" type="button">Stop timer</button>
        <p class="error" id="timer-error">${error ? escapeHtml(error) : ""}</p>
        <p class="shortcut">Shortcut: Alt+Shift+R</p>
      </div>
      <button class="btn btn-secondary" id="save-lead-btn" type="button" ${canSaveLead ? "" : "disabled"}>
        Save page as lead
      </button>
      <p class="toast" id="lead-toast"></p>
      <button class="btn btn-ghost" id="signout-btn" type="button">Sign out</button>
    `);
    document.getElementById("description").addEventListener("input", (event) => {
      description = event.target.value;
    });
    document.getElementById("stop-btn").addEventListener("click", onStop);
    bindCommon();
    startTick(running.startedAt);
    return;
  }

  stopTick();
  setApp(`
    <div class="brand">
      <div class="logo">R.</div>
      <div class="user">${escapeHtml(name)}</div>
    </div>
    ${hoursStrip()}
    ${moneyStrip()}
    ${matchBanner()}
    <div class="card">
      <div class="field">
        <label for="client">Client</label>
        <select id="client">${optionsHtml(state.clients || [], selectedClientId, "No client")}</select>
      </div>
      <div class="field">
        <label for="project">Project</label>
        <select id="project">${projectOptions()}</select>
      </div>
      <div class="field">
        <label for="description">What are you working on?</label>
        <input id="description" value="${escapeHtml(description)}" placeholder="Optional note" />
      </div>
      <button class="btn btn-primary" id="start-btn" type="button">Start timer</button>
      <p class="error" id="timer-error">${error ? escapeHtml(error) : ""}</p>
      <p class="shortcut">Shortcut: Alt+Shift+R starts last client</p>
    </div>
    <button class="btn btn-secondary" id="save-lead-btn" type="button" ${canSaveLead ? "" : "disabled"}>
      Save page as lead
    </button>
    <p class="toast" id="lead-toast"></p>
    <button class="btn btn-ghost" id="signout-btn" type="button">Sign out</button>
  `);

  document.getElementById("client").addEventListener("change", (event) => {
    selectedClientId = event.target.value;
    selectedProjectId = "";
    document.getElementById("project").innerHTML = projectOptions();
  });
  document.getElementById("project").addEventListener("change", (event) => {
    selectedProjectId = event.target.value;
  });
  document.getElementById("description").addEventListener("input", (event) => {
    description = event.target.value;
  });
  document.getElementById("start-btn").addEventListener("click", onStart);
  bindCommon();
}

function startTick(startedAt) {
  stopTick();
  const clock = document.getElementById("clock");
  tick = setInterval(() => {
    if (clock) clock.textContent = formatElapsed(startedAt);
  }, 1000);
}

function stopTick() {
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
}

function pickInitialSelection(next) {
  if (next.running) {
    selectedClientId = next.running.clientId || "";
    selectedProjectId = next.running.projectId || "";
    description = next.running.description || "";
    return;
  }

  if (next.matchedClient?.id) {
    selectedClientId = next.matchedClient.id;
    const prefsProject = next.lastPrefs?.projectId || "";
    selectedProjectId =
      prefsProject &&
      next.projects.some(
        (p) => p.id === prefsProject && p.clientId === selectedClientId
      )
        ? prefsProject
        : "";
    description = next.lastPrefs?.description || "";
    return;
  }

  selectedClientId = next.lastPrefs?.clientId || "";
  selectedProjectId =
    selectedClientId &&
    next.lastPrefs?.projectId &&
    next.projects.some(
      (p) => p.id === next.lastPrefs.projectId && p.clientId === selectedClientId
    )
      ? next.lastPrefs.projectId
      : "";
  description = next.lastPrefs?.description || "";
}

async function onStart() {
  const button = document.getElementById("start-btn");
  const errorEl = document.getElementById("timer-error");
  button.disabled = true;
  errorEl.textContent = "";
  try {
    await startTimer({
      clientId: selectedClientId || null,
      projectId: selectedProjectId || null,
      description,
    });
    chrome.runtime.sendMessage({ type: "rebban-timer-sync" });
    await boot();
  } catch (err) {
    errorEl.textContent = err.message || "Could not start timer.";
    button.disabled = false;
  }
}

async function onStop() {
  const button = document.getElementById("stop-btn");
  const errorEl = document.getElementById("timer-error");
  if (!description.trim()) {
    errorEl.textContent = "Add a short note about what you worked on.";
    return;
  }
  button.disabled = true;
  errorEl.textContent = "";
  try {
    await stopTimer(description.trim());
    description = "";
    chrome.runtime.sendMessage({ type: "rebban-timer-sync" });
    await boot();
  } catch (err) {
    errorEl.textContent = err.message || "Could not stop timer.";
    button.disabled = false;
  }
}

async function onSaveLead() {
  const button = document.getElementById("save-lead-btn");
  const toast = document.getElementById("lead-toast");
  if (!button || !toast) return;
  button.disabled = true;
  toast.textContent = "Looking up name & email…";
  toast.className = "toast";
  try {
    const result = await savePageAsLead();
    if (result.foundEmail) {
      toast.textContent = "Lead saved with name and email.";
    } else {
      toast.textContent = "Lead saved. No email found on this page.";
    }
    toast.className = "toast ok";
  } catch (err) {
    toast.textContent = err.message || "Could not save lead.";
    toast.className = "toast error";
  } finally {
    button.disabled = !state?.activeTab?.url;
  }
}

async function onSignOut() {
  await clearSession();
  chrome.runtime.sendMessage({ type: "rebban-timer-sync" });
  renderLogin();
}

async function boot() {
  stopTick();
  setApp(`<div class="status">Loading…</div>`);
  try {
    const session = await getStoredSession();
    if (!session.accessToken) {
      await importBrowserSession();
    }
    const next = await loadTimer();
    if (next.unauthorized) {
      renderLogin();
      return;
    }
    state = next;
    pickInitialSelection(next);
    renderTimer();
    chrome.runtime.sendMessage({ type: "rebban-timer-sync" });
  } catch (err) {
    renderLogin(err.message);
  }
}

void boot();
