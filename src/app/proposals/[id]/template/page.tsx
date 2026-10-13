"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Search, X, HelpCircle, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/components/ProfileContext";
import {
  asProposalContent,
  toProposalContentJson,
  type ProposalContentSnapshot,
} from "@/lib/proposals/content";
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

      let query = supabase
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
    const templateContent = asProposalContent(template.content);
    const nextContent: ProposalContentSnapshot = {
      ...templateContent,
      version: 1,
      headerTheme:
        (template.header_theme as ProposalContentSnapshot["headerTheme"]) ||
        templateContent.headerTheme ||
        "pastel",
      meta: {
        ...(templateContent.meta || {}),
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
    <div className="min-h-screen bg-white flex flex-col font-sans relative">
      <div className="absolute top-6 right-6 z-10">
        <Link
          href="/proposals"
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex"
        >
          <X className="w-6 h-6" />
        </Link>
      </div>

      <div className="flex flex-1 max-w-[1400px] mx-auto w-full pt-20 px-8 pb-12 gap-16">
        <div className="w-[280px] shrink-0">
          <h1 className="text-[28px] font-bold text-gray-900 mb-3 tracking-tight">
            Select a Template
          </h1>
          <p className="text-gray-600 mb-8 leading-relaxed text-[15px]">
            Start with a system template, or reuse one you saved.
          </p>

          <div className="flex border-b border-gray-200 mb-4">
            <button
              type="button"
              onClick={() => {
                setActiveTab("type");
                setActiveCategory("All Templates");
              }}
              className={`flex-1 pb-3 text-sm font-semibold transition-colors relative ${
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
              className={`flex-1 pb-3 text-sm font-semibold transition-colors relative ${
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

          <div className="space-y-1">
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
        </div>

        <div className="flex-1 flex flex-col">
          <div className="relative mb-8">
            <Search className="w-4 h-4 text-gray-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-11 pr-11 py-3 bg-white border border-line rounded-lg text-[15px] focus:outline-none focus:ring-2 focus:ring-blue-100 font-medium text-gray-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {error && (
            <p className="mb-4 text-[13px] text-red-600">{error}</p>
          )}

          {loading ? (
            <p className="text-sm text-gray-400">Loading templates…</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {visibleTemplates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-col group cursor-pointer"
                  onClick={() => void handleSelectTemplate(template)}
                >
                  <div className="bg-white border border-line rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow aspect-[1/1.2] mb-4 flex flex-col relative">
                    {template.is_blank ? (
                      <div className="flex-1 p-8 bg-white flex flex-col items-center justify-center border-2 border-dashed border-gray-200 m-4 rounded-xl">
                        <Plus className="w-8 h-8 text-gray-300 mb-3" />
                        <div className="text-gray-400 font-medium text-sm">
                          Create Custom
                        </div>
                      </div>
                    ) : (
                      <div className="flex-1 bg-gray-50 flex flex-col relative overflow-hidden">
                        {template.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={template.thumbnail_url}
                            alt={template.name}
                            className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-700"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-gradient-to-br from-gray-100 to-gray-200" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end">
                          <div className="bg-white/95 backdrop-blur-sm p-4 rounded-lg shadow-lg border border-white/20 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                            <div className="font-bold text-gray-900 mb-1">
                              {template.name}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
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

                  <div className="text-center">
                    <h3 className="font-bold text-gray-900 text-sm mb-1">
                      {template.name}
                    </h3>
                    <button
                      type="button"
                      className="text-[#2563EB] font-semibold text-sm hover:text-[#1d4ed8] transition-colors"
                    >
                      {template.is_blank ? "Start from scratch" : "Use Template"}
                    </button>
                  </div>
                </div>
              ))}
              {!loading && visibleTemplates.length === 0 && (
                <div className="col-span-full py-16 text-center">
                  <p className="text-sm font-medium text-gray-700">
                    {activeTab === "yours"
                      ? "No saved templates yet"
                      : "No templates found"}
                  </p>
                  <p className="text-[13px] text-gray-400 mt-1">
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

      <button
        type="button"
        className="fixed bottom-6 right-6 w-12 h-12 bg-white border border-gray-200 shadow-lg rounded-full flex items-center justify-center text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors z-10"
      >
        <HelpCircle className="w-6 h-6" />
      </button>
    </div>
  );
}
