"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  asProposalContent,
  toProposalContentJson,
  type ProposalContentSnapshot,
} from "@/lib/proposals/content";
import { mergeTemplateWithExistingContent } from "@/lib/proposals/ai-schema";
import type { Tables } from "@/types/database";

type TemplateRow = Tables<"proposal_templates">;

export default function TemplateSelectionPage() {
  const params = useParams();
  const proposalId = typeof params.id === "string" ? params.id : "";
  const router = useRouter();
  const { organizationId, loading: profileLoading } = useProfile();

  const [activeTab, setActiveTab] = useState<"type" | "yours">("type");
  const [activeCategory, setActiveCategory] = useState("All Templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;

    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const query = supabase
        .from("proposal_templates")
        .select("*")
        .is("deleted_at", null)
        .order("is_system", { ascending: false })
        .order("name", { ascending: true });

      // RLS already scopes visibility; fetch all readable templates.
      const { data, error: loadError } = await query;

      if (cancelled) return;
      if (loadError) {
        setError(loadError.message);
        setTemplates([]);
      } else {
        setTemplates(data ?? []);
      }
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [profileLoading, organizationId]);

  const systemTemplates = useMemo(
    () => templates.filter((t) => t.is_system),
    [templates]
  );
  const myTemplates = useMemo(
    () => templates.filter((t) => !t.is_system),
    [templates]
  );

  const categories = useMemo(() => {
    const source = activeTab === "yours" ? myTemplates : systemTemplates;
    const counts = new Map<string, number>();
    for (const template of source) {
      const key = template.category || "general";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [
      { name: "All Templates", count: source.length },
      ...Array.from(counts.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, count]) => ({
          name: name.charAt(0).toUpperCase() + name.slice(1),
          key: name,
          count,
        })),
    ];
  }, [activeTab, systemTemplates, myTemplates]);

  const visibleTemplates = useMemo(() => {
    const source = activeTab === "yours" ? myTemplates : systemTemplates;
    const q = searchQuery.trim().toLowerCase();
    return source.filter((template) => {
      if (activeCategory !== "All Templates") {
        const key = activeCategory.toLowerCase();
        if ((template.category || "general") !== key) return false;
      }
      if (!q) return true;
      return (
        template.name.toLowerCase().includes(q) ||
        (template.description?.toLowerCase().includes(q) ?? false) ||
        (template.category?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [activeTab, myTemplates, systemTemplates, activeCategory, searchQuery]);

  async function handleSelectTemplate(template: TemplateRow) {
    if (!proposalId || applyingId) return;
    setApplyingId(template.id);
    setError(null);

    const supabase = createClient();
    const [{ data: proposal }, templateContent] = await Promise.all([
      supabase
        .from("proposals")
        .select("content")
        .eq("id", proposalId)
        .maybeSingle(),
      Promise.resolve(asProposalContent(template.content)),
    ]);

    const existing = asProposalContent(proposal?.content ?? null);
    const headerTheme =
      (template.header_theme as ProposalContentSnapshot["headerTheme"]) ||
      templateContent.headerTheme ||
      "pastel";

    const merged = mergeTemplateWithExistingContent(
      existing,
      templateContent,
      headerTheme
    );

    const nextContent: ProposalContentSnapshot = {
      ...merged,
      version: 1,
      headerTheme,
      meta: {
        ...(merged.meta || {}),
        templateId: template.id,
        templateSlug: template.slug,
        templateName: template.name,
      },
    };

    const { error: updateError } = await supabase
      .from("proposals")
      .update({
        template_id: template.id,
        content: toProposalContentJson(nextContent),
      })
      .eq("id", proposalId);

    if (updateError) {
      setError(updateError.message);
      setApplyingId(null);
      return;
    }

    router.push(`/proposals/${proposalId}/edit?template=${template.id}`);
  }

  return (
    <div className="h-full min-h-0 bg-white flex flex-col font-sans overflow-x-hidden overflow-y-auto">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-line pt-[env(safe-area-inset-top)] shrink-0">
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-5 max-w-[1400px] mx-auto w-full">
          <div className="min-w-0 pt-0.5">
            <h1 className="text-[22px] sm:text-[28px] font-bold text-gray-900 tracking-tight leading-tight">
              Select a Template
            </h1>
            <p className="text-[13px] sm:text-[15px] text-gray-600 mt-1 leading-snug max-w-md">
              Start with a system template, or reuse one you saved.
            </p>
          </div>
          <Link
            href="/proposals"
            className="p-2 -mr-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6" />
          </Link>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-8 lg:py-10 gap-4 sm:gap-8 lg:gap-16">
        <aside className="lg:w-[280px] shrink-0 space-y-3 sm:space-y-4">
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => {
                setActiveTab("type");
                setActiveCategory("All Templates");
              }}
              className={`flex-1 pb-2.5 sm:pb-3 text-sm font-semibold transition-colors relative ${
                activeTab === "type"
                  ? "text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              System
              {activeTab === "type" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("yours");
                setActiveCategory("All Templates");
              }}
              className={`flex-1 pb-2.5 sm:pb-3 text-sm font-semibold transition-colors relative ${
                activeTab === "yours"
                  ? "text-gray-900"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              Yours
              {activeTab === "yours" && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-900" />
              )}
            </button>
          </div>

          {/* Mobile: horizontal category chips */}
          <div className="lg:hidden -mx-4 px-4 overflow-x-auto overflow-y-hidden scrollbar-none">
            <div className="flex gap-2 pb-1 min-w-min">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setActiveCategory(cat.name)}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                    activeCategory === cat.name
                      ? "bg-gray-900 text-white"
                      : "bg-[#F3F4F6] text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {cat.name}
                  <span
                    className={
                      activeCategory === cat.name
                        ? "text-white/70"
                        : "text-gray-400"
                    }
                  >
                    {cat.count}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Desktop: vertical category list */}
          <div className="hidden lg:block space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => setActiveCategory(cat.name)}
                className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  activeCategory === cat.name
                    ? "bg-[#EEF2F6] text-gray-900"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{cat.name}</span>
                <span>{cat.count}</span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="relative mb-4 sm:mb-8">
            <Search className="w-4 h-4 text-gray-400 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-10 sm:pl-11 pr-10 sm:pr-11 py-2.5 sm:py-3 bg-white border border-line rounded-xl sm:rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && (
            <p className="mb-4 text-[13px] text-red-600">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-gray-400 py-8 text-center lg:text-left">
              Loading templates…
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-6 lg:gap-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              {visibleTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={Boolean(applyingId)}
                  onClick={() => void handleSelectTemplate(template)}
                  className="flex flex-col text-left group disabled:opacity-60"
                >
                  <div className="bg-white border border-line rounded-xl sm:rounded-lg overflow-hidden shadow-sm group-hover:shadow-md transition-shadow aspect-[4/5] sm:aspect-[1/1.2] mb-2.5 sm:mb-4 flex flex-col relative">
                    {template.is_blank ? (
                      <div className="flex-1 p-4 sm:p-8 bg-white flex flex-col items-center justify-center border-2 border-dashed border-gray-200 m-2.5 sm:m-4 rounded-lg sm:rounded-xl">
                        <Plus className="w-6 h-6 sm:w-8 sm:h-8 text-gray-300 mb-2 sm:mb-3" />
                        <div className="text-gray-400 font-medium text-xs sm:text-sm text-center">
                          Create Custom
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 bg-gray-50 flex flex-col relative overflow-hidden">
                        {template.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={template.thumbnail_url}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-2.5 sm:p-6 flex flex-col justify-end">
                          <div className="bg-white/95 backdrop-blur-sm p-2.5 sm:p-4 rounded-lg shadow-lg border border-white/20 sm:transform sm:translate-y-2 sm:group-hover:translate-y-0 transition-transform duration-300">
                            <div className="font-bold text-gray-900 text-[12px] sm:text-base mb-0.5 sm:mb-1 line-clamp-2">
                              {template.name}
                            </div>
                            <div className="hidden sm:flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
                              <span>
                                {template.is_system
                                  ? "System template"
                                  : "Your template"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {applyingId === template.id && (
                      <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-sm font-medium text-gray-700">
                        Applying…
                      </div>
                    )}
                  </div>

                  <div className="text-center px-0.5">
                    <h3 className="font-semibold sm:font-bold text-gray-900 text-[12px] sm:text-sm mb-0.5 sm:mb-1 line-clamp-2 leading-snug">
                      {template.name}
                    </h3>
                    <span className="text-[#2563EB] font-semibold text-[12px] sm:text-sm">
                      {template.is_blank ? "Start blank" : "Use template"}
                    </span>
                  </div>
                </button>
              ))}
              {!loading && visibleTemplates.length === 0 && (
                <div className="col-span-full py-12 sm:py-16 text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {activeTab === "yours"
                      ? "No saved templates yet"
                      : "No templates found"}
                  </p>
                  <p className="text-[13px] text-gray-400 mt-1 px-4">
                    {activeTab === "yours"
                      ? "Open a proposal and choose Save as template."
                      : "Try another search or category."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
