"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageSquare,
  Send,
  X,
  Zap,
} from "lucide-react";
import { DEFAULT_INVOICE_SEND_MESSAGE } from "@/lib/invoices/send";
import {
  REMINDER_SEQUENCES,
  formatReminderOffsetLabel,
  getReminderSequence,
  type ReminderSequenceKey,
  type ReminderStepTemplate,
} from "@/lib/invoices/reminders";
import {
  ModalOverlay,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";

type StepId = "recipient" | "automation" | "message";

const STEPS: { id: StepId; label: string; icon: typeof Mail }[] = [
  { id: "recipient", label: "Recipient", icon: Mail },
  { id: "automation", label: "Automation", icon: Zap },
  { id: "message", label: "Message", icon: MessageSquare },
];

export function SendInvoiceModal({
  invoiceId,
  invoiceLabel,
  dueDate,
  defaultEmail,
  defaultName,
  defaultReminderSequence,
  onClose,
  onSent,
}: {
  invoiceId: string;
  invoiceLabel: string;
  dueDate?: string | null;
  defaultEmail?: string | null;
  defaultName?: string | null;
  defaultReminderSequence?: ReminderSequenceKey | null;
  onClose: () => void;
  onSent: (result: {
    url: string;
    recipientEmail: string;
    status?: string;
    paymentToken?: string;
    remindersScheduled?: number;
  }) => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [email, setEmail] = useState(defaultEmail || "");
  const [name, setName] = useState(defaultName || "");
  const [sequenceKey, setSequenceKey] = useState<ReminderSequenceKey>(() => {
    if (!dueDate?.trim()) return "none";
    if (
      defaultReminderSequence === "none" ||
      defaultReminderSequence === "gentle" ||
      defaultReminderSequence === "standard" ||
      defaultReminderSequence === "persistent"
    ) {
      return defaultReminderSequence;
    }
    return "standard";
  });
  const [customSteps, setCustomSteps] = useState<ReminderStepTemplate[] | null>(
    null
  );
  const [message, setMessage] = useState(DEFAULT_INVOICE_SEND_MESSAGE);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];
  const sequence = useMemo(
    () => getReminderSequence(sequenceKey),
    [sequenceKey]
  );
  const activeSteps = customSteps ?? sequence.steps;
  const hasDueDate = Boolean(dueDate?.trim());

  function selectSequence(key: ReminderSequenceKey) {
    if (key !== "none" && !hasDueDate) {
      setError("Set a due date on the invoice before enabling reminders.");
      return;
    }
    setError(null);
    setSequenceKey(key);
    setCustomSteps(null);
  }

  function updateStepField(
    index: number,
    patch: Partial<ReminderStepTemplate>
  ) {
    setCustomSteps((prev) => {
      const base = prev ?? getReminderSequence(sequenceKey).steps;
      return base.map((item, i) => (i === index ? { ...item, ...patch } : item));
    });
  }

  function goNext() {
    setError(null);
    if (step.id === "recipient") {
      if (!email.trim()) {
        setError("Recipient email is required.");
        return;
      }
    }
    if (step.id === "automation") {
      if (sequenceKey !== "none" && !hasDueDate) {
        setError("Set a due date on the invoice before enabling reminders.");
        return;
      }
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
  }

  function goBack() {
    setError(null);
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleSend() {
    if (!email.trim()) {
      setError("Recipient email is required.");
      setStepIndex(0);
      return;
    }
    if (sequenceKey !== "none" && !hasDueDate) {
      setError("Set a due date on the invoice before enabling reminders.");
      setStepIndex(1);
      return;
    }

    setSending(true);
    setError(null);

    const res = await fetch(`/api/invoices/${invoiceId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientEmail: email.trim(),
        recipientName: name.trim(),
        message: message.trim() || DEFAULT_INVOICE_SEND_MESSAGE,
        sequenceKey,
        reminderSteps:
          sequenceKey === "none"
            ? []
            : activeSteps.map((s) => ({
                offsetDays: s.offsetDays,
                subject: s.subject,
                body: s.body,
              })),
      }),
    });
    const json = await res.json();
    setSending(false);

    if (!res.ok) {
      setError(json.error || "Failed to send invoice.");
      return;
    }

    onSent({
      url: json.url,
      recipientEmail: json.recipientEmail,
      status: json.status,
      paymentToken: json.paymentToken,
      remindersScheduled: json.remindersScheduled,
    });
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className={modalPanelClass("max-w-[560px]")}>
        <div className={modalHeaderClass}>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 tracking-tight">
              Send invoice
            </h2>
            <p className="text-sm text-gray-500 mt-1 truncate">
              <span className="font-medium text-gray-700">{invoiceLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pb-4 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {STEPS.map((item, index) => {
              const Icon = item.icon;
              const active = index === stepIndex;
              const done = index < stepIndex;
              return (
                <React.Fragment key={item.id}>
                  {index > 0 && (
                    <div
                      className={`h-px flex-1 min-w-2 ${
                        done ? "bg-emerald-400" : "bg-gray-200"
                      }`}
                    />
                  )}
                  <div
                    className={`flex items-center gap-2 rounded-full px-2.5 sm:px-3 py-1.5 text-[12px] font-semibold transition-colors shrink-0 ${
                      active
                        ? "bg-[#EFF6FF] text-[#2563EB]"
                        : done
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        active
                          ? "bg-[#2563EB] text-white"
                          : done
                            ? "bg-emerald-500 text-white"
                            : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {done ? (
                        <Check className="w-3 h-3" strokeWidth={2.5} />
                      ) : (
                        <Icon className="w-3 h-3" />
                      )}
                    </span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-2 overflow-y-auto flex-1 min-h-0">
          {step.id === "recipient" && (
            <div className="space-y-4 pb-2">
              <p className="text-[14px] text-gray-500">
                Who should receive the invoice payment link?
              </p>
              <label className="block">
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Recipient email
                </span>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  placeholder="client@company.com"
                />
              </label>
              <label className="block">
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Recipient name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300"
                  placeholder="Optional"
                />
              </label>
            </div>
          )}

          {step.id === "automation" && (
            <div className="space-y-4 pb-2">
              <p className="text-[14px] text-gray-500">
                Choose a payment reminder sequence timed around the due date.
                Reminders stop automatically when the invoice is paid.
              </p>
              {!hasDueDate && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800">
                  Set a due date on this invoice to enable automated reminders.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {REMINDER_SEQUENCES.map((option) => {
                  const selected = sequenceKey === option.key;
                  const disabled = option.key !== "none" && !hasDueDate;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => selectSequence(option.key)}
                      className={`text-left rounded-2xl border p-3.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        selected
                          ? "border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200"
                          : "border-gray-200 hover:border-gray-300 bg-white"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[14px] font-semibold text-gray-900">
                          {option.label}
                        </div>
                        {selected && (
                          <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3" strokeWidth={2.5} />
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-gray-500 mt-1 leading-snug">
                        {option.description}
                      </p>
                      {option.steps.length > 0 && (
                        <p className="text-[11px] font-medium text-gray-400 mt-2">
                          {option.steps
                            .map((s) => formatReminderOffsetLabel(s.offsetDays))
                            .join(" · ")}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {activeSteps.length > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-[#FAFBFC] p-3.5 space-y-3">
                  <div className="text-[13px] font-semibold text-gray-900">
                    Sequence preview
                  </div>
                  {activeSteps.map((item, index) => (
                    <div
                      key={`${sequenceKey}-${index}`}
                      className="rounded-xl border border-gray-200 bg-white p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-emerald-700">
                          Reminder {index + 1}
                        </span>
                        <span className="text-[11px] font-medium text-gray-400">
                          {formatReminderOffsetLabel(item.offsetDays)}
                        </span>
                      </div>
                      <input
                        type="text"
                        value={item.subject}
                        onChange={(e) =>
                          updateStepField(index, { subject: e.target.value })
                        }
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] font-medium outline-none focus:border-gray-300"
                        placeholder="Email subject"
                      />
                      <textarea
                        value={item.body}
                        onChange={(e) =>
                          updateStepField(index, { body: e.target.value })
                        }
                        rows={2}
                        className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-[13px] text-gray-600 outline-none focus:border-gray-300 resize-none"
                        placeholder="Email body"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {step.id === "message" && (
            <div className="space-y-4 pb-2">
              <p className="text-[14px] text-gray-500">
                This note is included in the first email with the payment link.
              </p>
              <label className="block">
                <span className="block text-[13px] font-medium text-gray-700 mb-1.5">
                  Email message
                </span>
                <textarea
                  autoFocus
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  className="w-full border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-gray-300 resize-none leading-relaxed"
                />
              </label>
              <button
                type="button"
                onClick={() => setMessage(DEFAULT_INVOICE_SEND_MESSAGE)}
                className="text-[13px] font-medium text-[#2563EB] hover:text-[#1d4ed8]"
              >
                Reset to default message
              </button>
              <div className="rounded-2xl border border-gray-200 bg-[#FAFBFC] p-3.5 text-[13px] text-gray-600 space-y-1.5">
                <div className="font-semibold text-gray-900">Ready to send</div>
                <p>
                  To: <span className="text-gray-800">{email || "—"}</span>
                </p>
                <p>
                  Automation:{" "}
                  <span className="text-gray-800">
                    {sequence.label}
                    {activeSteps.length > 0
                      ? ` · ${activeSteps.length} reminder${activeSteps.length === 1 ? "" : "s"}`
                      : ""}
                  </span>
                </p>
              </div>
            </div>
          )}

          {error && <p className="text-[13px] text-red-600 pb-2">{error}</p>}
        </div>

        <div className={`${modalFooterClass} justify-between bg-[#FAFBFC]`}>
          <button
            type="button"
            onClick={stepIndex === 0 ? onClose : goBack}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-100 inline-flex items-center gap-1.5"
          >
            {stepIndex === 0 ? (
              "Cancel"
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" /> Back
              </>
            )}
          </button>

          {stepIndex < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5"
            >
              Continue <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={sending}
              onClick={() => void handleSend()}
              className="btn-primary px-5 py-2.5 rounded-xl text-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              {sending ? "Sending…" : "Send invoice"}
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
