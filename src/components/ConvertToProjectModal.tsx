"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FolderKanban,
  Loader2,
  Receipt,
  Sparkles,
  X,
} from "lucide-react";
import {
  ModalOverlay,
  modalBodyClass,
  modalFooterClass,
  modalHeaderClass,
  modalPanelClass,
} from "@/components/ModalFrame";
import {
  billingTypeLabel,
  defaultDepositAmount,
  type InvoiceKind,
  type ProjectBillingType,
} from "@/lib/projects/billing";

type Step = 1 | 2 | 3;

const BILLING_OPTIONS: { value: ProjectBillingType; label: string }[] = [
  { value: "fixed", label: "Fixed" },
  { value: "hourly", label: "Hourly" },
  { value: "daily", label: "Daily" },
  { value: "retainer", label: "Retainer" },
  { value: "mixed", label: "Mixed" },
];

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function ConvertToProjectModal({
  proposalId,
  proposalTitle,
  proposalAmount,
  currency,
  pricingType,
  proposalContent,
  clientName,
  hasClient,
  onClose,
  onConverted,
}: {
  proposalId: string;
  proposalTitle: string;
  proposalAmount: number;
  currency: string;
  pricingType: ProjectBillingType;
  proposalContent: unknown;
  clientName?: string | null;
  hasClient: boolean;
  onClose: () => void;
  onConverted?: (result: {
    projectId: string;
    invoiceId: string | null;
    taskCount: number;
  }) => void;
}) {
  const router = useRouter();
  const suggestedDeposit = useMemo(
    () => defaultDepositAmount(proposalAmount, proposalContent),
    [proposalAmount, proposalContent]
  );

  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState(proposalTitle || "New project");
  const [description, setDescription] = useState("");
  const [startDate, setStartDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [billingType, setBillingType] =
    useState<ProjectBillingType>(pricingType || "fixed");
  const [invoiceKind, setInvoiceKind] = useState<InvoiceKind>(() => {
    if (pricingType === "retainer") return "retainer";
    if (proposalAmount > 0) return "deposit";
    return "none";
  });
  const [depositAmount, setDepositAmount] = useState(suggestedDeposit);
  const [retainerAutoInvoice, setRetainerAutoInvoice] = useState(
    pricingType === "retainer"
  );
  const [retainerDayOfMonth, setRetainerDayOfMonth] = useState(1);
  const [generateAiTasks, setGenerateAiTasks] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountLabel = formatMoney(proposalAmount, currency);
  const depositLabel = formatMoney(depositAmount, currency);

  function canContinueStep1() {
    return Boolean(name.trim()) && hasClient;
  }

  function goNext() {
    setError(null);
    if (step === 1) {
      if (!canContinueStep1()) {
        setError(
          hasClient
            ? "Enter a project name."
            : "Assign a client to this proposal before converting."
        );
        return;
      }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (invoiceKind === "deposit" && depositAmount <= 0) {
        setError("Enter a deposit amount greater than zero.");
        return;
      }
      if (
        (invoiceKind === "retainer" || invoiceKind === "full") &&
        proposalAmount <= 0
      ) {
        setError("Proposal amount must be greater than zero for this invoice.");
        return;
      }
      setStep(3);
    }
  }

  async function handleConvert() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/proposals/${proposalId}/convert-to-project`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim() || null,
            startDate,
            billingType,
            invoiceKind,
            depositAmount:
              invoiceKind === "deposit" ? depositAmount : undefined,
            retainerAutoInvoice:
              billingType === "retainer" ? retainerAutoInvoice : false,
            retainerDayOfMonth:
              billingType === "retainer" ? retainerDayOfMonth : undefined,
            generateAiTasks,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        projectId?: string;
        invoiceId?: string | null;
        taskCount?: number;
      };
      if (!res.ok || !json.projectId) {
        setError(json.error || "Could not convert proposal.");
        return;
      }

      onConverted?.({
        projectId: json.projectId,
        invoiceId: json.invoiceId || null,
        taskCount: json.taskCount || 0,
      });

      if (json.invoiceId) {
        router.push(`/invoices/${json.invoiceId}/edit`);
      } else if (generateAiTasks && (json.taskCount || 0) > 0) {
        router.push("/tasks");
      } else {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Convert failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay onClose={busy ? undefined : onClose} zClass="z-[70]">
      <div className={modalPanelClass("max-w-[560px]")}>
        <div className={`${modalHeaderClass} border-b border-line`}>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold text-gray-900">
              Convert to project
            </h2>
            <p className="text-[13px] text-gray-500 mt-0.5">
              Step {step} of 3
              {clientName ? ` · ${clientName}` : ""}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 shrink-0 disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 sm:px-6 pt-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className={`h-1 flex-1 rounded-full ${
                  n <= step ? "bg-gray-900" : "bg-gray-200"
                }`}
              />
            ))}
          </div>
        </div>

        <div className={modalBodyClass}>
          {step === 1 && (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-gray-50 border border-line p-4">
                <FolderKanban className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="min-w-0 text-[13px] text-gray-600">
                  <p className="font-medium text-gray-900 mb-0.5">
                    Start the engagement
                  </p>
                  <p>
                    Billing defaults from this proposal (
                    {billingTypeLabel(pricingType)}
                    {proposalAmount > 0 ? ` · ${amountLabel}` : ""}).
                  </p>
                </div>
              </div>

              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">
                  Project name
                </span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                  placeholder="Website redesign"
                />
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">
                  Description{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 resize-none"
                  placeholder="Short note for your team"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700">
                    Start date
                  </span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700">
                    Billing type
                  </span>
                  <select
                    value={billingType}
                    onChange={(e) => {
                      const next = e.target.value as ProjectBillingType;
                      setBillingType(next);
                      if (next === "retainer") {
                        setInvoiceKind("retainer");
                        setRetainerAutoInvoice(true);
                      } else if (invoiceKind === "retainer") {
                        setInvoiceKind(
                          proposalAmount > 0 ? "deposit" : "none"
                        );
                      }
                    }}
                    className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-white"
                  >
                    {BILLING_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-gray-50 border border-line p-4">
                <Receipt className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="min-w-0 text-[13px] text-gray-600">
                  <p className="font-medium text-gray-900 mb-0.5">
                    First invoice
                  </p>
                  <p>
                    Create a draft invoice now, or skip and bill later.
                    {billingType === "retainer"
                      ? " Retainers can auto-send every month."
                      : ""}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {(
                  [
                    {
                      value: "none" as const,
                      title: "No invoice yet",
                      detail: "Create the project only",
                    },
                    ...(billingType === "retainer"
                      ? [
                          {
                            value: "retainer" as const,
                            title: "This month’s retainer",
                            detail: amountLabel,
                          },
                        ]
                      : [
                          {
                            value: "deposit" as const,
                            title: "Deposit",
                            detail: depositLabel,
                          },
                          {
                            value: "full" as const,
                            title: "Full amount",
                            detail: amountLabel,
                          },
                        ]),
                  ] as Array<{
                    value: InvoiceKind;
                    title: string;
                    detail: string;
                  }>
                ).map((opt) => {
                  const selected = invoiceKind === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setInvoiceKind(opt.value)}
                      className={`w-full text-left rounded-xl border px-4 py-3 transition-colors ${
                        selected
                          ? "border-gray-900 bg-gray-50"
                          : "border-line hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {opt.title}
                          </div>
                          <div className="text-[12px] text-gray-500 mt-0.5">
                            {opt.detail}
                          </div>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                            selected
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-gray-300"
                          }`}
                        >
                          {selected ? <Check className="w-3 h-3" /> : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {invoiceKind === "deposit" && (
                <label className="block">
                  <span className="text-[13px] font-medium text-gray-700">
                    Deposit amount
                  </span>
                  <div className="mt-1.5 relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                      {currency}
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={depositAmount}
                      onChange={(e) =>
                        setDepositAmount(Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-full rounded-xl border border-line pl-14 pr-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400"
                    />
                  </div>
                </label>
              )}

              {billingType === "retainer" && (
                <div className="rounded-2xl border border-line p-4 space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={retainerAutoInvoice}
                      onChange={(e) => setRetainerAutoInvoice(e.target.checked)}
                      className="mt-1 rounded border-gray-300"
                    />
                    <span>
                      <span className="block text-sm font-medium text-gray-900">
                        Auto-send retainer invoices monthly
                      </span>
                      <span className="block text-[12px] text-gray-500 mt-0.5">
                        Creates and emails a new invoice each billing day.
                      </span>
                    </span>
                  </label>
                  {retainerAutoInvoice && (
                    <label className="block">
                      <span className="text-[13px] font-medium text-gray-700">
                        Billing day of month
                      </span>
                      <select
                        value={retainerDayOfMonth}
                        onChange={(e) =>
                          setRetainerDayOfMonth(Number(e.target.value) || 1)
                        }
                        className="mt-1.5 w-full rounded-xl border border-line px-3.5 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-400 bg-white"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(
                          (day) => (
                            <option key={day} value={day}>
                              {day}
                            </option>
                          )
                        )}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 py-2">
              <div className="flex items-start gap-3 rounded-2xl bg-gray-50 border border-line p-4">
                <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0 text-[13px] text-gray-600">
                  <p className="font-medium text-gray-900 mb-0.5">
                    Project tasks
                  </p>
                  <p>
                    Optionally let AI draft tasks from this proposal’s scope,
                    deliverables, and timeline.
                  </p>
                </div>
              </div>

              <label className="flex items-start gap-3 cursor-pointer rounded-xl border border-line px-4 py-3 hover:border-gray-300">
                <input
                  type="checkbox"
                  checked={generateAiTasks}
                  onChange={(e) => setGenerateAiTasks(e.target.checked)}
                  className="mt-1 rounded border-gray-300"
                />
                <span>
                  <span className="block text-sm font-medium text-gray-900">
                    Create AI tasks from proposal
                  </span>
                  <span className="block text-[12px] text-gray-500 mt-0.5">
                    Adds 5–10 starter tasks to the board for this project.
                  </span>
                </span>
              </label>

              <div className="rounded-2xl border border-line p-4 space-y-2 text-[13px]">
                <p className="font-medium text-gray-900">Summary</p>
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>Project</span>
                  <span className="text-gray-900 text-right font-medium truncate max-w-[60%]">
                    {name.trim() || "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>Billing</span>
                  <span className="text-gray-900 font-medium">
                    {billingTypeLabel(billingType)}
                  </span>
                </div>
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>First invoice</span>
                  <span className="text-gray-900 font-medium">
                    {invoiceKind === "none"
                      ? "None"
                      : invoiceKind === "deposit"
                        ? `Deposit · ${depositLabel}`
                        : invoiceKind === "retainer"
                          ? `Retainer · ${amountLabel}`
                          : `Full · ${amountLabel}`}
                  </span>
                </div>
                {billingType === "retainer" && (
                  <div className="flex justify-between gap-3 text-gray-600">
                    <span>Monthly auto-invoice</span>
                    <span className="text-gray-900 font-medium">
                      {retainerAutoInvoice
                        ? `Yes · day ${retainerDayOfMonth}`
                        : "No"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-3 text-gray-600">
                  <span>AI tasks</span>
                  <span className="text-gray-900 font-medium">
                    {generateAiTasks ? "Yes" : "No"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className={modalFooterClass}>
          {step > 1 ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setError(null);
                setStep((s) => (s === 3 ? 2 : 1));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 mr-auto"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="rounded-xl px-3.5 py-2 text-[13px] font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 mr-auto"
            >
              Cancel
            </button>
          )}

          {step < 3 ? (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800"
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleConvert()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-[13px] font-medium text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <FolderKanban className="w-4 h-4" />
                  Create project
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
