"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CreateMenu } from "@/components/CreateMenu";
import { SupportChat } from "@/components/SupportChat";
import { UpgradeModal } from "@/components/UpgradeModal";
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
    pathname.startsWith("/pay/");
  const isAuthLayout =
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/onboarding");
  // Pages that already have a primary create CTA in the page header.
  const hideCreateMenu =
    pathname === "/proposals" ||
    pathname.startsWith("/proposals/") ||
    pathname === "/clients" ||
    pathname.startsWith("/clients/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/") ||
    pathname === "/invoices" ||
    pathname.startsWith("/invoices/") ||
    pathname === "/time-tracking" ||
    pathname.startsWith("/time-tracking/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/");

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
            */}
            <div className="absolute top-4 inset-x-4 z-40 flex items-center justify-between gap-3 pointer-events-none">
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
              {!hideCreateMenu && (
                <div
                  className="pointer-events-auto ml-auto"
                  onClick={(e) => e.stopPropagation()}
                >
                  <CreateMenu />
                </div>
              )}
            </div>
            <div
              className={`h-full min-h-0 max-md:pt-16 ${
                pathname === "/" || pathname.startsWith("/tasks")
                  ? "overflow-hidden"
                  : "overflow-y-auto no-scrollbar"
              }`}
            >
              {children}
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
