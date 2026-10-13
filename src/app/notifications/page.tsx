"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  CheckCircle2,
  Eye,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function formatAlertTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = Date.now();
  const diffMs = now - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfThatDay = new Date(date);
  startOfThatDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return `${dayDiff}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function alertIconForType(type: string): LucideIcon {
  switch (type) {
    case "proposal_sent":
      return Send;
    case "proposal_opened":
      return Eye;
    case "proposal_signed":
      return CheckCircle2;
    case "proposal_declined":
      return XCircle;
    default:
      return Bell;
  }
}

export default function NotificationsPage() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAlerts() {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);

    setAlerts((data as NotificationRow[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAlerts();
  }, []);

  const unreadCount = alerts.filter((a) => !a.read_at).length;

  async function markAllRead() {
    const unreadIds = alerts.filter((a) => !a.read_at).map((a) => a.id);
    if (unreadIds.length === 0) return;

    const now = new Date().toISOString();
    setAlerts((prev) =>
      prev.map((a) => (a.read_at ? a : { ...a, read_at: now }))
    );

    const supabase = createClient();
    await supabase
      .from("notifications")
      .update({ read_at: now })
      .in("id", unreadIds)
      .is("read_at", null);
  }

  async function openAlert(alert: NotificationRow) {
    if (!alert.read_at) {
      const now = new Date().toISOString();
      setAlerts((prev) =>
        prev.map((a) => (a.id === alert.id ? { ...a, read_at: now } : a))
      );
      const supabase = createClient();
      await supabase
        .from("notifications")
        .update({ read_at: now })
        .eq("id", alert.id);
    }
    if (alert.link) router.push(alert.link);
  }

  return (
    <div className="px-8 py-8 max-w-3xl">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
            Alerts
          </h1>
          <p className="text-[15px] text-gray-500 mt-1">
            {loading
              ? "Loading…"
              : unreadCount === 0
                ? "All caught up"
                : `${unreadCount} unread`}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => {
              void markAllRead();
            }}
            className="text-[14px] font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white">
        {loading && (
          <div className="px-5 py-10 text-center text-[14px] text-gray-500">
            Loading alerts…
          </div>
        )}
        {!loading && alerts.length === 0 && (
          <div className="px-5 py-12 text-center">
            <div className="mx-auto w-11 h-11 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center mb-3">
              <Bell className="w-5 h-5" strokeWidth={1.75} />
            </div>
            <p className="text-[15px] font-medium text-gray-900">No alerts yet</p>
            <p className="text-[14px] text-gray-500 mt-1">
              Proposal sends, opens, signatures, and declines show up here.
            </p>
          </div>
        )}
        {alerts.map((alert, index) => {
          const Icon = alertIconForType(alert.type);
          const unread = !alert.read_at;
          return (
            <button
              key={alert.id}
              type="button"
              onClick={() => {
                void openAlert(alert);
              }}
              className={`flex w-full items-start gap-3.5 px-5 py-4 text-left hover:bg-gray-50 transition-colors ${
                index > 0 ? "border-t border-gray-100" : ""
              }`}
            >
              <div
                className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  unread
                    ? "bg-[#EFF6FF] text-[#2563EB]"
                    : "bg-gray-100 text-gray-600"
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`text-[15px] truncate ${
                      unread
                        ? "font-semibold text-gray-900"
                        : "font-medium text-gray-800"
                    }`}
                  >
                    {alert.title}
                  </span>
                  <span className="text-[12px] text-gray-400 shrink-0">
                    {formatAlertTime(alert.created_at)}
                  </span>
                </div>
                <p className="text-[14px] text-gray-500 leading-snug mt-0.5">
                  {alert.body}
                </p>
              </div>
              {unread && (
                <span className="mt-2.5 w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
