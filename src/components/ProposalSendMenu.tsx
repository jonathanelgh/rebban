"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import {
  Activity,
  Ban,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  PenLine,
  Send,
  X,
} from "lucide-react";
import type { Enums } from "@/types/database";

type ProposalStatus = Enums<"proposal_status">;

const SENT_STATUSES = new Set<ProposalStatus>([
  "sent",
  "viewed",
  "accepted",
  "declined",
]);

const ACTIVE_SENT_STATUSES = new Set<ProposalStatus>(["sent", "viewed"]);

export function isProposalAlreadySent(status: ProposalStatus | null | undefined) {
  if (!status) return false;
  return SENT_STATUSES.has(status);
}

/** Draft that was live before (Make changes) — Close should restore this. */
export function resumeStatusFromTimestamps(row: {
  sent_at?: string | null;
  viewed_at?: string | null;
  accepted_at?: string | null;
  declined_at?: string | null;
}): ProposalStatus | null {
  if (!row.sent_at) return null;
  if (row.accepted_at) return "accepted";
  if (row.declined_at) return "declined";
  if (row.viewed_at) return "viewed";
  return "sent";
}

export function ProposalSendMenu({
  status,
  clientUrl,
  proposalId,
  editingPreviouslySent = false,
  onSend,
  onSendAgain,
  onMakeChanges,
  onCloseEditing,
  onResendSigned,
  onCancelAutomation,
  onViewActivity,
  busy = false,
}: {
  status: ProposalStatus | null;
  clientUrl?: string | null;
  proposalId?: string | null;
  editingPreviouslySent?: boolean;
  onSend: () => void | Promise<void>;
  onSendAgain: () => void | Promise<void>;
  onMakeChanges: () => void | Promise<void>;
  onCloseEditing?: () => void | Promise<void>;
  onResendSigned?: () => void | Promise<void>;
  onCancelAutomation?: () => void | Promise<void>;
  onViewActivity?: () => void;
  busy?: boolean;
}) {
  const alreadySent = isProposalAlreadySent(status);
  const isActiveSent = Boolean(status && ACTIVE_SENT_STATUSES.has(status));
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function copyLink() {
    if (!clientUrl) return;
    try {
      await navigator.clipboard.writeText(clientUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="flex items-center gap-2 ml-2">
      {editingPreviouslySent ? (
        <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-800 border border-amber-100 px-3 py-1.5 text-[13px] font-semibold">
          Draft
        </span>
      ) : !alreadySent ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSend()}
          className="hidden md:inline-flex btn-primary px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-60"
        >
          Send Proposal
        </button>
      ) : null}

      {editingPreviouslySent && onCloseEditing ? (
        <button
          type="button"
          disabled={busy}
          aria-label="Done editing"
          title="Done editing"
          onClick={() => void onCloseEditing()}
          className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-60"
        >
          <X className="w-4 h-4" />
        </button>
      ) : alreadySent ? (
        <div ref={rootRef} className="relative">
          <button
            type="button"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label="More proposal actions"
            onClick={() => setOpen((prev) => !prev)}
            className={`p-2 border rounded-lg transition-colors disabled:opacity-60 ${
              open
                ? "border-gray-300 bg-gray-50 text-gray-900"
                : "border-gray-200 text-gray-400 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {open && (
            <div
              id={menuId}
              role="menu"
              className="absolute right-0 z-50 mt-2 w-[252px] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_12px_40px_rgba(16,24,40,0.14)]"
            >
              {status === "accepted" && proposalId ? (
                <>
                  <MenuItem
                    icon={<Download className="w-4 h-4" />}
                    label="Download signed PDF"
                    description="Certificate + audit log copy"
                    onClick={() => {
                      setOpen(false);
                      window.open(
                        `/api/proposals/${proposalId}/signed-pdf`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                  />
                  {onResendSigned ? (
                    <MenuItem
                      icon={<Send className="w-4 h-4" />}
                      label={busy ? "Sending…" : "Email signed PDF"}
                      description="Resend confirmation to the signer"
                      disabled={busy}
                      onClick={() => {
                        setOpen(false);
                        void onResendSigned();
                      }}
                    />
                  ) : null}
                </>
              ) : null}
              {onViewActivity ? (
                <MenuItem
                  icon={<Activity className="w-4 h-4" />}
                  label="Activity"
                  description="Opens, sends, and client decisions"
                  className="md:hidden"
                  onClick={() => {
                    setOpen(false);
                    onViewActivity();
                  }}
                />
              ) : null}
              <MenuItem
                icon={<Send className="w-4 h-4" />}
                label={busy ? "Sending…" : "Send again"}
                description="Resend to the same recipient"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  void onSendAgain();
                }}
              />
              <MenuItem
                icon={<PenLine className="w-4 h-4" />}
                label="Make changes"
                description="Edit this proposal"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  void onMakeChanges();
                }}
              />
              {isActiveSent && onCancelAutomation ? (
                <MenuItem
                  icon={<Ban className="w-4 h-4" />}
                  label={busy ? "Cancelling…" : "Cancel automation"}
                  description="Stop remaining follow-up emails"
                  disabled={busy}
                  onClick={() => {
                    setOpen(false);
                    void onCancelAutomation();
                  }}
                />
              ) : null}
              {clientUrl && (
                <>
                  <div className="my-1.5 mx-3 border-t border-gray-100" />
                  <MenuItem
                    icon={<Copy className="w-4 h-4" />}
                    label={copied ? "Link copied" : "Copy client link"}
                    onClick={() => {
                      void copyLink();
                    }}
                  />
                  <MenuItem
                    icon={<ExternalLink className="w-4 h-4" />}
                    label="Open client link"
                    onClick={() => {
                      setOpen(false);
                      window.open(clientUrl, "_blank", "noopener,noreferrer");
                    }}
                  />
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  description,
  onClick,
  disabled = false,
  className = "",
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-[#FAFBFC] disabled:opacity-50 ${className}`}
    >
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#F4F5F7] text-gray-600">
        {icon}
      </span>
      <span className="min-w-0 pt-0.5">
        <span className="block text-[14px] font-medium text-gray-900">
          {label}
        </span>
        {description && (
          <span className="block text-[12px] text-gray-400 mt-0.5 leading-snug">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
