"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Timer,
  Play,
  Square,
  ChevronDown,
  Check,
  Building2,
  FolderKanban,
} from "lucide-react";
import {
  useTimeTracking,
  formatElapsed,
  type TimerClient,
  type TimerProject,
} from "@/components/TimeTrackingContext";

type TimerStartFormProps = {
  variant?: "compact" | "page" | "sidebar";
  onBackToAi?: () => void;
  showBackButton?: boolean;
};

export function TimerStartForm({
  variant = "page",
  onBackToAi,
  showBackButton = false,
}: TimerStartFormProps) {
  const {
    clients,
    projects,
    selectedClient,
    setSelectedClient,
    selectedProject,
    setSelectedProject,
    workDescription,
    setWorkDescription,
    isTracking,
    elapsedSeconds,
    startTimer,
    stopTimer,
    busy,
    error,
  } = useTimeTracking();

  const isPage = variant === "page";
  const isSidebar = variant === "sidebar";

  const clientProjects = useMemo(
    () =>
      selectedClient
        ? projects.filter((p) => p.clientId === selectedClient.id)
        : [],
    [projects, selectedClient]
  );

  async function handleToggle() {
    if (isTracking) {
      await stopTimer();
    } else {
      await startTimer();
    }
  }

  const errorBlock = error ? (
    <p className="text-[12px] text-red-600 leading-snug">{error}</p>
  ) : null;

  if (isSidebar) {
    return (
      <div className="flex flex-col gap-3 w-full">
        <TimerClientSelect
          clients={clients}
          selected={selectedClient}
          onChange={setSelectedClient}
          disabled={isTracking || busy}
          variant="sidebar"
        />

        {selectedClient && clientProjects.length > 0 && (
          <TimerProjectSelect
            projects={clientProjects}
            selected={selectedProject}
            onChange={setSelectedProject}
            disabled={isTracking || busy}
            variant="sidebar"
          />
        )}

        <input
          type="text"
          value={workDescription}
          onChange={(e) => setWorkDescription(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !isTracking && workDescription.trim()) {
              e.preventDefault();
              void startTimer();
            }
          }}
          placeholder="What are you working on?"
          disabled={isTracking || busy}
          className="w-full rounded-xl border border-line bg-[#FAFBFC] px-3 py-2.5 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300 focus:bg-white disabled:text-gray-700"
        />

        {isTracking && (
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-900" />
              </span>
              Tracking
            </div>
            <span className="font-mono font-semibold text-gray-900 tabular-nums text-lg">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
        )}

        {errorBlock}

        <button
          type="button"
          onClick={() => void handleToggle()}
          disabled={busy || (!isTracking && !workDescription.trim())}
          className={`w-full h-10 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            isTracking
              ? "bg-white text-gray-900 border border-gray-900 hover:bg-gray-50"
              : "btn-primary border border-transparent"
          }`}
          title={isTracking ? "Stop timer" : "Start timer"}
        >
          {isTracking ? (
            <>
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{busy ? "Stopping…" : "Stop"}</span>
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{busy ? "Starting…" : "Start timer"}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className={isPage ? "space-y-2" : undefined}>
    <div
      className={
        isPage
          ? `rounded-2xl border border-line bg-white p-3 flex flex-wrap items-center gap-3 transition-colors ${
              isTracking ? "border-gray-900 bg-gray-50" : ""
            }`
          : "flex items-center gap-2 pl-1 pr-1 w-full"
      }
    >
      {showBackButton && (
        <button
          type="button"
          onClick={onBackToAi}
          className="size-8 rounded-full bg-gray-100 text-gray-700 border border-line flex items-center justify-center shrink-0 hover:bg-gray-200 transition-colors"
          title="Back to AI"
        >
          <Timer className="w-4 h-4" />
        </button>
      )}

      {isPage && (
        <div
          className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isTracking ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-700"
          }`}
        >
          <Timer className="w-5 h-5" />
        </div>
      )}

      <TimerClientSelect
        clients={clients}
        selected={selectedClient}
        onChange={setSelectedClient}
        disabled={isTracking || busy}
        variant={variant}
      />

      {isPage && selectedClient && clientProjects.length > 0 && (
        <TimerProjectSelect
          projects={clientProjects}
          selected={selectedProject}
          onChange={setSelectedProject}
          disabled={isTracking || busy}
          variant="page"
        />
      )}

      <input
        type="text"
        value={workDescription}
        onChange={(e) => setWorkDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isTracking && workDescription.trim()) {
            e.preventDefault();
            void startTimer();
          }
        }}
        placeholder="What are you working on?"
        disabled={isTracking || busy}
        className={`flex-1 bg-transparent border-none outline-none text-gray-900 min-w-0 disabled:text-gray-700 ${
          isPage ? "text-base py-2.5 px-1" : "text-sm py-2.5 placeholder-gray-500"
        }`}
      />

      {isTracking && (
        <div className="flex items-center gap-2 shrink-0">
          {isPage && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-900" />
            </span>
          )}
          <span
            className={`font-mono font-semibold text-gray-900 tabular-nums ${
              isPage ? "text-lg" : "text-sm px-1"
            }`}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={busy || (!isTracking && !workDescription.trim())}
        className={`${
          isPage ? "h-10 px-5 rounded-xl text-sm font-medium gap-2" : "size-8 rounded-full mr-0.5"
        } flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isTracking
            ? "bg-white text-gray-900 border border-gray-900 hover:bg-gray-50"
            : "btn-primary border border-transparent"
        }`}
        title={isTracking ? "Stop timer" : "Start timer"}
      >
        {isTracking ? (
          <>
            <Square className="w-3.5 h-3.5 fill-current" />
            {isPage && <span>{busy ? "Stopping…" : "Stop"}</span>}
          </>
        ) : (
          <>
            <Play className={`w-3.5 h-3.5 fill-current ${isPage ? "" : "ml-0.5"}`} />
            {isPage && <span>{busy ? "Starting…" : "Start"}</span>}
          </>
        )}
      </button>
    </div>
    {isPage && errorBlock}
    </div>
  );
}

function TimerClientSelect({
  clients,
  selected,
  onChange,
  disabled = false,
  variant = "page",
}: {
  clients: TimerClient[];
  selected: TimerClient | null;
  onChange: (client: TimerClient) => void;
  disabled?: boolean;
  variant?: "compact" | "page" | "sidebar";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isPage = variant === "page";
  const isSidebar = variant === "sidebar";

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${isSidebar ? "w-full" : "shrink-0"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 transition-colors text-left disabled:opacity-70 disabled:cursor-not-allowed ${
          isSidebar
            ? "w-full px-3 py-2.5 rounded-xl border border-line bg-[#FAFBFC] hover:bg-white"
            : isPage
              ? "min-w-[160px] px-3 py-2.5 rounded-full border border-line bg-[#FAFBFC] hover:bg-white"
              : "max-w-[140px] px-2.5 py-1.5 rounded-full border border-gray-200 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <Building2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span
          className={`font-medium truncate ${
            isPage ? "text-sm" : "text-xs"
          } ${selected ? "text-gray-900" : "text-gray-400"}`}
        >
          {selected ? selected.name : "Client"}
        </span>
        {!disabled && <ChevronDown className="w-3 h-3 text-gray-400 shrink-0 ml-auto" />}
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-line overflow-hidden z-50 ${
            isSidebar ? "w-full" : "w-[280px]"
          } ${isPage || isSidebar ? "top-full mt-2" : "bottom-full mb-2"}`}
        >
          <div className="p-3 border-b border-gray-50 flex items-center gap-2">
            <input
              type="text"
              autoFocus
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-sm outline-none placeholder-gray-400 font-medium"
            />
          </div>

          <div className="max-h-[200px] overflow-y-auto p-2 space-y-1">
            {filtered.length > 0 ? (
              filtered.map((client) => (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => {
                    onChange(client);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold text-xs shrink-0">
                      {client.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {client.name}
                      </div>
                      {client.company && (
                        <div className="text-xs text-gray-500 truncate">
                          {client.company}
                        </div>
                      )}
                    </div>
                  </div>
                  {selected?.id === client.id && (
                    <Check className="w-4 h-4 text-gray-900 shrink-0" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">
                {clients.length === 0 ? "No clients yet." : "No clients found."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TimerProjectSelect({
  projects,
  selected,
  onChange,
  disabled = false,
  variant = "page",
}: {
  projects: TimerProject[];
  selected: TimerProject | null;
  onChange: (project: TimerProject | null) => void;
  disabled?: boolean;
  variant?: "page" | "sidebar";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidebar = variant === "sidebar";

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className={`relative ${isSidebar ? "w-full" : "shrink-0"}`} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 transition-colors text-left disabled:opacity-70 disabled:cursor-not-allowed ${
          isSidebar
            ? "w-full px-3 py-2.5 rounded-xl border border-line bg-[#FAFBFC] hover:bg-white"
            : "min-w-[140px] px-3 py-2.5 rounded-full border border-line bg-[#FAFBFC] hover:bg-white"
        }`}
      >
        <FolderKanban className="w-3.5 h-3.5 text-gray-400 shrink-0" />
        <span
          className={`text-sm font-medium truncate ${
            selected ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {selected ? selected.name : "Project"}
        </span>
        {!disabled && <ChevronDown className="w-3 h-3 text-gray-400 shrink-0 ml-auto" />}
      </button>

      {isOpen && (
        <div
          className={`absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-line overflow-hidden z-50 ${
            isSidebar ? "w-full" : "w-[260px]"
          }`}
        >
          <div className="max-h-[200px] overflow-y-auto p-2 space-y-1">
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl text-left text-sm text-gray-500"
            >
              No project
              {!selected && <Check className="w-4 h-4 text-gray-900" />}
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onChange(project);
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl text-left"
              >
                <span className="text-sm font-medium text-gray-900 truncate">
                  {project.name}
                </span>
                {selected?.id === project.id && (
                  <Check className="w-4 h-4 text-gray-900 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
