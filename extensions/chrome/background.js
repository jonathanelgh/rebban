importScripts("config.js", "api.js");

async function setBadge(text, color = "#111827") {
  await chrome.action.setBadgeBackgroundColor({ color });
  try {
    await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  } catch {
    /* older Chrome */
  }
  await chrome.action.setBadgeText({ text: text || "" });
}

async function syncBadge() {
  try {
    const state = await loadTimer();
    if (state.unauthorized) {
      await setBadge("");
      return;
    }

    if (state.running) {
      const start = new Date(state.running.startedAt).getTime();
      const minutes = Number.isFinite(start)
        ? Math.max(0, Math.floor((Date.now() - start) / 60000))
        : 0;
      await setBadge(
        minutes >= 60 ? `${Math.floor(minutes / 60)}h` : `${minutes}m`,
        "#111827"
      );
      return;
    }

    const moneyCount =
      (state.moneyAlerts?.unread || 0) + (state.moneyAlerts?.overdue || 0);
    if (moneyCount > 0) {
      await setBadge(moneyCount > 9 ? "9+" : String(moneyCount), "#059669");
      return;
    }

    await setBadge("");
  } catch {
    await setBadge("");
  }
}

async function notify(title, message) {
  try {
    if (!chrome.notifications) return;
    await chrome.notifications.create(`rebban-${Date.now()}`, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title,
      message,
      priority: 0,
    });
  } catch {
    /* notifications optional */
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("rebban-timer-badge", { periodInMinutes: 1 });
  void syncBadge();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create("rebban-timer-badge", { periodInMinutes: 1 });
  void syncBadge();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "rebban-timer-badge") void syncBadge();
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "toggle-timer") return;
  void (async () => {
    try {
      const result = await toggleTimerFromShortcut();
      await syncBadge();
      if (!result.ok) {
        await notify("Rebban Timer", result.error || "Could not toggle timer.");
        return;
      }
      if (result.action === "started") {
        await notify(
          "Timer started",
          result.clientName
            ? `Tracking ${result.clientName}`
            : "Tracking time in Rebban"
        );
      } else {
        await notify("Timer stopped", "Time saved to Rebban");
      }
    } catch (err) {
      await notify("Rebban Timer", err.message || "Could not toggle timer.");
    }
  })();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "rebban-timer-sync") {
    void syncBadge();
    return;
  }
  if (message?.type === "rebban-toggle-timer") {
    void (async () => {
      try {
        const result = await toggleTimerFromShortcut();
        await syncBadge();
        sendResponse(result);
      } catch (err) {
        sendResponse({ ok: false, error: err.message || "Could not toggle timer." });
      }
    })();
    return true;
  }
});
