"use client";

import React from "react";
import type { AssistantChatComponent } from "@/lib/assistant/components";
import { InvoiceChatCard } from "@/components/assistant/InvoiceChatCard";
import { PaymentSummaryChatCard } from "@/components/assistant/PaymentSummaryChatCard";
import {
  ClientChatCard,
  LeadChatCard,
  ProjectChatCard,
  ProposalChatCard,
  TaskChatCard,
  TimeSummaryChatCard,
} from "@/components/assistant/EntityChatCards";

type Props = {
  components?: AssistantChatComponent[] | null;
  conversationId?: string | null;
  onError?: (message: string) => void;
  onAssistantMessage?: (message: {
    id: string;
    content: string;
    components?: AssistantChatComponent[];
  }) => void;
};

export function ChatComponentRenderer({
  components,
  conversationId,
  onError,
  onAssistantMessage,
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
                onAssistantMessage={onAssistantMessage}
              />
            );
          case "payment_summary":
            return <PaymentSummaryChatCard key={key} component={component} />;
          case "proposal_card":
            return (
              <ProposalChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "client_card":
            return (
              <ClientChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "lead_card":
            return (
              <LeadChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "project_card":
            return (
              <ProjectChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "task_card":
            return (
              <TaskChatCard
                key={key}
                component={component}
                conversationId={conversationId}
                onError={onError}
              />
            );
          case "time_summary":
            return <TimeSummaryChatCard key={key} component={component} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
