"use client";

import React from "react";
import { Download } from "lucide-react";
import type { ReceiptExportChatComponent } from "@/lib/assistant/components";
import { ChatCardShell, CardBtn } from "@/components/assistant/chat-card-shared";

export function ReceiptExportChatCard({
  component,
}: {
  component: ReceiptExportChatComponent;
}) {
  const snap = component.snapshot;
  const label = snap?.label || "Receipts export";
  const count = snap?.receiptCount ?? 0;
  const unfiled = snap?.unfiledCount ?? 0;
  const href =
    snap?.downloadPath ||
    `/api/receipts/exports/${component.entityId}/download`;

  return (
    <ChatCardShell
      title={label}
      subtitle="ZIP · originals + CSV"
      status="ready"
    >
      <div className="space-y-1 text-[12px] text-gray-600">
        <p>
          {count === 0
            ? "No dated receipts in this month."
            : `${count} receipt${count === 1 ? "" : "s"} included.`}
        </p>
        {unfiled > 0 ? (
          <p className="text-amber-800">
            {unfiled} unfiled receipt{unfiled === 1 ? "" : "s"} still need a
            date.
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <CardBtn href={href} primary>
          <span className="inline-flex items-center gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Download ZIP
          </span>
        </CardBtn>
      </div>
    </ChatCardShell>
  );
}
