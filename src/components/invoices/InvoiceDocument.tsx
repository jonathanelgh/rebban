"use client";

import React from "react";
import { formatInvoiceMoney, pricesTaxLabel } from "@/lib/invoices/totals";
import {
  formatInvoiceQuantity,
  type InvoiceLineUnit,
} from "@/lib/invoices/units";
import {
  formatIbanDisplay,
  normalizeBankgiro,
} from "@/lib/invoices/payment-details";

export type InvoiceDocumentLine = {
  id?: string;
  description: string;
  quantity: number | string;
  unit?: InvoiceLineUnit | null;
  unitPrice: number | string;
  amount: number;
};

export type InvoiceDocumentProps = {
  bannerUrl?: string | null;
  showLogo?: boolean;
  logoUrl?: string | null;
  fromName: string;
  fromAddress?: string | null;
  fromEmail?: string | null;
  showTaxId?: boolean;
  taxId?: string | null;
  number?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  showReference?: boolean;
  referenceNumber?: string | null;
  billToName?: string | null;
  billToEmail?: string | null;
  billToCompany?: string | null;
  showShippingAddress?: boolean;
  shippingAddress?: string | null;
  currency: string;
  lines: InvoiceDocumentLine[];
  subtotal: number;
  taxEnabled?: boolean;
  taxRate?: number;
  taxTotal: number;
  pricesIncludeTax?: boolean;
  total: number;
  lateFeeEnabled?: boolean;
  lateFeePercent?: number;
  notes?: string | null;
  paymentIban?: string | null;
  paymentBankgiro?: string | null;
  /** When true, hide interactive chrome for print/PDF */
  printMode?: boolean;
};

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

export function InvoiceDocument({
  bannerUrl,
  showLogo = true,
  logoUrl,
  fromName,
  fromAddress,
  fromEmail,
  showTaxId,
  taxId,
  number,
  issueDate,
  dueDate,
  showReference,
  referenceNumber,
  billToName,
  billToEmail,
  billToCompany,
  showShippingAddress,
  shippingAddress,
  currency,
  lines,
  subtotal,
  taxEnabled,
  taxRate,
  taxTotal,
  pricesIncludeTax,
  total,
  lateFeeEnabled,
  lateFeePercent,
  notes,
  paymentIban,
  paymentBankgiro,
}: InvoiceDocumentProps) {
  const billTo =
    billToCompany && billToName && billToCompany !== billToName
      ? billToCompany
      : billToCompany || billToName || "—";
  const rateLabel = pricesTaxLabel({ taxEnabled, pricesIncludeTax });
  const ibanDisplay = formatIbanDisplay(paymentIban);
  const bankgiroDisplay = normalizeBankgiro(paymentBankgiro);
  const hasBankDetails = Boolean(ibanDisplay || bankgiroDisplay);

  return (
    <article
      id="invoice-document"
      className="bg-white border border-line rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden print:shadow-none print:border-0 print:rounded-none"
    >
      {bannerUrl && (
        <div className="w-full h-[100px] overflow-hidden bg-gray-100 print:h-[100px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={bannerUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="px-6 sm:px-10 pt-8 sm:pt-10 pb-6 border-b border-line bg-gradient-to-b from-[#FAFBFC] to-white">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
          <div className="flex items-start gap-3 min-w-0">
            {showLogo &&
              (logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt=""
                  className="w-12 h-12 rounded-xl object-contain border border-line bg-white"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-gray-950 text-white flex items-center justify-center font-semibold">
                  {fromName.slice(0, 1).toUpperCase()}
                </div>
              ))}
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900 tracking-tight">
                {fromName}
              </div>
              {fromAddress && (
                <p className="text-[13px] text-gray-500 mt-1 whitespace-pre-line">
                  {fromAddress}
                </p>
              )}
              {fromEmail && (
                <p className="text-[13px] text-gray-500 mt-0.5">{fromEmail}</p>
              )}
            </div>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-[12px] font-semibold uppercase tracking-wider text-gray-400">
              Invoice
            </div>
            <div className="mt-1 text-xl font-semibold text-gray-900 tracking-tight">
              {number || "Draft"}
            </div>
            <div className="mt-3 text-[13px] text-gray-500 space-y-1">
              <div>Issued {formatDate(issueDate)}</div>
              <div>Due {formatDate(dueDate)}</div>
              {showReference && referenceNumber && (
                <div>Ref {referenceNumber}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 sm:px-10 py-6 grid grid-cols-1 sm:grid-cols-2 gap-6 border-b border-line">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
            Bill to
          </div>
          <div className="text-[14px] font-medium text-gray-900">{billTo}</div>
          {billToCompany && billToName && billToCompany !== billToName && (
            <div className="text-[13px] text-gray-600 mt-0.5">{billToName}</div>
          )}
          {billToEmail && (
            <div className="text-[13px] text-gray-600 mt-0.5">{billToEmail}</div>
          )}
        </div>
        {showShippingAddress && shippingAddress && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
              Shipping address
            </div>
            <p className="text-[13px] text-gray-600 whitespace-pre-line">
              {shippingAddress}
            </p>
          </div>
        )}
      </div>

      <div className="px-6 sm:px-10 py-6">
        <div className="rounded-2xl border border-line overflow-hidden">
          <div className="hidden sm:grid grid-cols-[minmax(0,1.8fr)_90px_110px_110px] gap-2 px-3 py-2.5 bg-[#FAFBFC] border-b border-line text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            <span>Description</span>
            <span className="text-right">Qty</span>
            <span className="text-right">
              Rate
              {rateLabel ? (
                <span className="block normal-case tracking-normal font-medium text-gray-400">
                  {pricesIncludeTax ? "incl. tax" : "excl. tax"}
                </span>
              ) : null}
            </span>
            <span className="text-right">Amount</span>
          </div>
          {rateLabel && (
            <div className="sm:hidden px-3 py-2 border-b border-line text-[12px] text-gray-500 bg-[#FAFBFC]">
              {rateLabel}
            </div>
          )}
          {lines.length === 0 ? (
            <div className="px-3 py-6 text-[13px] text-gray-400 text-center">
              No line items
            </div>
          ) : (
            lines.map((line, i) => (
              <div
                key={line.id || `${line.description}-${i}`}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.8fr)_90px_110px_110px] gap-1 sm:gap-2 px-3 py-3 border-b border-line last:border-b-0 text-[13px]"
              >
                <div className="font-medium text-gray-900">
                  {line.description || "Item"}
                </div>
                <div className="sm:text-right text-gray-600">
                  <span className="sm:hidden text-gray-400 mr-1">Qty</span>
                  {formatInvoiceQuantity(line.quantity, line.unit)}
                </div>
                <div className="sm:text-right text-gray-600">
                  <span className="sm:hidden text-gray-400 mr-1">Rate</span>
                  {formatInvoiceMoney(Number(line.unitPrice) || 0, currency)}
                </div>
                <div className="sm:text-right font-medium text-gray-900">
                  {formatInvoiceMoney(line.amount, currency)}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-6 ml-auto w-full max-w-xs space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span>
            <span>{formatInvoiceMoney(subtotal, currency)}</span>
          </div>
          {taxEnabled && (
            <div className="flex justify-between text-sm text-gray-600">
              <span>Tax{taxRate ? ` (${taxRate}%)` : ""}</span>
              <span>{formatInvoiceMoney(taxTotal, currency)}</span>
            </div>
          )}
          {lateFeeEnabled && Number(lateFeePercent) > 0 && (
            <div className="flex justify-between text-[12px] text-gray-400">
              <span>Late fee if overdue</span>
              <span>{lateFeePercent}%</span>
            </div>
          )}
          <div className="h-px bg-line" />
          <div className="flex justify-between text-sm font-semibold text-gray-900">
            <span>Total</span>
            <span>{formatInvoiceMoney(total, currency)}</span>
          </div>
        </div>

        {(hasBankDetails || notes) && (
          <div className="mt-8 pt-6 border-t border-line space-y-5">
            {hasBankDetails && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Bank transfer
                </div>
                <div className="text-[13px] text-gray-700 space-y-1">
                  {ibanDisplay && (
                    <p>
                      <span className="text-gray-500">IBAN</span>{" "}
                      <span className="font-medium tracking-wide">{ibanDisplay}</span>
                    </p>
                  )}
                  {bankgiroDisplay && (
                    <p>
                      <span className="text-gray-500">Bankgiro</span>{" "}
                      <span className="font-medium">{bankgiroDisplay}</span>
                    </p>
                  )}
                  {number && (
                    <p className="text-[12px] text-gray-500 pt-0.5">
                      Use invoice {number} as the payment reference.
                    </p>
                  )}
                </div>
              </div>
            )}
            {notes && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                  Notes
                </div>
                <p className="text-[13px] text-gray-600 whitespace-pre-line">{notes}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="px-6 sm:px-10 py-5 border-t border-line bg-[#FAFBFC]">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
          From
        </div>
        <div className="text-[13px] text-gray-700 space-y-0.5">
          <div className="font-medium text-gray-900">{fromName}</div>
          {fromAddress && (
            <p className="whitespace-pre-line text-gray-600">{fromAddress}</p>
          )}
          {fromEmail && <p className="text-gray-600">{fromEmail}</p>}
          {(taxEnabled || showTaxId) && taxId && (
            <p className="text-gray-600">VAT / Tax ID: {taxId}</p>
          )}
        </div>
      </footer>
    </article>
  );
}
