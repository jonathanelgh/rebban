"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  FileText,
  FileSpreadsheet,
  CreditCard,
  Settings,
  Timer,
  Kanban,
  Bell,
  User,
  Building2,
  ArrowRight,
  X,
  Gauge,
  Sun,
  LogOut,
  MoreHorizontal,
  IdCard,
  Eye,
  CheckCircle2,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTimeTracking, formatElapsed } from "@/components/TimeTrackingContext";
import { useProfile } from "@/components/ProfileContext";
import { UserAvatar } from "@/components/UserAvatar";
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

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function SidebarInner() {
  const pathname = usePathname();
  const { isTracking, elapsedSeconds } = useTimeTracking();
  const { avatarUrl, fullName } = useProfile();

  // Hide the global sidebar in the proposal editor — it has its own focused layout.
  if (pathname.includes("/edit")) return null;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <aside className="relative z-50 bg-transparent w-[72px] shrink-0 flex flex-col justify-between overflow-visible py-3">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-gray-950 text-white flex items-center justify-center shrink-0">
          <span className="text-[15px] font-semibold tracking-tight leading-none">R.</span>
        </div>

        <div className="relative group flex items-center">
          <div className="cursor-pointer relative z-10 hover:ring-2 hover:ring-gray-200 rounded-full transition-all">
            <UserAvatar src={avatarUrl} alt={fullName ?? "Profile"} size="sm" />
          </div>

          {/* Hover Bridge */}
          <div className="absolute left-full top-0 w-4 h-full hidden group-hover:block" />

          {/* Popover */}
          <div className="absolute left-full top-0 ml-3 hidden group-hover:block z-[80]">
            <div className="w-[320px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200 py-3 flex flex-col cursor-default">
              
              {/* Header */}
              <div className="px-4 pb-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#f0f3f5] flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5 text-gray-500" strokeWidth={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold text-gray-900 truncate">Nordic Elk AB</div>
                  <div className="text-[13px] text-gray-500">Basic</div>
                </div>
              </div>

              <div className="px-4 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                <span className="text-[15px] text-gray-900">Online for messages</span>
                <Toggle active={true} />
              </div>

              <div className="h-px bg-gray-200 my-2 mx-4" />

              <MenuLink icon={User} label="My profile" href="/settings" />
              <MenuLink icon={Users} label="Teams" />

              {/* Promo Box */}
              <div className="mx-4 my-2 p-3 border border-[#a8dfaa] bg-[#fcfdfa] rounded-xl relative group/promo">
                <button className="absolute top-2 right-2 text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-1 font-semibold text-[14px] text-gray-900 mb-0.5">
                  Try Business Plus <ArrowRight className="w-4 h-4 ml-0.5" />
                </div>
                <p className="text-[13px] text-gray-600 leading-snug pr-4">
                  Upgrade for quicker access to the top 1% of freelancers. No upfront costs.
                </p>
              </div>

              <MenuLink icon={IdCard} label="Membership" />
              <MenuLink icon={Gauge} label="Account health" />
              <MenuLink icon={Sun} label="Theme: Light" />
              <MenuLink icon={Settings} label="Settings" href="/settings" />

              <div className="h-px bg-gray-200 my-2 mx-4" />

              <div className="px-4 py-2 flex items-center justify-between hover:bg-gray-50 cursor-pointer">
                <span className="text-[15px] text-gray-900">New main menu</span>
                <Toggle active={true} />
              </div>

              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors text-left"
              >
                <LogOut className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
                <span className="text-[15px]">Log out</span>
              </button>
              <MenuLink icon={MoreHorizontal} label="More" />
            </div>
          </div>
        </div>

        <nav className="w-full space-y-0.5">
          <NavItem href="/" icon={Home} label="Home" active={pathname === "/"} />
          <NavItem href="/clients" icon={Users} label="Clients" active={pathname === "/clients"} />
          <NavItem
            href="/tasks"
            icon={Kanban}
            label="Tasks"
            active={pathname.startsWith("/tasks")}
          />
          <NavItem
            href="/proposals"
            icon={FileText}
            label="Proposals"
            active={pathname.startsWith("/proposals")}
          />
          <NavItem
            href="/invoices"
            icon={FileSpreadsheet}
            label="Invoices"
            active={pathname === "/invoices"}
          />
          <NavItem
            href="/payments"
            icon={CreditCard}
            label="Payments"
            active={pathname === "/payments"}
          />
          <NavItem
            href="/time-tracking"
            icon={Timer}
            label="Time"
            active={pathname === "/time-tracking"}
            badge={isTracking ? formatElapsed(elapsedSeconds) : undefined}
            badgeLive={isTracking}
          />
        </nav>
      </div>

      <div className="w-full space-y-0.5">
        <AlertsMenu active={pathname === "/notifications"} />
        <NavItem href="/settings" icon={Settings} label="Settings" active={pathname === "/settings"} />
      </div>
    </aside>
  );
}

export function Sidebar() {
  return (
    <Suspense fallback={<aside className="bg-transparent w-[72px] shrink-0" />}>
      <SidebarInner />
    </Suspense>
  );
}

function NavItem({
  icon: Icon,
  label,
  href,
  active = false,
  badge,
  badgeLive = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  active?: boolean;
  badge?: string;
  badgeLive?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 transition-colors ${
        badgeLive && !active
          ? "text-emerald-700"
          : active
            ? "text-gray-900"
            : "text-gray-500 hover:text-gray-800"
      }`}
      title={badge ? `${label} · ${badge}` : label}
    >
      <div className="relative flex items-center justify-center">
        <Icon className={`w-6 h-6 transition-transform duration-200 ease-out group-hover:-rotate-12 ${active ? "stroke-[2]" : "stroke-[1.75]"}`} />
        {badgeLive && (
          <span className="absolute -top-0.5 -right-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </div>
      <span className={`text-[11px] leading-tight text-center tracking-tight ${active ? "font-medium" : ""}`}>
        {label}
      </span>
      {badge && (
        <span className="text-[10px] font-mono font-semibold tabular-nums text-emerald-600">
          {badge}
        </span>
      )}
    </Link>
  );
}

function AlertsMenu({ active = false }: { active?: boolean }) {
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
      .limit(20);

    setAlerts((data as NotificationRow[] | null) || []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAlerts();
    const interval = window.setInterval(() => {
      void loadAlerts();
    }, 30000);
    return () => window.clearInterval(interval);
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
    <div
      className="relative group flex flex-col items-center"
      onMouseEnter={() => {
        void loadAlerts();
      }}
    >
      <button
        type="button"
        className={`relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 w-full transition-colors ${
          active ? "text-gray-900" : "text-gray-500 group-hover:text-gray-800"
        }`}
        title="Alerts"
      >
        <div className="relative flex items-center justify-center">
          <Bell
            className={`w-6 h-6 transition-transform duration-200 ease-out group-hover:-rotate-12 ${
              active ? "stroke-[2]" : "stroke-[1.75]"
            }`}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-semibold leading-4 text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <span className={`text-[11px] leading-tight text-center tracking-tight ${active ? "font-medium" : ""}`}>
          Alerts
        </span>
      </button>

      {/* Hover bridge */}
      <div className="absolute left-full bottom-0 w-4 h-full hidden group-hover:block" />

      {/* Popover — anchored bottom so it stays on screen */}
      <div className="absolute left-full bottom-0 ml-3 hidden group-hover:block z-[80]">
        <div className="w-[340px] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200 py-3 flex flex-col cursor-default">
          <div className="px-4 pb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[15px] font-semibold text-gray-900">Alerts</div>
              <div className="text-[13px] text-gray-500">
                {loading
                  ? "Loading…"
                  : unreadCount === 0
                    ? "All caught up"
                    : `${unreadCount} unread`}
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  void markAllRead();
                }}
                className="text-[13px] font-medium text-[#2563EB] hover:text-[#1d4ed8] transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="h-px bg-gray-200 mx-4 mb-1" />

          <div className="max-h-[360px] overflow-y-auto no-scrollbar">
            {!loading && alerts.length === 0 && (
              <div className="px-4 py-8 text-center text-[13px] text-gray-500">
                No alerts yet. You’ll see proposal activity here.
              </div>
            )}
            {alerts.map((alert) => {
              const Icon = alertIconForType(alert.type);
              const unread = !alert.read_at;
              return (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => {
                    void openAlert(alert);
                  }}
                  className="flex w-full items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors text-left"
                >
                  <div
                    className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      unread
                        ? "bg-[#EFF6FF] text-[#2563EB]"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[14px] truncate ${
                          unread ? "font-semibold text-gray-900" : "font-medium text-gray-800"
                        }`}
                      >
                        {alert.title}
                      </span>
                      <span className="text-[11px] text-gray-400 shrink-0">
                        {formatAlertTime(alert.created_at)}
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-500 leading-snug mt-0.5 truncate">
                      {alert.body}
                    </p>
                  </div>
                  {unread && (
                    <span className="mt-2 w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          <div className="h-px bg-gray-200 mx-4 mt-1 mb-2" />

          <Link
            href="/notifications"
            className="mx-4 py-2 text-center text-[14px] font-medium text-[#2563EB] hover:text-[#1d4ed8] hover:bg-[#EFF6FF] rounded-xl transition-colors"
          >
            View all alerts
          </Link>
        </div>
      </div>
    </div>
  );
}

function Toggle({ active }: { active: boolean }) {
  return (
    <div className={`w-11 h-6 rounded-full flex items-center p-0.5 transition-colors ${active ? "bg-[#343434]" : "bg-gray-300"}`}>
      <div className={`w-5 h-5 bg-white rounded-full shadow-sm transform transition-transform ${active ? "translate-x-5" : "translate-x-0"}`} />
    </div>
  );
}

function MenuLink({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href?: string;
}) {
  const className =
    "flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors";

  if (href) {
    return (
      <Link href={href} className={className}>
        <Icon className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
        <span className="text-[15px]">{label}</span>
      </Link>
    );
  }

  return (
    <div className={className}>
      <Icon className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
      <span className="text-[15px]">{label}</span>
    </div>
  );
}
