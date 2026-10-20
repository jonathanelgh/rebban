"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CreateMenu, PageChromeCta } from "@/components/CreateMenu";
import { SupportChat } from "@/components/SupportChat";
import { UpgradeModal } from "@/components/UpgradeModal";
import { PastDueBillingBanner } from "@/components/PastDueBillingBanner";
import { useBilling } from "@/components/BillingContext";
import { isBillingExemptPath } from "@/lib/billing/plan";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const {
    entitled,
    loading: billingLoading,
    upgradeModalOpen,
    openUpgradeModal,
    closeUpgradeModal,
  } = useBilling();
  const isPrintLayout = pathname.includes("/print");
  const isFocusedLayout =
    pathname.includes("/edit") ||
    pathname.includes("/template") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/pay/") ||
    pathname.startsWith("/f/") ||
    pathname.startsWith("/b/");
  const isAuthLayout =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/onboarding");
  // List pages keep their own primary CTA in the header on desktop; on mobile
  // that same CTA is rendered in the chrome slot (not the dashboard Create menu).
  const mobilePageCta =
    pathname === "/proposals"
      ? { label: "New Proposal", href: "/proposals?new=1" }
      : pathname === "/clients"
        ? { label: "New client", href: "/clients?new=1" }
        : pathname === "/tasks"
          ? { label: "Add task", href: "/tasks?new=1" }
          : pathname === "/invoices"
            ? { label: "New Invoice", href: "/invoices?new=1" }
            : pathname === "/time-tracking"
              ? { label: "Add time", href: "/time-tracking?new=1" }
              : pathname === "/calendar" || pathname.startsWith("/calendar/")
                ? { label: "Create meeting", href: "/calendar?new=1" }
                : pathname === "/leads/forms" || pathname.startsWith("/leads/forms/")
                  ? { label: "New form", href: "/leads/forms?new=1" }
                  : pathname === "/leads" || pathname.startsWith("/leads/")
                    ? { label: "Add lead", href: "/leads?new=1" }
                    : null;
  const hideCreateMenuOnDesktop = Boolean(mobilePageCta) ||
    pathname.startsWith("/proposals/") ||
    pathname.startsWith("/clients/") ||
    pathname.startsWith("/tasks/") ||
    pathname.startsWith("/invoices/") ||
    pathname.startsWith("/time-tracking/") ||
    pathname.startsWith("/calendar");
  const hideCreateMenuEntirely =
    pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (billingLoading || entitled) return;
    if (!isBillingExemptPath(pathname)) {
      openUpgradeModal();
    }
  }, [pathname, billingLoading, entitled, openUpgradeModal]);

  if (isFocusedLayout || isAuthLayout) {
    return (
      <div
        className={`h-full w-full min-h-0 ${
          isPrintLayout
            ? "overflow-y-auto bg-white"
            : pathname.startsWith("/p/") || pathname.startsWith("/pay/")
              ? "overflow-y-auto bg-[#F3F4F6]"
              : pathname.startsWith("/f/")
                ? "h-auto min-h-0 overflow-visible bg-transparent"
                : isAuthLayout
                  ? "overflow-y-auto bg-[#F0F1F3]"
                  : "overflow-hidden bg-white"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="h-full w-full min-h-0 overflow-hidden md:overflow-visible md:p-2 md:pt-1.5 md:pb-1.5">
      {/*
        Mobile: sidebar + full-width content sit in one row. Closed state shifts
        the row left so only content shows; open slides content right to reveal nav.
      */}
      <div
        className={`flex h-full min-h-0 md:w-full md:gap-2 md:translate-x-0 max-md:w-[calc(100vw+72px)] max-md:transition-transform max-md:duration-300 max-md:ease-out ${
          mobileNavOpen ? "max-md:translate-x-0" : "max-md:-translate-x-[72px]"
        }`}
      >
        <Sidebar onMobileClose={() => setMobileNavOpen(false)} />

        <div
          className="relative z-0 min-h-0 min-w-0 flex-1 max-md:w-screen max-md:min-w-[100vw] max-md:max-w-[100vw] max-md:shrink-0"
          onClick={mobileNavOpen ? () => setMobileNavOpen(false) : undefined}
        >
          <div className="relative h-full min-h-0 overflow-hidden bg-white border-t border-line rounded-t-2xl md:rounded-2xl md:border md:border-line md:shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {/*
              Keep chrome outside the scroll container so the menu/create
              buttons stay pinned on every page (not only dashboard/tasks).
              Offset by safe-area-inset-top so iOS notch/status bar never
              clips the controls when the browser chrome collapses.
            */}
            <div className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] inset-x-4 z-40 flex items-center justify-between gap-3 pointer-events-none md:top-4">
              <button
                type="button"
                aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileNavOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setMobileNavOpen((open) => !open);
                }}
                className="pointer-events-auto md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-line bg-white text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                {mobileNavOpen ? (
                  <X className="w-5 h-5" strokeWidth={1.75} />
                ) : (
                  <Menu className="w-5 h-5" strokeWidth={1.75} />
                )}
              </button>
              {!hideCreateMenuEntirely && mobilePageCta ? (
                <div
                  className="pointer-events-auto ml-auto md:hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <PageChromeCta
                    label={mobilePageCta.label}
                    href={mobilePageCta.href}
                  />
                </div>
              ) : !hideCreateMenuEntirely ? (
                <div
                  className={`pointer-events-auto ml-auto ${
                    hideCreateMenuOnDesktop ? "md:hidden" : ""
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <CreateMenu />
                </div>
              ) : null}
            </div>
            <div
              className={`h-full min-h-0 min-w-0 flex flex-col max-md:pt-[calc(4rem+env(safe-area-inset-top,0px))] ${
                pathname === "/" || pathname.startsWith("/tasks")
                  ? "overflow-hidden"
                  : "overflow-y-auto overflow-x-hidden no-scrollbar"
              }`}
            >
              <PastDueBillingBanner />
              <div className="min-h-0 min-w-0 flex-1 flex flex-col">
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
      <UpgradeModal open={upgradeModalOpen} onClose={closeUpgradeModal} />
      <SupportChat />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full">
          <aside className="hidden md:block w-[72px] shrink-0" />
          <div className="flex-1">
            <div className="h-full bg-white rounded-t-2xl md:rounded-2xl border-t border-line md:border" />
          </div>
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
