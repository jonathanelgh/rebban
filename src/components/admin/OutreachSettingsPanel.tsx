"use client";

import React, { useEffect, useState } from "react";
import type { Database } from "@/types/database";

type Settings = Database["public"]["Tables"]["outreach_settings"]["Row"];

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

export function OutreachSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [gmail, setGmail] = useState<{
    configured: boolean;
    connected: boolean;
    email: string | null;
    connectedAt: string | null;
    lastSyncAt: string | null;
    canSend: boolean;
    canRead: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get("gmail");
    if (g === "connected") setNotice("Outreach Gmail connected.");
    if (g === "error") {
      setError(params.get("message") || "Gmail connection failed.");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [settingsRes, gmailRes] = await Promise.all([
        fetch("/api/admin/outreach-settings"),
        fetch("/api/admin/outreach-gmail/status"),
      ]);
      const settingsJson = await settingsRes.json().catch(() => ({}));
      const gmailJson = await gmailRes.json().catch(() => ({}));
      if (cancelled) return;
      if (!settingsRes.ok) {
        setError(settingsJson.error || "Could not load settings.");
        return;
      }
      setSettings(settingsJson.settings as Settings);
      if (gmailRes.ok) setGmail(gmailJson);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/admin/outreach-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sending_enabled: settings.sending_enabled,
        daily_send_limit: settings.daily_send_limit,
        allowed_weekdays: settings.allowed_weekdays,
        send_window_start: settings.send_window_start,
        send_window_end: settings.send_window_end,
        timezone: settings.timezone,
        max_follow_ups: settings.max_follow_ups,
        follow_up_1_days: settings.follow_up_1_days,
        follow_up_2_days: settings.follow_up_2_days,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Save failed.");
      return;
    }
    setSettings(json.settings as Settings);
    setNotice("Settings saved.");
    setError(null);
  }

  async function disconnect() {
    setBusy(true);
    const res = await fetch("/api/admin/outreach-gmail/disconnect", {
      method: "POST",
    });
    setBusy(false);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "Disconnect failed.");
      return;
    }
    setGmail((g) =>
      g
        ? {
            ...g,
            connected: false,
            email: null,
            canSend: false,
            canRead: false,
          }
        : g
    );
    setNotice("Outreach Gmail disconnected.");
  }

  async function syncAll() {
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/admin/leads/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analyze: true }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(json.error || "Sync failed.");
      return;
    }
    const syncErrors = Array.isArray(json.errors)
      ? (json.errors as string[])
      : [];
    if (syncErrors.length) {
      setError(syncErrors[0]);
    }
    setNotice(
      `Sync complete · ${json.imported ?? 0} new · ${json.analyzed ?? 0} analyzed` +
        (json.pendingAnalysis
          ? ` · ${json.pendingAnalysis} waiting on OPENAI_API_KEY`
          : "")
    );
    setError(null);
    // Refresh status for last sync time
    const statusRes = await fetch("/api/admin/outreach-gmail/status");
    if (statusRes.ok) {
      const statusJson = await statusRes.json();
      setGmail(statusJson);
    }
  }

  function toggleDay(day: number) {
    if (!settings) return;
    const set = new Set(settings.allowed_weekdays || []);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    setSettings({
      ...settings,
      allowed_weekdays: Array.from(set).sort((a, b) => a - b),
    });
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-[13px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3.5 py-2.5">
          {notice}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="rounded-2xl border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Connected Gmail
          </h3>
          {!gmail ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-3">
              <div className="text-sm">
                <div className="text-[12px] text-gray-400">Account</div>
                <div className="font-medium text-gray-900">
                  {gmail.email || "Not connected"}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[12px] text-gray-400">Status</div>
                <div className="font-medium text-gray-900">
                  {!gmail.configured
                    ? "OAuth not configured"
                    : gmail.connected && gmail.canSend
                      ? "Connected"
                      : gmail.connected
                        ? "Connected (missing send scope)"
                        : "Disconnected"}
                </div>
              </div>
              <div className="text-sm">
                <div className="text-[12px] text-gray-400">Last sync</div>
                <div className="text-gray-700">
                  {gmail.lastSyncAt
                    ? new Date(gmail.lastSyncAt).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  disabled={!gmail.configured || busy}
                  onClick={() => {
                    window.location.href = "/api/admin/outreach-gmail/connect";
                  }}
                  className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white disabled:opacity-40"
                >
                  {gmail.connected ? "Reconnect" : "Connect Gmail"}
                </button>
                {gmail.connected && (
                  <>
                    <button
                      type="button"
                      disabled={busy || !gmail.canRead}
                      onClick={() => void syncAll()}
                      className="px-3.5 py-2 rounded-xl text-sm font-medium border border-line"
                    >
                      Sync replies now
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void disconnect()}
                      className="px-3.5 py-2 rounded-xl text-sm font-medium border border-line"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
              <p className="text-[12px] text-gray-400 pt-1">
                Separate from freelancer Gmail. Add{" "}
                <code className="text-[11px]">
                  /api/admin/outreach-gmail/callback
                </code>{" "}
                to Google OAuth redirect URIs.
              </p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-line bg-white p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            Daily send controls
          </h3>
          {!settings ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : (
            <div className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings.sending_enabled}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      sending_enabled: e.target.checked,
                    })
                  }
                />
                Sending enabled (queue processor — Phase 2)
              </label>
              <label className="block">
                <span className="text-[12px] font-medium text-gray-500">
                  Daily email limit
                </span>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.daily_send_limit}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      daily_send_limit: Number(e.target.value) || 20,
                    })
                  }
                  className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <div>
                <div className="text-[12px] font-medium text-gray-500 mb-2">
                  Allowed weekdays
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border ${
                        settings.allowed_weekdays?.includes(d.value)
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-600 border-line"
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12px] font-medium text-gray-500">
                    Window start
                  </span>
                  <input
                    type="time"
                    value={String(settings.send_window_start).slice(0, 5)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        send_window_start: e.target.value,
                      })
                    }
                    className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-medium text-gray-500">
                    Window end
                  </span>
                  <input
                    type="time"
                    value={String(settings.send_window_end).slice(0, 5)}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        send_window_end: e.target.value,
                      })
                    }
                    className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[12px] font-medium text-gray-500">
                  Timezone
                </span>
                <input
                  value={settings.timezone}
                  onChange={(e) =>
                    setSettings({ ...settings, timezone: e.target.value })
                  }
                  className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-[12px] font-medium text-gray-500">
                    Max follow-ups
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={5}
                    value={settings.max_follow_ups}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        max_follow_ups: Number(e.target.value) || 0,
                      })
                    }
                    className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-medium text-gray-500">
                    Days → FU1
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={settings.follow_up_1_days}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        follow_up_1_days: Number(e.target.value) || 4,
                      })
                    }
                    className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-[12px] font-medium text-gray-500">
                    Days → FU2
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={settings.follow_up_2_days}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        follow_up_2_days: Number(e.target.value) || 7,
                      })
                    }
                    className="mt-1 w-full border border-line rounded-xl px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void save()}
                className="px-3.5 py-2 rounded-xl text-sm font-medium bg-gray-900 text-white disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save settings"}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
