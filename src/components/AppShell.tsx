"use client";

import React, { Suspense } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { CreateMenu } from "@/components/CreateMenu";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isFocusedLayout =
    pathname.includes("/edit") ||
    pathname.includes("/template") ||
    pathname.startsWith("/p/");
  const isAuthLayout =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  if (isFocusedLayout || isAuthLayout) {
    return (
      <div
        className={`h-full w-full min-h-0 ${
          pathname.startsWith("/p/") ? "overflow-y-auto bg-[#F3F4F6]" : "overflow-hidden bg-white"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-h-0 gap-2 p-2 pt-1.5 pb-1.5">
      <Sidebar />
      <div className="relative z-0 flex-1 min-w-0 min-h-0">
        <div
          className={`relative h-full min-h-0 bg-white rounded-2xl border border-line shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${
            pathname === "/" || pathname.startsWith("/tasks")
              ? "overflow-hidden"
              : "overflow-y-auto no-scrollbar"
          }`}
        >
          <CreateMenu />
          {children}
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
          <aside className="w-[72px] shrink-0" />
          <div className="flex-1">
            <div className="h-full bg-white rounded-2xl" />
          </div>
        </div>
      }
    >
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}
