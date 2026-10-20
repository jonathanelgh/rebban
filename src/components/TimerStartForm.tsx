"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Timer,
  Play,
  Square,
  ChevronDown,
  Check,
  Building2,
  FolderKanban,
  X,
} from "lucide-react";
import {
  useTimeTracking,
  formatElapsed,
  type TimerClient,
  type TimerProject,
} from "@/components/TimeTrackingContext";
import { TaskSuggestInput } from "@/components/TaskSuggestInput";
import { ModalOverlay, modalPanelClass } from "@/components/ModalFrame";

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
    clientTasks,
    selectedClient,
    setSelectedClient,
    selectedProject,
    setSelectedProject,
    setSelectedTask,
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
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const clientProjects = useMemo(
    () =>
      selectedClient
        ? projects.filter((p) => p.clientId === selectedClient.id)
        : [],
    [projects, selectedClient]
  );

  const taskOptions = useMemo(
    () => clientTasks.map((t) => ({ id: t.id, title: t.title })),
    [clientTasks]
  );

  const [stopPromptOpen, setStopPromptOpen] = useState(false);
  const [stopDescription, setStopDescription] = useState("");
  const [stopPromptError, setStopPromptError] = useState<string | null>(null);

  async function handleToggle() {
    if (isTracking) {
      if (!workDescription.trim()) {
        setStopDescription("");
        setStopPromptError(null);
        setStopPromptOpen(true);
        return;
      }
      await stopTimer();
      return;
    }
    await startTimer();
  }

  async function confirmStopWithDescription() {
    const next = stopDescription.trim();
    if (!next) {
      setStopPromptError("Add a short note about what you worked on.");
      return;
    }
    setStopPromptError(null);
    setWorkDescription(next);
    setStopPromptOpen(false);
    await stopTimer({ description: next });
  }

  const errorBlock = error ? (
    <p className="text-[12px] text-red-600 leading-snug">{error}</p>
  ) : null;

  const stopPromptModal = stopPromptOpen ? (
    <ModalOverlay
      onClose={() => {
        if (!busy) setStopPromptOpen(false);
      }}
      zClass="z-[90]"
    >
      <div className={modalPanelClass("max-w-[440px]")}>
        <div className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 flex items-start justify-between gap-3 border-b border-line shrink-0">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              What did you work on?
            </h2>
            <p className="text-[13px] text-gray-500 mt-1 leading-snug">
              Add a quick note before stopping the timer
              {elapsedSeconds > 0
                ? ` · ${formatElapsed(elapsedSeconds)}`
                : ""}
              .
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setStopPromptOpen(false)}
            className="p-2 rounded-full text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-5 sm:px-6 py-4 space-y-3">
          <textarea
            value={stopDescription}
            onChange={(e) => {
              setStopDescription(e.target.value);
              if (stopPromptError) setStopPromptError(null);
            }}
            rows={3}
            autoFocus
            placeholder="e.g. Homepage redesign, client call notes…"
            className="w-full rounded-xl border border-line bg-[#FAFBFC] px-3.5 py-3 text-[15px] text-gray-900 outline-none resize-none focus:bg-white focus:border-gray-300"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void confirmStopWithDescription();
              }
            }}
          />
          {stopPromptError ? (
            <p className="text-[13px] text-red-600">{stopPromptError}</p>
          ) : null}
        </div>
        <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => setStopPromptOpen(false)}
            className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Keep timing
          </button>
          <button
            type="button"
            disabled={busy || !stopDescription.trim()}
            onClick={() => void confirmStopWithDescription()}
            className="btn-primary px-5 py-2.5 rounded-full text-sm disabled:opacity-50"
          >
            {busy ? "Stopping…" : "Save & stop"}
          </button>
        </div>
      </div>
    </ModalOverlay>
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

        <div className="w-full rounded-xl border border-line bg-[#FAFBFC] px-3 py-2.5 focus-within:border-gray-300 focus-within:bg-white">
          <TaskSuggestInput
            value={workDescription}
            tasks={taskOptions}
            onChange={setWorkDescription}
            onSelectTask={(task) =>
              setSelectedTask({
                id: task.id,
                title: task.title,
                clientId: selectedClient?.id ?? null,
              })
            }
            onEnter={() => {
              if (!isTracking) void startTimer();
            }}
            placeholder="What are you working on? (optional)"
            disabled={busy}
            className="text-sm"
          />
        </div>

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
          disabled={busy}
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
        {stopPromptModal}
      </div>
    );
  }

  function renderTaskField(className: string) {
    return (
      <TaskSuggestInput
        value={workDescription}
        tasks={taskOptions}
        onChange={setWorkDescription}
        onSelectTask={(task) =>
          setSelectedTask({
            id: task.id,
            title: task.title,
            clientId: selectedClient?.id ?? null,
          })
        }
        onEnter={() => {
          if (!isTracking) void startTimer();
        }}
        placeholder="What are you working on? (optional)"
        disabled={busy}
        className={className}
      />
    );
  }

  function renderToggleButton(opts?: {
    fullWidth?: boolean;
    showLabel?: boolean;
  }) {
    const showLabel = opts?.showLabel ?? isPage;
    return (
      <button
        type="button"
        onClick={() => void handleToggle()}
        disabled={busy}
        className={`${
          opts?.fullWidth
            ? "w-full h-11 rounded-xl text-sm font-semibold gap-2"
            : isPage
              ? "h-10 px-5 rounded-xl text-sm font-medium gap-2"
              : "size-8 rounded-full mr-0.5"
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
            {showLabel && <span>{busy ? "Stopping…" : "Stop"}</span>}
          </>
        ) : (
          <>
            <Play
              className={`w-3.5 h-3.5 fill-current ${showLabel ? "" : "ml-0.5"}`}
            />
            {showLabel && <span>{busy ? "Starting…" : "Start"}</span>}
          </>
        )}
      </button>
    );
  }

  if (isPage) {
    const desktopForm = (
      <div className="space-y-2">
        <div
          className={`rounded-2xl border border-line bg-white p-3 flex flex-wrap items-center gap-3 transition-colors ${
            isTracking ? "border-gray-900 bg-gray-50" : ""
          }`}
        >
          <div
            className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isTracking ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            <Timer className="w-5 h-5" />
          </div>

          <TimerClientSelect
            clients={clients}
            selected={selectedClient}
            onChange={setSelectedClient}
            disabled={isTracking || busy}
            variant="page"
          />

          {selectedClient && clientProjects.length > 0 && (
            <TimerProjectSelect
              projects={clientProjects}
              selected={selectedProject}
              onChange={setSelectedProject}
              disabled={isTracking || busy}
              variant="page"
            />
          )}

          {renderTaskField("flex-1 min-w-0 text-base py-2.5 px-1")}

          {isTracking && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-gray-900" />
              </span>
              <span className="font-mono font-semibold text-gray-900 tabular-nums text-lg">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
          )}

          {renderToggleButton()}
        </div>
        {errorBlock}
      </div>
    );

    const mobileDock = (
      <div
        className={`border-t border-line bg-white/95 backdrop-blur-sm shadow-[0_-8px_30px_rgba(16,24,40,0.1)] pb-[env(safe-area-inset-bottom)] ${
          isTracking ? "border-gray-900/20" : ""
        }`}
      >
        <div className="px-3 pt-3 pb-3 space-y-2.5">
          <div className="flex items-center gap-2">
            <div
              className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${
                isTracking
                  ? "bg-[#2563EB] text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              <Timer className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-none">
              <TimerClientSelect
                clients={clients}
                selected={selectedClient}
                onChange={setSelectedClient}
                disabled={isTracking || busy}
                variant="page"
                menuPlacement="up"
              />
              {selectedClient && clientProjects.length > 0 && (
                <TimerProjectSelect
                  projects={clientProjects}
                  selected={selectedProject}
                  onChange={setSelectedProject}
                  disabled={isTracking || busy}
                  variant="page"
                  menuPlacement="up"
                />
              )}
            </div>
            {isTracking && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gray-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-900" />
                </span>
                <span className="font-mono font-semibold text-gray-900 tabular-nums text-base">
                  {formatElapsed(elapsedSeconds)}
                </span>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line bg-[#FAFBFC] px-3 py-2.5 focus-within:border-gray-300 focus-within:bg-white">
            {renderTaskField("w-full text-base py-0.5")}
          </div>

          {errorBlock}
          {renderToggleButton({ fullWidth: true, showLabel: true })}
        </div>
      </div>
    );

    return (
      <>
        <div className="hidden md:block">{desktopForm}</div>
        {portalReady
          ? createPortal(
              <div className="md:hidden fixed bottom-0 inset-x-0 z-[40]">
                {mobileDock}
              </div>,
              document.body
            )
          : null}
        {stopPromptModal}
      </>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 pl-1 pr-1 w-full">
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

        <TimerClientSelect
          clients={clients}
          selected={selectedClient}
          onChange={setSelectedClient}
          disabled={isTracking || busy}
          variant={variant}
        />

        {renderTaskField("flex-1 min-w-0 text-sm py-2.5")}

        {isTracking && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono font-semibold text-gray-900 tabular-nums text-sm px-1">
              {formatElapsed(elapsedSeconds)}
            </span>
          </div>
        )}

        {renderToggleButton({ showLabel: false })}
      </div>
      {stopPromptModal}
    </>
  );
}

function TimerClientSelect({
  clients,
  selected,
  onChange,
  disabled = false,
  variant = "page",
  menuPlacement = "down",
}: {
  clients: TimerClient[];
  selected: TimerClient | null;
  onChange: (client: TimerClient) => void;
  disabled?: boolean;
  variant?: "compact" | "page" | "sidebar";
  menuPlacement?: "up" | "down";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isPage = variant === "page";
  const isSidebar = variant === "sidebar";
  const useSheet = menuPlacement === "up";

  const filtered = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company?.toLowerCase().includes(search.toLowerCase()) ?? false)
  );

  useEffect(() => {
    if (useSheet || !isOpen) return;
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
  }, [isOpen, useSheet]);

  function close() {
    setIsOpen(false);
    setSearch("");
  }

  function pick(client: TimerClient) {
    onChange(client);
    close();
  }

  const list = (
    <div className={`space-y-1 ${useSheet ? "p-2" : "p-2"}`}>
      {filtered.length > 0 ? (
        filtered.map((client) => (
          <button
            key={client.id}
            type="button"
            onClick={() => pick(client)}
            className={`w-full flex items-center justify-between rounded-xl transition-colors text-left hover:bg-gray-50 ${
              useSheet ? "p-3.5 gap-3" : "p-2 gap-3"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className={`rounded-full bg-gray-100 text-gray-700 flex items-center justify-center font-bold shrink-0 ${
                  useSheet ? "w-10 h-10 text-sm" : "w-7 h-7 text-xs"
                }`}
              >
                {client.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <div
                  className={`font-medium text-gray-900 truncate ${
                    useSheet ? "text-[15px]" : "text-sm"
                  }`}
                >
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
  );

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

      {isOpen && useSheet ? (
        <ModalOverlay onClose={close} zClass="z-[90]">
          <div
            className={modalPanelClass(
              "max-w-[560px]",
              "!max-h-[88dvh] h-[88dvh] rounded-t-[1.75rem]"
            )}
          >
            <div className="px-5 pt-4 pb-3 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                  Select client
                </h2>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  Who are you tracking time for?
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-line shrink-0">
              <input
                type="search"
                autoFocus
                placeholder="Search clients..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-line bg-[#FAFBFC] px-3.5 py-3 text-[15px] outline-none placeholder-gray-400 font-medium focus:bg-white focus:border-gray-300"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 pb-[env(safe-area-inset-bottom)]">
              {list}
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      {isOpen && !useSheet ? (
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
          <div className="max-h-[200px] overflow-y-auto">{list}</div>
        </div>
      ) : null}
    </div>
  );
}

function TimerProjectSelect({
  projects,
  selected,
  onChange,
  disabled = false,
  variant = "page",
  menuPlacement = "down",
}: {
  projects: TimerProject[];
  selected: TimerProject | null;
  onChange: (project: TimerProject | null) => void;
  disabled?: boolean;
  variant?: "page" | "sidebar";
  menuPlacement?: "up" | "down";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isSidebar = variant === "sidebar";
  const useSheet = menuPlacement === "up";

  useEffect(() => {
    if (useSheet || !isOpen) return;
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
  }, [isOpen, useSheet]);

  function close() {
    setIsOpen(false);
  }

  const list = (
    <div className="p-2 space-y-1">
      <button
        type="button"
        onClick={() => {
          onChange(null);
          close();
        }}
        className={`w-full flex items-center justify-between rounded-xl text-left text-gray-500 hover:bg-gray-50 ${
          useSheet ? "p-3.5 text-[15px]" : "p-2 text-sm"
        }`}
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
            close();
          }}
          className={`w-full flex items-center justify-between rounded-xl text-left hover:bg-gray-50 ${
            useSheet ? "p-3.5" : "p-2"
          }`}
        >
          <span
            className={`font-medium text-gray-900 truncate ${
              useSheet ? "text-[15px]" : "text-sm"
            }`}
          >
            {project.name}
          </span>
          {selected?.id === project.id && (
            <Check className="w-4 h-4 text-gray-900 shrink-0" />
          )}
        </button>
      ))}
    </div>
  );

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

      {isOpen && useSheet ? (
        <ModalOverlay onClose={close} zClass="z-[90]">
          <div
            className={modalPanelClass(
              "max-w-[560px]",
              "!max-h-[88dvh] h-[88dvh] rounded-t-[1.75rem]"
            )}
          >
            <div className="px-5 pt-4 pb-3 border-b border-line flex items-center justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
                  Select project
                </h2>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  Optional — leave blank if none.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-2 rounded-full text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 pb-[env(safe-area-inset-bottom)]">
              {list}
            </div>
          </div>
        </ModalOverlay>
      ) : null}

      {isOpen && !useSheet ? (
        <div
          className={`absolute left-0 top-full mt-2 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-line overflow-hidden z-50 ${
            isSidebar ? "w-full" : "w-[260px]"
          }`}
        >
          <div className="max-h-[200px] overflow-y-auto">{list}</div>
        </div>
      ) : null}
    </div>
  );
}
