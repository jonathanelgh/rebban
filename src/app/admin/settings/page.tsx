"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mail, Newspaper } from "lucide-react";
import { OutreachSettingsPanel } from "@/components/admin/OutreachSettingsPanel";
import { BlogAutomationPanel } from "@/components/admin/BlogAutomationPanel";

type SectionId = "outreach" | "blog";

const SECTIONS: {
  id: SectionId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}[] = [
  {
    id: "outreach",
    label: "Outreach",
    description: "Gmail connection and daily send limits",
    icon: Mail,
  },
  {
    id: "blog",
    label: "Blog automation",
    description: "AI topics, schedule, and auto-publish",
    icon: Newspaper,
  },
];

export default function AdminSettingsPage() {
  return (
    <Suspense
      fallback={
        <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto">
          <p className="text-sm text-gray-400">Loading settings…</p>
        </main>
      }
    >
      <AdminSettingsInner />
    </Suspense>
  );
}

function AdminSettingsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial =
    (searchParams.get("section") as SectionId | null) || "outreach";
  const [section, setSection] = useState<SectionId>(
    SECTIONS.some((s) => s.id === initial) ? initial : "outreach"
  );

  useEffect(() => {
    const next = (searchParams.get("section") as SectionId | null) || "outreach";
    if (SECTIONS.some((s) => s.id === next)) setSection(next);
  }, [searchParams]);

  function selectSection(id: SectionId) {
    setSection(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("section", id);
    router.replace(`/admin/settings?${params.toString()}`, { scroll: false });
  }

  return (
    <main className="w-full px-4 sm:px-8 pt-10 pb-8 max-w-7xl mx-auto relative">
      <div className="mb-6 pr-16 md:pr-28">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">
          Settings
        </h1>
        <p className="text-gray-500 mt-1.5 text-[15px]">
          Platform admin preferences for outreach and operations.
        </p>
      </div>

      <nav className="lg:hidden flex gap-1 overflow-x-auto no-scrollbar mb-5 border-b border-line -mx-4 px-4">
        {SECTIONS.map(({ id, label, icon: Icon }) => {
          const active = section === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectSection(id)}
              className={`inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active
                  ? "border-[#2563EB] text-[#2563EB]"
                  : "border-transparent text-gray-500"
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={1.75} />
              {label}
            </button>
          );
        })}
      </nav>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 items-start">
        <aside className="hidden lg:block w-[240px] shrink-0 sticky top-8">
          <nav className="space-y-1">
            {SECTIONS.map(({ id, label, description, icon: Icon }) => {
              const active = section === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectSection(id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active
                      ? "bg-[#EFF6FF] text-[#2563EB]"
                      : "text-gray-700 hover:bg-[#FAFBFC]"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? "text-[#2563EB]" : "text-gray-400"
                    }`}
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-[14px] ${
                        active ? "font-semibold" : "font-medium"
                      }`}
                    >
                      {label}
                    </span>
                    <span
                      className={`block text-[12px] mt-0.5 leading-snug ${
                        active ? "text-blue-600/70" : "text-gray-400"
                      }`}
                    >
                      {description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex-1 min-w-0 w-full">
          {section === "outreach" && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight mb-1">
                Outreach
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Founder outreach Gmail and send window controls.
              </p>
              <OutreachSettingsPanel />
            </div>
          )}
          {section === "blog" && (
            <div>
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 tracking-tight mb-1">
                Blog automation
              </h2>
              <p className="text-sm text-gray-500 mb-5">
                Schedule AI-written freelancer articles with SEO topics and
                cover images.
              </p>
              <BlogAutomationPanel />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
