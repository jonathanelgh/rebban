"use client";

import React, { Suspense, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { CreateMenu } from "@/components/CreateMenu";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isFocusedLayout =
    pathname.includes("/edit") ||
    pathname.includes("/template") ||
    pathname.startsWith("/p/");
  const isAuthLayout =
    pathname.startsWith("/login") || pathname.startsWith("/signup");
  // Pages that already have a primary create CTA in the page header.
  const hideCreateMenu =
    pathname === "/proposals" ||
    pathname.startsWith("/proposals/") ||
    pathname === "/clients" ||
    pathname.startsWith("/clients/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/");

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  if (isFocusedLayout || isAuthLayout) {
    return (
      <div
        className={`h-full w-full min-h-0 ${
          pathname.startsWith("/p/")
            ? "overflow-y-auto bg-[#F3F4F6]"
            : "overflow-hidden bg-white"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 md:gap-2 md:p-2 md:pt-1.5 md:pb-1.5">
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-gray-900/35 md:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <Sidebar
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="relative z-0 flex-1 min-w-0 min-h-0">
        <div
          className={`relative h-full min-h-0 bg-white md:rounded-2xl md:border md:border-line md:shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
            pathname === "/" || pathname.startsWith("/tasks")
              ? "overflow-hidden"
              : "overflow-y-auto no-scrollbar"
          }`}
        >
          <div className="absolute top-4 inset-x-4 z-40 flex items-center justify-between gap-3 pointer-events-none">
            <button
              type="button"
              aria-label="Open menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
              className="pointer-events-auto md:hidden inline-flex items-center justify-center w-10 h-10 rounded-full border border-line bg-white text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
            >
              <Menu className="w-5 h-5" strokeWidth={1.75} />
            </button>
            {!hideCreateMenu && (
              <div className="pointer-events-auto ml-auto">
                <CreateMenu />
              </div>
            )}
          </div>
          <div
            className={`min-h-0 max-md:pt-16 ${
              pathname === "/" || pathname.startsWith("/tasks")
                ? "h-full"
                : "min-h-full"
            }`}
          >
            {children}
          </div>
        </div>
      </div>
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
            <div className="h-full bg-white md:rounded-2xl" />
          </div>
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
