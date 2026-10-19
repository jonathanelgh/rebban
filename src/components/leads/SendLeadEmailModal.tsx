"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  Send,
  Sparkles,
  Mail,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

type MailboxStatus = {
  connected: boolean;
  canSend: boolean;
  email: string | null;
  provider: "gmail" | "outlook" | null;
};

const inputClass =
  "w-full border border-line rounded-xl px-3.5 py-2.5 text-sm text-gray-900 bg-white outline-none focus:border-gray-300 placeholder:text-gray-400";

export function SendLeadEmailModal({
  leadId,
  leadName,
  defaultTo,
  fromForm = false,
  onClose,
  onSent,
}: {
  leadId: string;
  leadName: string;
  defaultTo?: string | null;
  fromForm?: boolean;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(defaultTo || "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [instruction, setInstruction] = useState("");
  const [showAiHint, setShowAiHint] = useState(false);
  const [mailbox, setMailbox] = useState<MailboxStatus>({
    connected: false,
    canSend: false,
    email: null,
    provider: null,
  });
  const [loadingMailbox, setLoadingMailbox] = useState(true);
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ from: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadMailbox() {
      setLoadingMailbox(true);
      try {
        const [gmailRes, outlookRes] = await Promise.all([
          fetch("/api/gmail/status"),
          fetch("/api/outlook/status"),
        ]);
        const gmail = (await gmailRes.json()) as {
          connected?: boolean;
          canSend?: boolean;
          email?: string | null;
        };
        const outlook = (await outlookRes.json()) as {
          connected?: boolean;
          canSend?: boolean;
          email?: string | null;
        };
        if (cancelled) return;

        if (outlook.connected && outlook.canSend) {
          setMailbox({
            connected: true,
            canSend: true,
            email: outlook.email || null,
            provider: "outlook",
          });
        } else if (gmail.connected && gmail.canSend) {
          setMailbox({
            connected: true,
            canSend: true,
            email: gmail.email || null,
            provider: "gmail",
          });
        } else {
          setMailbox({
            connected: Boolean(gmail.connected || outlook.connected),
            canSend: false,
            email: gmail.email || outlook.email || null,
            provider: gmail.connected
              ? "gmail"
              : outlook.connected
                ? "outlook"
                : null,
          });
        }
      } catch {
        if (!cancelled) {
          setMailbox({
            connected: false,
            canSend: false,
            email: null,
            provider: null,
          });
        }
      } finally {
        if (!cancelled) setLoadingMailbox(false);
      }
    }
    void loadMailbox();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDraft() {
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/email/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: instruction.trim() || undefined,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        subject?: string;
        body?: string;
      };
      if (!res.ok) throw new Error(json.error || "Could not draft email.");
      setSubject(json.subject || "");
      setMessage(json.body || "");
      setShowAiHint(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft email.");
    } finally {
      setDrafting(false);
    }
  }

  async function handleSend() {
    if (!mailbox.canSend) {
      setError(
        "Connect Gmail or Outlook in Settings → Integrations to send from your email."
      );
      return;
    }
    if (!to.trim() || !to.includes("@")) {
      setError("Add a valid recipient email.");
      return;
    }
    if (!subject.trim()) {
      setError("Add a subject.");
      return;
    }
    if (!message.trim()) {
      setError("Write a message, or let AI draft one.");
      return;
    }

    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/leads/${leadId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: to.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        from?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to send email.");
      setSentInfo({ from: json.from || mailbox.email || "your mailbox" });
      window.setTimeout(() => {
        onSent();
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <ModalOverlay onClose={sending ? undefined : onClose} zClass="z-[90]">
      <div
        className={modalPanelClass(
          "max-w-[640px]",
          "max-sm:!max-h-[100dvh] max-sm:h-[100dvh] max-sm:rounded-none"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Email lead
            </h2>
            <p className="text-sm text-gray-500 mt-1 truncate">
              To{" "}
              <span className="font-medium text-gray-700">{leadName}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0 cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-4">
          {loadingMailbox ? (
            <div className="rounded-2xl border border-line bg-[#FAFBFC] px-4 py-3 text-[13px] text-gray-500">
              Checking connected mailbox…
            </div>
          ) : mailbox.canSend ? (
            <div className="rounded-2xl border border-emerald-100 bg-[#F3FAF6] px-4 py-3 text-[13px] text-emerald-800 flex items-start gap-2.5">
              <Mail className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                Sending from{" "}
                <span className="font-semibold">
                  {mailbox.provider === "outlook" ? "Outlook" : "Gmail"}
                </span>
                {mailbox.email ? (
                  <>
                    {" "}
                    · <span className="font-medium">{mailbox.email}</span>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-900 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <p>
                  {mailbox.connected
                    ? "Your mailbox is connected but can’t send yet. Reconnect with send permission."
                    : "Connect Gmail or Outlook to send from your own email."}
                </p>
                <Link
                  href="/settings?section=integrations"
                  className="inline-flex font-semibold text-emerald-700 hover:underline mt-1 cursor-pointer"
                >
                  Open Settings → Integrations
                </Link>
              </div>
            </div>
          )}

          {sentInfo ? (
            <div className="rounded-2xl border border-emerald-100 bg-[#F3FAF6] px-4 py-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-3" />
              <p className="text-sm font-semibold text-gray-900">Email sent</p>
              <p className="text-[13px] text-gray-500 mt-1">
                From {sentInfo.from}
              </p>
            </div>
          ) : (
            <>
              <label className="block">
                <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  To
                </span>
                <input
                  type="email"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="lead@company.com"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  Subject
                </span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Quick note about your inquiry"
                  className={inputClass}
                />
              </label>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-500" />
                      Write with AI
                    </p>
                    <p className="text-[12px] text-gray-500 mt-1">
                      Uses your profile plus this lead’s details
                      {fromForm ? " and every form answer" : ""}.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAiHint((v) => !v)}
                    className="text-[12px] font-medium text-blue-600 hover:text-blue-700 cursor-pointer shrink-0"
                  >
                    {showAiHint ? "Hide" : "Guide AI"}
                  </button>
                </div>
                {showAiHint ? (
                  <textarea
                    rows={2}
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Optional: mention pricing, ask for a call Thursday, keep it short…"
                    className={`${inputClass} resize-none min-h-[72px]`}
                  />
                ) : null}
                <button
                  type="button"
                  disabled={drafting}
                  onClick={() => void handleDraft()}
                  className="inline-flex items-center justify-center gap-2 w-full sm:w-auto rounded-xl bg-white border border-blue-200 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Sparkles className="w-4 h-4" />
                  {drafting ? "Writing…" : "Draft email"}
                </button>
              </div>

              <label className="block">
                <span className="text-[13px] font-medium text-gray-700 mb-1.5 block">
                  Message
                </span>
                <textarea
                  rows={10}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Hi …"
                  className={`${inputClass} resize-none min-h-[220px] leading-relaxed`}
                />
              </label>
            </>
          )}

          {error ? (
            <p className="text-[13px] text-red-600">{error}</p>
          ) : null}
        </div>

        {!sentInfo ? (
          <div className={`${modalFooterClass} bg-gray-50/50`}>
            <button
              type="button"
              onClick={onClose}
              disabled={sending}
              className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={sending || !mailbox.canSend}
              onClick={() => void handleSend()}
              className="btn-primary inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? (
                "Sending…"
              ) : (
                <>
                  Send email
                  <Send className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        ) : null}
      </div>
    </ModalOverlay>
  );
}
