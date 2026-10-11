"use client";

import React, { useState, Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  ArrowRight,
  Paperclip,
  FileText,
  X,
  Timer,
} from "lucide-react";
import { useTimeTracking } from "@/components/TimeTrackingContext";
import { TimerStartForm } from "@/components/TimerStartForm";

type Attachment = {
  id: string;
  name: string;
  size: string;
  type: string;
};

function GlobalChatBarInner() {
  const pathname = usePathname();
  const { isTracking } = useTimeTracking();
  const [mode, setMode] = useState<"ai" | "timer">("ai");
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // After starting a timer, return the bottom bar to AI mode
  useEffect(() => {
    if (isTracking) {
      setMode("ai");
    }
  }, [isTracking]);

  const handleAttachDocument = () => {
    if (attachments.length === 0) {
      setAttachments([
        {
          id: "1",
          name: "Client_Meeting_Transcript.pdf",
          size: "1.2 MB",
          type: "Document",
        },
      ]);
    } else {
      setAttachments([
        ...attachments,
        {
          id: Date.now().toString(),
          name: "Project_Notes.docx",
          size: "450 KB",
          type: "Document",
        },
      ]);
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments(attachments.filter((a) => a.id !== id));
  };

  const switchToTimer = () => {
    setMode("timer");
    setAttachments([]);
  };

  const switchToAi = () => {
    setMode("ai");
  };

  return (
    <div
      id="global-chat-bar"
      className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-[90] pointer-events-none transition-all duration-300 ease-out"
    >
      <div className="bg-white/90 backdrop-blur-xl border border-gray-200 shadow-[0_8px_30px_rgb(0,0,0,0.08)] rounded-[2rem] p-2 flex flex-col transition-all duration-300 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] pointer-events-auto">
        {mode === "ai" ? (
          <>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 px-3 pt-2 pb-1">
                {attachments.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-2 pr-3 shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-800 truncate max-w-[160px]">
                        {file.name}
                      </span>
                      <span className="text-[10px] text-gray-500">
                        {file.type} • {file.size}
                      </span>
                    </div>
                    <button
                      onClick={() => removeAttachment(file.id)}
                      className="ml-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-1 rounded-full transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2 pl-2 pr-1">
              <button className="size-8 rounded-full bg-blue-50 text-[#3B82F6] flex items-center justify-center shrink-0 hover:bg-blue-100 transition-colors">
                <Sparkles className="w-4 h-4" />
              </button>

              <button
                onClick={switchToTimer}
                className={`relative size-8 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                  isTracking
                    ? "text-emerald-600 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                    : "text-gray-400 border-gray-200 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-200"
                }`}
                title={isTracking ? "Timer running — open time tracking" : "Time tracking"}
              >
                <Timer className="w-4 h-4" />
                {isTracking && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
              </button>

              <button
                onClick={handleAttachDocument}
                className="size-8 rounded-full text-gray-400 flex items-center justify-center shrink-0 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                title="Attach document or transcript"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                placeholder={
                  pathname.includes("/edit")
                    ? "Ask AI to draft deliverables or summarize notes..."
                    : "Ask or search for anything. Use @ to tag..."
                }
                className="flex-1 bg-transparent border-none outline-none text-sm placeholder-gray-500 py-2.5 text-gray-900"
              />

              <button className="size-8 rounded-full bg-gray-900 text-white border border-transparent flex items-center justify-center shrink-0 hover:bg-black transition-colors">
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <TimerStartForm
            variant="compact"
            showBackButton
            onBackToAi={switchToAi}
          />
        )}
      </div>
    </div>
  );
}

export function GlobalChatBar() {
  return (
    <Suspense fallback={null}>
      <GlobalChatBarInner />
    </Suspense>
  );
}
