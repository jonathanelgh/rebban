"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Timer,
  Play,
  Square,
  ChevronDown,
  Check,
  Building2,
} from "lucide-react";
import {
  useTimeTracking,
  formatElapsed,
  TIMER_CLIENTS,
  type TimerClient,
} from "@/components/TimeTrackingContext";

type TimerStartFormProps = {
  variant?: "compact" | "page";
  onBackToAi?: () => void;
  showBackButton?: boolean;
};

export function TimerStartForm({
  variant = "page",
  onBackToAi,
  showBackButton = false,
}: TimerStartFormProps) {
  const {
    selectedClient,
    setSelectedClient,
    workDescription,
    setWorkDescription,
    isTracking,
    elapsedSeconds,
    startTimer,
    stopTimer,
    canStart,
  } = useTimeTracking();

  const isPage = variant === "page";

  return (
    <div
      className={
        isPage
          ? `surface-panel p-3 flex items-center gap-3 transition-colors ${
              isTracking ? "border-emerald-200 bg-[#F3FAF6]" : ""
            }`
          : "flex items-center gap-2 pl-1 pr-1 w-full"
      }
    >
      {showBackButton && (
        <button
          onClick={onBackToAi}
          className="size-8 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0 hover:bg-emerald-100 transition-colors"
          title="Back to AI"
        >
          <Timer className="w-4 h-4" />
        </button>
      )}

      {isPage && (
        <div
          className={`size-10 rounded-2xl flex items-center justify-center shrink-0 ${
            isTracking
              ? "bg-emerald-100 text-emerald-600"
              : "bg-[#EAF3FF] text-[#3B82F6]"
          }`}
        >
          <Timer className="w-5 h-5" />
        </div>
      )}

      <TimerClientSelect
        selected={selectedClient}
        onChange={setSelectedClient}
        disabled={isTracking}
        variant={variant}
      />

      <input
        type="text"
        value={workDescription}
        onChange={(e) => setWorkDescription(e.target.value)}
        placeholder="What are you working on?"
        disabled={isTracking}
        className={`flex-1 bg-transparent border-none outline-none text-gray-900 min-w-0 disabled:text-gray-700 ${
          isPage ? "text-base py-2.5 px-1" : "text-sm py-2.5 placeholder-gray-500"
        }`}
      />

      {isTracking && (
        <div className="flex items-center gap-2 shrink-0">
          {isPage && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          )}
          <span
            className={`font-mono font-semibold text-emerald-600 tabular-nums ${
              isPage ? "text-lg" : "text-sm px-1"
            }`}
          >
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      )}

      <button
        onClick={() => (isTracking ? stopTimer() : startTimer())}
        disabled={!isTracking && !canStart}
        className={`${
          isPage ? "h-10 px-5 rounded-xl text-sm font-medium gap-2" : "size-8 rounded-full mr-0.5"
        } border border-transparent flex items-center justify-center shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          isTracking
            ? "bg-red-500 text-white hover:bg-red-600"
            : "bg-emerald-500 text-white hover:bg-emerald-600"
        }`}
        title={isTracking ? "Stop timer" : "Start timer"}
      >
        {isTracking ? (
          <>
            <Square className={`${isPage ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} fill-current`} />
            {isPage && <span>Stop</span>}
          </>
        ) : (
          <>
            <Play className={`${isPage ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} fill-current ${isPage ? "" : "ml-0.5"}`} />
            {isPage && <span>Start</span>}
          </>
        )}
      </button>
    </div>
  );
}

function TimerClientSelect({
  selected,
  onChange,
  disabled = false,
  variant = "page",
}: {
  selected: TimerClient | null;
  onChange: (client: TimerClient) => void;
  disabled?: boolean;
  variant?: "compact" | "page";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const isPage = variant === "page";

  const filtered = TIMER_CLIENTS.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.company && c.company.toLowerCase().includes(search.toLowerCase()))
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
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 transition-colors text-left disabled:opacity-70 disabled:cursor-not-allowed ${
          isPage
            ? "min-w-[160px] px-3 py-2.5 rounded-full border border-[#EEF0F3] bg-[#FAFBFC] hover:bg-white"
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
          className={`absolute left-0 w-[280px] bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-gray-100 overflow-hidden z-50 ${
            isPage ? "top-full mt-2" : "bottom-full mb-2"
          }`}
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
              filtered.map((client, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    onChange(client);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className="w-full flex items-center justify-between p-2 hover:bg-gray-50 rounded-xl transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs shrink-0">
                      {client.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {client.name}
                      </div>
                      <div className="text-xs text-gray-500">{client.company}</div>
                    </div>
                  </div>
                  {selected?.name === client.name && (
                    <Check className="w-4 h-4 text-emerald-600" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-sm text-gray-500">
                No clients found.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
