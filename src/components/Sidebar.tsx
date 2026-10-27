"use client";

import React, {
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  Users,
  FileText,
  FileSpreadsheet,
  Settings,
  Timer,
  Kanban,
  Bell,
  User,
  Building2,
  ArrowRight,
  LogOut,
  Eye,
  CheckCircle2,
  Send,
  XCircle,
  Shield,
  Mail,
  ChartColumn,
  Headphones,
  Contact,
  Newspaper,
  Activity,
  CalendarDays,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useTimeTracking, formatElapsed } from "@/components/TimeTrackingContext";
import { useProfile } from "@/components/ProfileContext";
import { useBilling } from "@/components/BillingContext";
import { UserAvatar } from "@/components/UserAvatar";
import { createClient } from "@/lib/supabase/client";
import { isBillingExemptPath } from "@/lib/billing/plan";

type SidebarMenu = "profile" | "alerts" | null;

function canHover() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

/**
 * Hover open/close for portaled flyouts. Closing is delayed so the pointer can
 * cross the gap between the trigger and the panel without the menu vanishing.
 */
function useHoverMenuBridge(onOpenChange: (open: boolean) => void) {
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  function cancelClose() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  function openFromHover() {
    if (!canHover()) return;
    cancelClose();
    onOpenChange(true);
  }

  function closeFromHover() {
    if (!canHover()) return;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      onOpenChange(false);
    }, 180);
  }

  return { openFromHover, closeFromHover };
}

/** Fixed panel beside a sidebar trigger so overflow scroll never clips menus. */
function useFlyoutStyle(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  align: "top" | "bottom"
): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open) return;

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const next: CSSProperties = {
        position: "fixed",
        // Keep a small visual gap, but short enough that the delayed close
        // covers moving from the trigger into the portaled panel.
        left: Math.min(r.right + 8, window.innerWidth - 12),
        zIndex: 200,
      };
      if (align === "top") {
        next.top = Math.max(8, Math.min(r.top, window.innerHeight - 8));
      } else {
        next.bottom = Math.max(8, window.innerHeight - r.bottom);
      }
      setStyle(next);
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef, align]);

  return style;
}

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
    case "invoice_sent":
      return Send;
    case "proposal_opened":
    case "invoice_opened":
      return Eye;
    case "proposal_signed":
    case "invoice_paid":
      return CheckCircle2;
    case "proposal_declined":
      return XCircle;
    default:
      return Bell;
  }
}

function SidebarInner({
  onMobileClose,
}: {
  onMobileClose?: () => void;
}) {
  const pathname = usePathname();
  const { isPlatformAdmin } = useProfile();
  const { isTracking, elapsedSeconds } = useTimeTracking();
  const [openMenu, setOpenMenu] = useState<SidebarMenu>(null);
  const isAdminPanel =
    pathname === "/admin" || pathname.startsWith("/admin/");

  // Hide the global sidebar in the proposal editor — it has its own focused layout.
  if (pathname.includes("/edit")) return null;

  function closeMenus() {
    setOpenMenu(null);
  }

  function handleNavigate() {
    closeMenus();
    onMobileClose?.();
  }

  return (
    <aside className="relative z-30 w-[72px] shrink-0 h-full min-h-0 flex flex-col bg-transparent">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar flex flex-col items-center gap-4 py-3">
        <Link
          href={isAdminPanel ? "/admin" : "/"}
          onClick={handleNavigate}
          className="w-10 h-10 rounded-xl overflow-hidden shrink-0"
          title={isAdminPanel ? "Admin overview" : "Home"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rebban-icon.svg"
            alt="Rebban"
            width={40}
            height={40}
            className="h-full w-full"
          />
        </Link>

        <ProfileMenu
          open={openMenu === "profile"}
          onOpenChange={(next) => setOpenMenu(next ? "profile" : null)}
          onNavigate={handleNavigate}
          adminMode={isAdminPanel}
        />

        {isAdminPanel ? (
          <nav className="w-full space-y-0.5 shrink-0">
            <NavItem
              href="/admin/users"
              icon={Users}
              label="Users"
              active={
                pathname.startsWith("/admin/users") ||
                pathname.startsWith("/admin/organizations")
              }
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/admin/leads"
              icon={Mail}
              label="Leads"
              active={
                pathname.startsWith("/admin/leads") &&
                !pathname.startsWith("/admin/leads/insights")
              }
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/admin/leads/insights"
              icon={ChartColumn}
              label="Insights"
              active={pathname.startsWith("/admin/leads/insights")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/admin/support"
              icon={Headphones}
              label="Support"
              active={pathname.startsWith("/admin/support")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/admin/blog"
              icon={Newspaper}
              label="Articles"
              active={pathname.startsWith("/admin/blog")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/admin/analytics"
              icon={Activity}
              label="Analytics"
              active={pathname.startsWith("/admin/analytics")}
              onNavigate={handleNavigate}
            />
          </nav>
        ) : (
          <nav className="w-full space-y-0.5 shrink-0">
            <NavItem
              href="/"
              icon={Home}
              label="Home"
              active={pathname === "/"}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/clients"
              icon={Users}
              label="Clients"
              active={pathname === "/clients"}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/leads"
              icon={Contact}
              label="Leads"
              active={pathname.startsWith("/leads")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/tasks"
              icon={Kanban}
              label="Tasks"
              active={pathname.startsWith("/tasks")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/proposals"
              icon={FileText}
              label="Proposals"
              active={pathname.startsWith("/proposals")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/invoices"
              icon={FileSpreadsheet}
              label="Invoices"
              active={pathname.startsWith("/invoices")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/receipts"
              icon={Receipt}
              label="Receipts"
              active={pathname.startsWith("/receipts")}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/time-tracking"
              icon={Timer}
              label="Time"
              active={pathname === "/time-tracking"}
              badge={isTracking ? formatElapsed(elapsedSeconds) : undefined}
              badgeLive={isTracking}
              onNavigate={handleNavigate}
            />
            <NavItem
              href="/calendar"
              icon={CalendarDays}
              label="Calendar"
              active={pathname.startsWith("/calendar")}
              onNavigate={handleNavigate}
            />
          </nav>
        )}

        <div className="w-full space-y-0.5 shrink-0 pb-[max(0.25rem,env(safe-area-inset-bottom))]">
          {!isAdminPanel && (
            <AlertsMenu
              open={openMenu === "alerts"}
              onOpenChange={(next) => setOpenMenu(next ? "alerts" : null)}
              active={pathname === "/notifications"}
              onNavigate={handleNavigate}
            />
          )}
          {!isAdminPanel && isPlatformAdmin ? (
            <NavItem
              href="/admin"
              icon={Shield}
              label="Admin"
              active={false}
              onNavigate={handleNavigate}
            />
          ) : null}
          <NavItem
            href={isAdminPanel ? "/admin/settings" : "/settings"}
            icon={Settings}
            label="Settings"
            active={
              isAdminPanel
                ? pathname.startsWith("/admin/settings")
                : pathname === "/settings"
            }
            onNavigate={handleNavigate}
          />
        </div>
      </div>
    </aside>
  );
}

export function Sidebar({
  onMobileClose,
}: {
  onMobileClose?: () => void;
} = {}) {
  return (
    <Suspense
      fallback={<aside className="bg-transparent w-[72px] shrink-0" />}
    >
      <SidebarInner onMobileClose={onMobileClose} />
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
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  active?: boolean;
  badge?: string;
  badgeLive?: boolean;
  onNavigate?: () => void;
}) {
  const { entitled, loading, openUpgradeModal } = useBilling();
  const gated = !loading && !entitled && !isBillingExemptPath(href);

  return (
    <Link
      href={gated ? "#" : href}
      onClick={(e) => {
        if (gated) {
          e.preventDefault();
          openUpgradeModal();
          onNavigate?.();
          return;
        }
        onNavigate?.();
      }}
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

function ProfileMenu({
  open,
  onOpenChange,
  onNavigate,
  adminMode = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: () => void;
  adminMode?: boolean;
}) {
  const { avatarUrl, fullName, isPlatformAdmin } = useProfile();
  const { planLabel, openUpgradeModal, paid, trialActive, trialDaysLeft } =
    useBilling();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flyoutStyle = useFlyoutStyle(open, rootRef, "top");
  const { openFromHover, closeFromHover } = useHoverMenuBridge(onOpenChange);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  const panel = open ? (
    <div
      ref={panelRef}
      style={flyoutStyle}
      className="w-[min(320px,calc(100vw-84px))] max-h-[min(480px,calc(100vh-16px))] overflow-y-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200 py-3 flex flex-col cursor-default"
      onMouseEnter={openFromHover}
      onMouseLeave={closeFromHover}
    >
      <div className="px-4 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#f0f3f5] flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-gray-500" strokeWidth={1.5} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold text-gray-900 truncate">
            {fullName || "Your workspace"}
          </div>
          <div className="text-[13px] text-gray-500">{planLabel}</div>
        </div>
      </div>

      <div className="h-px bg-gray-200 my-2 mx-4" />

      <MenuLink
        icon={User}
        label="My profile"
        href="/settings"
        onNavigate={onNavigate}
      />
      <MenuLink
        icon={Settings}
        label={adminMode ? "Admin settings" : "Settings"}
        href={adminMode ? "/admin/settings" : "/settings"}
        onNavigate={onNavigate}
      />
      {isPlatformAdmin && !adminMode ? (
        <MenuLink
          icon={Shield}
          label="Platform admin"
          href="/admin"
          onNavigate={onNavigate}
        />
      ) : null}
      {adminMode ? (
        <MenuLink
          icon={Home}
          label="Back to app"
          href="/"
          onNavigate={onNavigate}
        />
      ) : null}

      {!paid && !adminMode && (
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            openUpgradeModal();
          }}
          className="mx-4 my-2 p-3 border border-[#BFDBFE] bg-[#EFF6FF] rounded-xl text-left hover:bg-[#DBEAFE] transition-colors"
        >
          <div className="flex items-center gap-1 font-semibold text-[14px] text-gray-900 mb-0.5">
            {trialActive
              ? `Upgrade · ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
              : "Upgrade to Pro"}{" "}
            <ArrowRight className="w-4 h-4 ml-0.5" />
          </div>
          <p className="text-[13px] text-gray-600 leading-snug">
            Unlock unlimited proposals, invoices, and automated reminders.
          </p>
        </button>
      )}

      <div className="h-px bg-gray-200 my-2 mx-4" />

      <button
        type="button"
        onClick={() => void handleSignOut()}
        className="w-full flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors text-left"
      >
        <LogOut className="w-5 h-5 text-gray-600" strokeWidth={1.5} />
        <span className="text-[15px]">Log out</span>
      </button>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative flex items-center shrink-0"
      onMouseEnter={openFromHover}
      onMouseLeave={closeFromHover}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!canHover()) onOpenChange(!open);
        }}
        className={`relative z-10 rounded-full cursor-pointer transition-all ${
          open ? "ring-2 ring-gray-200" : "hover:ring-2 hover:ring-gray-200"
        }`}
      >
        <UserAvatar src={avatarUrl} alt={fullName ?? "Profile"} size="sm" />
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function AlertsMenu({
  open,
  onOpenChange,
  active = false,
  onNavigate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active?: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const { entitled, loading: billingLoading, openUpgradeModal } = useBilling();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flyoutStyle = useFlyoutStyle(open, rootRef, "bottom");
  const { openFromHover, closeFromHover } = useHoverMenuBridge(onOpenChange);
  const [mounted, setMounted] = useState(false);
  const [alerts, setAlerts] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
  }, []);

  function tryOpenAlerts(next: boolean) {
    if (next && !billingLoading && !entitled) {
      openUpgradeModal();
      onNavigate?.();
      return;
    }
    onOpenChange(next);
  }

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

  useEffect(() => {
    if (!open) return;
    void loadAlerts();
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, onOpenChange]);

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
    if (alert.link) {
      onNavigate?.();
      router.push(alert.link);
    }
  }

  const panel = open ? (
    <div
      ref={panelRef}
      style={flyoutStyle}
      className="w-[min(340px,calc(100vw-84px))] bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-200 py-3 flex flex-col cursor-default"
      onMouseEnter={() => {
        openFromHover();
        if (canHover()) void loadAlerts();
      }}
      onMouseLeave={closeFromHover}
    >
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

      <div className="max-h-[min(360px,calc(100vh-160px))] overflow-y-auto no-scrollbar">
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
                      unread
                        ? "font-semibold text-gray-900"
                        : "font-medium text-gray-800"
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
        onClick={() => onNavigate?.()}
        className="mx-4 py-2 text-center text-[14px] font-medium text-[#2563EB] hover:text-[#1d4ed8] hover:bg-[#EFF6FF] rounded-xl transition-colors"
      >
        View all alerts
      </Link>
    </div>
  ) : null;

  return (
    <div
      ref={rootRef}
      className="relative flex flex-col items-center"
      onMouseEnter={() => {
        if (!canHover()) return;
        if (!billingLoading && !entitled) {
          openUpgradeModal();
          onNavigate?.();
          return;
        }
        openFromHover();
        void loadAlerts();
      }}
      onMouseLeave={closeFromHover}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!canHover()) tryOpenAlerts(!open);
        }}
        className={`relative flex flex-col items-center justify-center gap-1 py-2.5 px-1 w-full cursor-pointer transition-colors ${
          active || open ? "text-gray-900" : "text-gray-500 hover:text-gray-800"
        }`}
        title="Alerts"
      >
        <div className="relative flex items-center justify-center">
          <Bell
            className={`w-6 h-6 transition-transform duration-200 ease-out ${
              open ? "-rotate-12" : ""
            } ${active || open ? "stroke-[2]" : "stroke-[1.75]"}`}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-semibold leading-4 text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <span
          className={`text-[11px] leading-tight text-center tracking-tight ${
            active || open ? "font-medium" : ""
          }`}
        >
          Alerts
        </span>
      </button>

      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}

function MenuLink({
  icon: Icon,
  label,
  href,
  onNavigate,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  href?: string;
  onNavigate?: () => void;
}) {
  const className =
    "flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer text-gray-700 hover:text-gray-900 transition-colors";

  if (href) {
    return (
      <Link href={href} onClick={() => onNavigate?.()} className={className}>
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
