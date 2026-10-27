import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { formatInvoiceMoney } from "@/lib/invoices/totals";
import { formatInvoicePaidAssistantMessage } from "@/lib/assistant/event-messages";
import { sendAssistantOutbound } from "@/lib/assistant/outbound";

type Db = SupabaseClient<Database>;

export async function notifyAssistantInvoicePaid(
  db: Db,
  options: {
    invoiceId: string;
    organizationId: string;
    userId: string;
    clientLabel: string;
    invoiceLabel: string;
    amount: number;
    currency: string;
    userName?: string | null;
  }
) {
  const message = formatInvoicePaidAssistantMessage({
    userName: options.userName,
    clientLabel: options.clientLabel,
    invoiceLabel: options.invoiceLabel,
    amountLabel: formatInvoiceMoney(options.amount, options.currency),
  });

  return sendAssistantOutbound({
    db,
    organizationId: options.organizationId,
    userId: options.userId,
    message,
    pendingAction: null,
    // In-app notification already created by paid-notify — skip duplicate.
  });
}
