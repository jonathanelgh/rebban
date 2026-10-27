import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/prompts";
import {
  deriveComponentsFromToolResults,
  type AssistantChatComponent,
  type ToolResultRecord,
} from "@/lib/assistant/components";
import {
  isPendingSendAffirmation,
  isPendingSendDecline,
  wantsInvoiceWithConvert,
} from "@/lib/assistant/pending-confirm";
import {
  ASSISTANT_TOOL_DEFINITIONS,
  executeAssistantTool,
  type AssistantToolContext,
} from "@/lib/assistant/tools";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export {
  isPendingSendAffirmation,
  isPendingSendDecline,
} from "@/lib/assistant/pending-confirm";

type OpenAiMessage =
  | { role: "system" | "user" | "assistant"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export function isAssistantAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const MAX_TOOL_ROUNDS = 8;

const IN_APP_UI_HINT = `
For in-app / native chat, the product renders interactive cards from your tools automatically (invoices, proposals, clients, leads, projects, tasks, payment summaries, unbilled hours). Keep the text reply short — do not paste long tables. Prefer tools so cards stay in sync with the database.`;

export async function generateAssistantReply(options: {
  messages: AssistantChatMessage[];
  userName?: string | null;
  toolContext: AssistantToolContext;
}): Promise<{
  reply: string;
  toolsUsed: string[];
  components: AssistantChatComponent[];
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const history = options.messages
    .filter((m) => m.content.trim())
    .slice(-16)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.trim().slice(0, 4000),
    }));

  if (!history.length) {
    throw new Error("Message is required.");
  }

  const model =
    process.env.OPENAI_ASSISTANT_MODEL ||
    process.env.OPENAI_SUPPORT_MODEL ||
    "gpt-4o-mini";

  const pending = options.toolContext.pendingAction;
  let pendingHint = "";
  if (pending?.type === "send_proposal") {
    pendingHint = `\nPending: ${JSON.stringify(pending)}. Natural yes (go ahead, send it, ja) → send_proposal confirmed=true immediately. Wait/later/no → clear_pending_action.`;
  } else if (pending?.type === "send_invoice") {
    pendingHint = `\nPending: ${JSON.stringify(pending)}. Natural yes → send_invoice confirmed=true immediately. Wait/later/no → clear_pending_action.`;
  } else if (pending?.type === "send_invoices") {
    pendingHint = `\nPending multi-send: ${JSON.stringify(pending)}. Interpret the user message carefully:
- yes / send them all / go ahead → send_invoices with confirmed=true and all_pending=true
- send only Acme / invoice Acme and Beta / skip Northwind → send_invoices with confirmed=true and include_client_queries / exclude_client_queries matching the names they said
- wait / later / no → clear_pending_action
Do not re-list drafts or ask again if intent is clear.`;
  } else if (pending?.type === "propose_unbilled_invoices") {
    pendingHint = `\nPending unbilled invoice proposal: ${JSON.stringify(pending)}. The user is choosing which clients to draft invoices for:
- yes / all / invoice them all / go ahead → create_invoices_from_unbilled_batch with all_pending=true
- "invoice Acme and Beta, skip Northwind" → create_invoices_from_unbilled_batch with include_client_queries=["Acme","Beta"] (or exclude_client_queries=["Northwind"] if they only named skips)
- wait / later / no → clear_pending_action
After drafts are created, ask once whether to send. Do not invent clients outside this pending list unless they clearly ask for someone else.`;
  } else if (pending?.type === "propose_convert_proposal") {
    pendingHint = `\nPending proposal→project: ${JSON.stringify(pending)}. A client just accepted a proposal.
- yes / go ahead → convert_proposal_to_project with generate_tasks=true and invoice_kind=none (unless they also ask to draft)
- "yes and draft the deposit/invoice" → convert_proposal_to_project with generate_tasks=true and invoice_kind=${pending.suggest_invoice_kind || "deposit"} (include deposit_amount if set)
- wait / later / no → clear_pending_action
Do not re-ask if intent is clear.`;
  }

  const channel = options.toolContext.channel || "whatsapp";
  const lengthHint =
    channel === "whatsapp"
      ? "Keep replies short enough for WhatsApp (usually under 500 characters unless listing several invoices)."
      : `Keep replies concise for the in-app chat panel. Light Markdown is fine.${IN_APP_UI_HINT}`;

  const system = `${ASSISTANT_SYSTEM_PROMPT}

The user's name is ${options.userName || "there"}.${pendingHint}

${lengthHint}`;

  const messages: OpenAiMessage[] = [
    { role: "system", content: system },
    ...history,
  ];

  const toolsUsed: string[] = [];
  const toolResults: ToolResultRecord[] = [];

  // Deterministic confirm/decline for clear short replies — selective phrasing goes to the model.
  const lastUser = [...history].reverse().find((m) => m.role === "user");
  if (pending && lastUser) {
    const pushTool = async (
      toolName: string,
      args: Record<string, unknown>,
      callId: string
    ) => {
      console.info("[assistant] auto-confirm pending action", {
        toolName,
        pendingType: pending.type,
        userId: options.toolContext.userId,
      });
      const result = await executeAssistantTool(
        options.toolContext,
        toolName,
        JSON.stringify(args)
      );
      toolsUsed.push(toolName);
      toolResults.push({ name: toolName, result });
      messages.push(
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: callId,
              type: "function",
              function: { name: toolName, arguments: JSON.stringify(args) },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: callId,
          content: JSON.stringify(result).slice(0, 12000),
        }
      );
    };

    if (isPendingSendDecline(lastUser.content)) {
      await pushTool("clear_pending_action", {}, "pending_decline");
    } else if (isPendingSendAffirmation(lastUser.content)) {
      if (pending.type === "send_proposal") {
        await pushTool(
          "send_proposal",
          { confirmed: true, proposal_id: pending.proposal_id },
          "pending_send_confirm"
        );
      } else if (pending.type === "send_invoice") {
        await pushTool(
          "send_invoice",
          { confirmed: true, invoice_id: pending.invoice_id },
          "pending_send_confirm"
        );
      } else if (pending.type === "send_invoices") {
        await pushTool(
          "send_invoices",
          { confirmed: true, all_pending: true },
          "pending_send_confirm"
        );
      } else if (pending.type === "propose_unbilled_invoices") {
        await pushTool(
          "create_invoices_from_unbilled_batch",
          { all_pending: true },
          "pending_create_confirm"
        );
      } else if (pending.type === "propose_convert_proposal") {
        const withInvoice = wantsInvoiceWithConvert(lastUser.content);
        const invoiceKind =
          withInvoice && pending.suggest_invoice_kind !== "none"
            ? pending.suggest_invoice_kind
            : "none";
        await pushTool(
          "convert_proposal_to_project",
          {
            proposal_id: pending.proposal_id,
            generate_tasks: true,
            invoice_kind: invoiceKind,
            deposit_amount:
              invoiceKind === "deposit" ? pending.deposit_amount : undefined,
          },
          "pending_convert_confirm"
        );
      }
    }
    // Selective messages (name some clients / skip others) fall through to the model with pendingHint.
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 700,
        tools: ASSISTANT_TOOL_DEFINITIONS,
        tool_choice: "auto",
        messages,
      }),
    });

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          role?: string;
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string;
      }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const detail = json.error?.message || `OpenAI error (${res.status}).`;
      if (res.status === 401) {
        throw new Error(
          "OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local / Vercel."
        );
      }
      throw new Error(detail);
    }

    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Empty assistant reply.");

    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      const content = message.content?.trim();
      if (!content) throw new Error("Empty assistant reply.");
      const components =
        channel === "in_app"
          ? deriveComponentsFromToolResults(toolResults)
          : [];
      return { reply: content, toolsUsed, components };
    }

    messages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name || "unknown";
      toolsUsed.push(name);
      console.info("[assistant] tool call", {
        name,
        userId: options.toolContext.userId,
      });
      const result = await executeAssistantTool(
        options.toolContext,
        name,
        call.function?.arguments || "{}"
      );
      toolResults.push({ name, result });
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000),
      });
    }
  }

  throw new Error("Assistant took too many tool steps. Try a simpler request.");
}
