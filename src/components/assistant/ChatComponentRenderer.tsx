"use client";

import React from "react";
import type { AssistantChatComponent } from "@/lib/assistant/components";
import { InvoiceChatCard } from "@/components/assistant/InvoiceChatCard";
import { PaymentSummaryChatCard } from "@/components/assistant/PaymentSummaryChatCard";

type Props = {
  components?: AssistantChatComponent[] | null;
  conversationId?: string | null;
  onError?: (message: string) => void;
};

export function ChatComponentRenderer({
  components,
  conversationId,
  onError,
}: Props) {
  if (!components?.length) return null;

  return (
    <div className="mt-1 flex flex-col gap-2">
      {components.map((component, index) => {
        const key = `${component.type}-${component.entityId}-${index}`;
        switch (component.type) {
          case "invoice_card":
            return (
              <InvoiceChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "payment_summary":
            return <PaymentSummaryChatCard key={key} component={component} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
