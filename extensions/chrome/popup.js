const app = document.getElementById("app");

let state = null;
let tick = null;
let selectedClientId = "";
let selectedProjectId = "";
let description = "";
let activeView = "timer"; // timer | bid
let bidJobText = "";
let bidPlatform = "upwork";
let bidContext = "marketplace"; // marketplace | email | web
let bidSourceMode = "page"; // page | paste
let bidPageStatus = "";
let bidPageLoading = false;
let bidPageTitle = "";
let bidPageUrl = "";
let bidContactEmail = "";
let bidContactName = "";
let bidPartyOptions = [];
let bidPartyKey = "new"; // new | client:uuid | lead:uuid
let bidPartyMatched = false;
let bidPartyLoading = false;
let bidProfile = {
  services: "",
  experience: "",
  skills: "",
  rates: "",
  portfolio: "",
};
let bidProfileIncomplete = true;
let bidShowProfile = false;
let bidDraft = "";
let bidJobTitle = "";
let bidResultMode = ""; // bid | proposal
let bidProposalUrl = "";
let bidProposalMeta = "";
let bidBusy = false;
let bidError = "";
let bidToast = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setApp(html, { dock = false } = {}) {
  app.classList.toggle("has-dock", Boolean(dock));
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

function tabsHtml() {
  return `
    <div class="tabs" role="tablist">
      <button type="button" class="tab ${activeView === "timer" ? "active" : ""}" data-view="timer">Timer</button>
      <button type="button" class="tab ${activeView === "bid" ? "active" : ""}" data-view="bid">Proposal</button>
    </div>
  `;
}

function contextLabel() {
  if (bidContext === "marketplace") {
    return bidPlatform === "freelancer"
      ? "Freelancer.com → copy proposal"
      : "Upwork → copy proposal";
  }
  if (bidContext === "email") return "Email → Rebban proposal";
  return "Page → Rebban proposal";
}

function primaryDraftLabel() {
  if (bidBusy) {
    return bidContext === "marketplace" ? "Drafting…" : "Creating proposal…";
  }
  return bidContext === "marketplace"
    ? "Draft proposal"
    : "Create proposal in Rebban";
}

function bindTabs() {
  for (const button of document.querySelectorAll(".tabs:not(.source-tabs) .tab[data-view]")) {
    button.addEventListener("click", () => {
      const next = button.getAttribute("data-view") || "timer";
      if (next === activeView) return;
      activeView = next;
      renderAuthed();
      if (activeView === "bid" && bidSourceMode === "page") {
        void refreshJobFromPage();
      }
    });
  }
}

function renderLogin(error) {
  setApp(`
    <div class="brand">
      <div class="logo">R.</div>
    </div>
    <h1>Rebban</h1>
    <p class="sub">Log in to use the timer and draft proposals.</p>
    <form id="login-form" class="card" style="margin-top:14px">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" required placeholder="you@company.com" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" required placeholder="••••••••" />
      </div>
      <button class="btn btn-primary" type="submit">Sign in</button>
      <p class="error" id="login-error">${error ? escapeHtml(error) : ""}</p>
    </form>
    <p class="hint">
      Or stay signed in at
      <a href="${APP_URL}/login" target="_blank" rel="noreferrer">app.rebban.com</a>
      in this Chrome profile.
    </p>
  `);

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = event.target.querySelector("button");
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

function floatingDock(buttonHtml) {
  return `
    <div class="dock">
      <div class="dock-inner">${buttonHtml}</div>
    </div>
  `;
}

function renderTimer(error) {
  const running = state?.running;
  const name = state?.user?.fullName || state?.user?.email || "You";
  const canSaveLead = Boolean(state?.activeTab?.url);

  if (running) {
    description = running.description || description;
    setApp(
      `
      <div class="brand">
        <div class="logo">R.</div>
        <div class="user">${escapeHtml(name)}</div>
      </div>
      ${tabsHtml()}
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
        <p class="error" id="timer-error">${error ? escapeHtml(error) : ""}</p>
        <p class="shortcut">Shortcut: Alt+Shift+R</p>
      </div>
      <div class="stack-gap">
        <button class="btn btn-secondary" id="save-lead-btn" type="button" ${canSaveLead ? "" : "disabled"}>
          Save page as lead
        </button>
        <p class="toast" id="lead-toast"></p>
        <button class="btn btn-ghost" id="signout-btn" type="button">Sign out</button>
      </div>
      ${floatingDock(`<button class="btn btn-stop" id="stop-btn" type="button">Stop timer</button>`)}
    `,
      { dock: true }
    );
    document.getElementById("description").addEventListener("input", (event) => {
      description = event.target.value;
    });
    document.getElementById("stop-btn").addEventListener("click", onStop);
    bindTabs();
    bindCommon();
    startTick(running.startedAt);
    return;
  }

  stopTick();
  setApp(
    `
    <div class="brand">
      <div class="logo">R.</div>
      <div class="user">${escapeHtml(name)}</div>
    </div>
    ${tabsHtml()}
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
      <p class="error" id="timer-error">${error ? escapeHtml(error) : ""}</p>
      <p class="shortcut">Shortcut: Alt+Shift+R starts last client</p>
    </div>
    <div class="stack-gap">
      <button class="btn btn-secondary" id="save-lead-btn" type="button" ${canSaveLead ? "" : "disabled"}>
        Save page as lead
      </button>
      <p class="toast" id="lead-toast"></p>
      <button class="btn btn-ghost" id="signout-btn" type="button">Sign out</button>
    </div>
    ${floatingDock(`<button class="btn btn-primary" id="start-btn" type="button">Start timer</button>`)}
  `,
    { dock: true }
  );

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
  bindTabs();
  bindCommon();
}

function platformOptionsHtml() {
  const options = [
    { id: "upwork", name: "Upwork" },
    { id: "freelancer", name: "Freelancer.com" },
    { id: "other", name: "Other marketplace" },
  ];
  return options
    .map((item) => {
      const selected = item.id === bidPlatform ? " selected" : "";
      return `<option value="${escapeHtml(item.id)}"${selected}>${escapeHtml(item.name)}</option>`;
    })
    .join("");
}

function bidSourceTabsHtml() {
  return `
    <div class="tabs source-tabs" role="tablist">
      <button type="button" class="tab ${bidSourceMode === "page" ? "active" : ""}" data-source="page">From this page</button>
      <button type="button" class="tab ${bidSourceMode === "paste" ? "active" : ""}" data-source="paste">Paste</button>
    </div>
  `;
}

function partyOptionsHtml() {
  const clients = bidPartyOptions.filter((o) => o.kind === "client");
  const leads = bidPartyOptions.filter((o) => o.kind === "lead");
  const parts = [
    `<option value="new"${bidPartyKey === "new" ? " selected" : ""}>Create new lead…</option>`,
  ];
  if (clients.length) {
    parts.push(`<optgroup label="Clients">`);
    for (const option of clients) {
      const label = [option.name, option.email].filter(Boolean).join(" · ");
      parts.push(
        `<option value="${escapeHtml(option.key)}"${
          option.key === bidPartyKey ? " selected" : ""
        }>${escapeHtml(label)}</option>`
      );
    }
    parts.push(`</optgroup>`);
  }
  if (leads.length) {
    parts.push(`<optgroup label="Leads">`);
    for (const option of leads) {
      const label = [option.name, option.email].filter(Boolean).join(" · ");
      parts.push(
        `<option value="${escapeHtml(option.key)}"${
          option.key === bidPartyKey ? " selected" : ""
        }>${escapeHtml(label)}</option>`
      );
    }
    parts.push(`</optgroup>`);
  }
  return parts.join("");
}

function partyStatusHtml() {
  if (bidPartyLoading) {
    return `<p class="toast">Checking clients &amp; leads…</p>`;
  }
  if (bidPartyKey === "new") {
    const who = bidContactEmail || bidContactName || "this contact";
    return `<div class="banner">Not in your workspace yet — will create a new lead for <strong>${escapeHtml(who)}</strong>.</div>`;
  }
  const selected = bidPartyOptions.find((o) => o.key === bidPartyKey);
  if (!selected) return "";
  const kind = selected.kind === "client" ? "client" : "lead";
  return `<div class="banner">Matched existing ${kind}: <strong>${escapeHtml(selected.name)}</strong>${
    bidPartyMatched ? " (from email)" : ""
  }.</div>`;
}

function resetBidComposer({ refreshPage = true } = {}) {
  bidDraft = "";
  bidJobTitle = "";
  bidResultMode = "";
  bidProposalUrl = "";
  bidProposalMeta = "";
  bidBusy = false;
  bidError = "";
  bidToast = "";
  bidJobText = "";
  bidPageStatus = "";
  bidPageTitle = "";
  bidPageUrl = "";
  bidContactEmail = "";
  bidContactName = "";
  bidPartyOptions = [];
  bidPartyKey = "new";
  bidPartyMatched = false;
  bidPartyLoading = false;
  bidShowProfile = false;
  renderBid();
  if (refreshPage && bidSourceMode === "page") {
    void refreshJobFromPage();
  }
}

function bidDoneHtml() {
  if (bidResultMode === "proposal" && bidProposalUrl) {
    return `
      <div class="card bid-result bid-done">
        <p class="done-kicker">Proposal created</p>
        <p class="page-title">${escapeHtml(bidJobTitle || "Draft proposal ready")}</p>
        ${bidProposalMeta ? `<p class="toast ok">${escapeHtml(bidProposalMeta)}</p>` : ""}
        <a class="btn btn-primary" style="display:block;text-align:center;text-decoration:none;margin-top:12px" href="${escapeHtml(bidProposalUrl)}" target="_blank" rel="noreferrer">Open in Rebban</a>
        <button class="btn btn-secondary" id="bid-new-btn" type="button" style="margin-top:8px">Create another</button>
      </div>
    `;
  }
  if (bidResultMode === "bid" && bidDraft) {
    return `
      <div class="card bid-result bid-done">
        <p class="done-kicker">Proposal text ready</p>
        ${bidJobTitle ? `<p class="page-title">${escapeHtml(bidJobTitle)}</p>` : ""}
        <label for="bid-output">Copy into the application</label>
        <textarea id="bid-output" rows="12" readonly>${escapeHtml(bidDraft)}</textarea>
        <button class="btn btn-secondary" id="bid-copy-btn" type="button">Copy to clipboard</button>
        <p class="toast ${bidToast ? "ok" : ""}" id="bid-toast">${escapeHtml(bidToast)}</p>
        <button class="btn btn-primary" id="bid-new-btn" type="button" style="margin-top:8px">Create another</button>
      </div>
    `;
  }
  return "";
}

function renderBid() {
  stopTick();
  const name = state?.user?.fullName || state?.user?.email || "You";
  const showProfile = bidShowProfile;
  const fromPage = bidSourceMode === "page";
  const isMarketplace = bidContext === "marketplace";
  const doneHtml = bidDoneHtml();
  const isDone = Boolean(doneHtml);
  setApp(`
    <div class="brand">
      <div class="logo">R.</div>
      <div class="user">${escapeHtml(name)}</div>
    </div>
    ${tabsHtml()}
    ${
      isDone
        ? doneHtml
        : `
    <div class="card">
      ${bidSourceTabsHtml()}
      <div class="banner">${escapeHtml(contextLabel())}</div>
      ${
        isMarketplace
          ? `
        <div class="field">
          <label for="bid-platform">Platform</label>
          <select id="bid-platform">${platformOptionsHtml()}</select>
        </div>
      `
          : `
        ${
          bidPartyKey === "new"
            ? `
        <div class="field">
          <label for="bid-contact-name">Contact name</label>
          <input id="bid-contact-name" value="${escapeHtml(bidContactName)}" placeholder="From email sender" />
        </div>
        <div class="field">
          <label for="bid-contact-email">Contact email</label>
          <input id="bid-contact-email" type="email" value="${escapeHtml(bidContactEmail)}" placeholder="name@company.com" />
        </div>
        `
            : ""
        }
        <div class="field">
          <label for="bid-party">Client / lead</label>
          <select id="bid-party">${partyOptionsHtml()}</select>
        </div>
        ${partyStatusHtml()}
      `
      }
      ${
        fromPage
          ? `
        <div class="field">
          <div class="row-between">
            <label>${isMarketplace ? "Job from this page" : "Brief from this page"}</label>
            <button type="button" class="btn-link inline" id="bid-refresh-page">Refresh</button>
          </div>
          ${
            bidPageLoading
              ? `<p class="toast">Reading this page…</p>`
              : bidPageStatus
                ? `<p class="toast ${bidJobText ? "ok" : "error"}">${escapeHtml(bidPageStatus)}</p>`
                : ""
          }
          ${
            bidPageTitle
              ? `<p class="page-title">${escapeHtml(bidPageTitle)}</p>`
              : ""
          }
          <textarea id="bid-job" rows="8" ${bidPageLoading ? "disabled" : ""} placeholder="Reads the page you’re on…">${escapeHtml(bidJobText)}</textarea>
        </div>
      `
          : `
        <div class="field">
          <label for="bid-job">${isMarketplace ? "Job description" : "Brief / email text"}</label>
          <textarea id="bid-job" rows="8" placeholder="Paste the text here…">${escapeHtml(bidJobText)}</textarea>
        </div>
      `
      }
      <button class="btn btn-link" id="bid-toggle-profile" type="button">
        ${showProfile ? "Hide proposal profile" : "Proposal profile"}
      </button>
      ${
        showProfile
          ? `
        <div class="profile-fields">
          <div class="field">
            <label for="bid-services">What you do / services</label>
            <textarea id="bid-services" rows="3" placeholder="Product design, SaaS UX, brand systems…">${escapeHtml(bidProfile.services)}</textarea>
          </div>
          <div class="field">
            <label for="bid-experience">Experience / CV summary</label>
            <textarea id="bid-experience" rows="4" placeholder="Years, roles, outcomes…">${escapeHtml(bidProfile.experience)}</textarea>
          </div>
          <div class="field">
            <label for="bid-skills">Skills &amp; stack</label>
            <textarea id="bid-skills" rows="2" placeholder="Figma, React, Next.js…">${escapeHtml(bidProfile.skills)}</textarea>
          </div>
          <div class="field">
            <label for="bid-rates">Rates &amp; pricing notes</label>
            <textarea id="bid-rates" rows="2" placeholder="Hourly range, fixed-price prefs…">${escapeHtml(bidProfile.rates)}</textarea>
          </div>
          <div class="field">
            <label for="bid-portfolio">Portfolio / proof links</label>
            <textarea id="bid-portfolio" rows="2" placeholder="Only real links">${escapeHtml(bidProfile.portfolio)}</textarea>
          </div>
          <button class="btn btn-secondary" id="bid-save-profile" type="button">Save profile</button>
        </div>
      `
          : ""
      }
      <button class="btn btn-primary" id="bid-draft-btn" type="button" ${bidBusy || bidPageLoading ? "disabled" : ""}>
        ${escapeHtml(primaryDraftLabel())}
      </button>
      <p class="error" id="bid-error">${bidError ? escapeHtml(bidError) : ""}</p>
      <p class="toast" id="bid-profile-toast"></p>
    </div>
    `
    }
    <button class="btn btn-ghost" id="signout-btn" type="button">Sign out</button>
  `);

  const newBtn = document.getElementById("bid-new-btn");
  if (newBtn) {
    newBtn.addEventListener("click", () => resetBidComposer());
  }
  const copyBtn = document.getElementById("bid-copy-btn");
  if (copyBtn) copyBtn.addEventListener("click", onCopyBid);

  if (!isDone) {
    for (const button of document.querySelectorAll(".source-tabs .tab[data-source]")) {
      button.addEventListener("click", () => {
        const next = button.getAttribute("data-source") || "page";
        if (next === bidSourceMode) return;
        bidSourceMode = next;
        bidError = "";
        bidPageStatus = "";
        renderBid();
        if (bidSourceMode === "page") void refreshJobFromPage();
      });
    }

    const platformEl = document.getElementById("bid-platform");
    if (platformEl) {
      platformEl.addEventListener("change", (event) => {
        bidPlatform = event.target.value;
        bidContext = "marketplace";
        renderBid();
      });
    }
    const contactNameEl = document.getElementById("bid-contact-name");
    if (contactNameEl) {
      contactNameEl.addEventListener("input", (event) => {
        bidContactName = event.target.value;
      });
      contactNameEl.addEventListener("change", () => {
        if (bidPartyKey === "new") renderBid();
      });
    }
    const contactEmailEl = document.getElementById("bid-contact-email");
    if (contactEmailEl) {
      contactEmailEl.addEventListener("change", () => {
        bidContactEmail = contactEmailEl.value;
        void refreshPartyOptions();
      });
      contactEmailEl.addEventListener("input", (event) => {
        bidContactEmail = event.target.value;
      });
    }
    const partyEl = document.getElementById("bid-party");
    if (partyEl) {
      partyEl.addEventListener("change", (event) => {
        bidPartyKey = event.target.value || "new";
        bidPartyMatched = false;
        const selected = bidPartyOptions.find((o) => o.key === bidPartyKey);
        if (selected) {
          if (selected.name) bidContactName = selected.name;
          if (selected.email) bidContactEmail = selected.email;
        }
        renderBid();
      });
    }
    const jobEl = document.getElementById("bid-job");
    if (jobEl) {
      jobEl.addEventListener("input", (event) => {
        bidJobText = event.target.value;
      });
    }
    const refreshBtn = document.getElementById("bid-refresh-page");
    if (refreshBtn) {
      refreshBtn.addEventListener("click", () => void refreshJobFromPage());
    }
    const toggleProfileBtn = document.getElementById("bid-toggle-profile");
    if (toggleProfileBtn) {
      toggleProfileBtn.addEventListener("click", () => {
        bidShowProfile = !showProfile;
        renderBid();
      });
    }
    const bindProfileField = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("input", (event) => {
        bidProfile = { ...bidProfile, [key]: event.target.value };
      });
    };
    bindProfileField("bid-services", "services");
    bindProfileField("bid-experience", "experience");
    bindProfileField("bid-skills", "skills");
    bindProfileField("bid-rates", "rates");
    bindProfileField("bid-portfolio", "portfolio");
    const saveProfileBtn = document.getElementById("bid-save-profile");
    if (saveProfileBtn) saveProfileBtn.addEventListener("click", onSaveBidProfile);
    const draftBtn = document.getElementById("bid-draft-btn");
    if (draftBtn) draftBtn.addEventListener("click", onDraftBid);
  }
  bindTabs();
  bindCommon();
}

async function refreshPartyOptions() {
  if (bidContext === "marketplace") return;
  bidPartyLoading = true;
  renderBid();
  try {
    const result = await loadPartyOptions(bidContactEmail);
    bidPartyOptions = result.options || [];
    bidPartyKey = result.selectedKey || "new";
    bidPartyMatched = Boolean(result.matched);
    if (bidPartyMatched) {
      const selected = bidPartyOptions.find((o) => o.key === bidPartyKey);
      if (selected?.name && !bidContactName) bidContactName = selected.name;
    }
  } catch {
    bidPartyOptions = [];
    bidPartyKey = "new";
    bidPartyMatched = false;
  } finally {
    bidPartyLoading = false;
    renderBid();
  }
}

async function refreshJobFromPage() {
  if (bidSourceMode !== "page") return;
  bidPageLoading = true;
  bidPageStatus = "";
  bidError = "";
  renderBid();
  try {
    const job = await scrapeActiveTabJob();
    bidJobText = job.text;
    bidPageTitle = job.title || "";
    bidPageUrl = job.url || "";
    bidContext = job.context || "web";
    bidPlatform = job.platform || bidPlatform;
    bidContactEmail = job.contactEmail || "";
    bidContactName = job.contactName || "";
    if (bidContext === "marketplace") {
      bidPageStatus = "Loaded marketplace job. Draft proposal text to copy.";
    } else if (bidContext === "email") {
      bidPageStatus = bidContactEmail
        ? `Loaded email from ${bidContactEmail}.`
        : "Loaded email. Add the contact email if missing.";
    } else {
      bidPageStatus = "Loaded page text.";
    }
  } catch (err) {
    bidPageStatus = err.message || "Could not read this page.";
    bidPageTitle = "";
  } finally {
    bidPageLoading = false;
    renderBid();
    if (bidContext !== "marketplace") {
      void refreshPartyOptions();
    }
  }
}

function renderAuthed(error) {
  if (activeView === "bid") {
    renderBid();
    return;
  }
  renderTimer(error);
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

async function onSaveBidProfile() {
  const toast = document.getElementById("bid-profile-toast");
  try {
    const result = await saveMarketplaceProfile(bidProfile);
    bidProfile = { ...bidProfile, ...(result.profile || {}) };
    bidProfileIncomplete = Boolean(result.profileIncomplete);
    if (toast) {
      toast.textContent = "Profile saved to your Rebban account.";
      toast.className = "toast ok";
    }
  } catch (err) {
    if (toast) {
      toast.textContent = err.message || "Could not save profile.";
      toast.className = "toast error";
    }
  }
}

async function onDraftBid() {
  bidError = "";
  bidToast = "";
  bidBusy = true;
  bidResultMode = "";
  bidProposalUrl = "";
  bidProposalMeta = "";
  renderBid();
  try {
    const result = await draftFromPage({
      text: bidJobText,
      platform: bidPlatform,
      context: bidContext,
      pageUrl: bidPageUrl || null,
      title: bidPageTitle || null,
      contactEmail: bidContactEmail || null,
      contactName: bidContactName || null,
      partyKey: bidPartyKey || "new",
      profile: bidProfile,
    });

    if (result.mode === "proposal") {
      bidResultMode = "proposal";
      bidDraft = "";
      bidJobTitle = result.title || bidPageTitle || "";
      bidProposalUrl = result.url || "";
      const bits = [];
      if (result.clientName) bits.push(result.clientName);
      if (result.createdLead) bits.push("new lead");
      else if (result.leadId && !result.clientId) bits.push("lead");
      else if (result.clientId) bits.push("client");
      bidProposalMeta = bits.length
        ? `Saved draft for ${bits.join(" · ")}`
        : "Draft proposal saved in Rebban.";
    } else {
      bidResultMode = "bid";
      bidDraft = result.draft || "";
      bidJobTitle = result.jobTitle || bidPageTitle || "";
      bidProposalUrl = "";
    }
  } catch (err) {
    bidError = err.message || "Could not draft.";
  } finally {
    bidBusy = false;
    renderBid();
  }
}

async function onCopyBid() {
  const toast = document.getElementById("bid-toast");
  try {
    await navigator.clipboard.writeText(bidDraft);
    bidToast = "Copied. Paste into the job application.";
    if (toast) {
      toast.textContent = bidToast;
      toast.className = "toast ok";
    }
  } catch {
    bidToast = "Could not copy. Select the draft and copy manually.";
    if (toast) {
      toast.textContent = bidToast;
      toast.className = "toast error";
    }
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
    const [next, bidPrefs] = await Promise.all([loadTimer(), getBidPrefs()]);
    if (next.unauthorized) {
      renderLogin();
      return;
    }
    state = next;
    bidPlatform = bidPrefs.platform || bidPlatform;
    pickInitialSelection(next);
    const loaded = await loadMarketplaceProfile();
    bidProfile = { ...emptyMarketplaceProfile(), ...loaded.profile };
    bidProfileIncomplete = Boolean(loaded.profileIncomplete);
    bidShowProfile = false;
    renderAuthed();
    chrome.runtime.sendMessage({ type: "rebban-timer-sync" });
  } catch (err) {
    renderLogin(err.message);
  }
}

void boot();
