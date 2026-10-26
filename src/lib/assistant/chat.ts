import { ASSISTANT_SYSTEM_PROMPT } from "@/lib/assistant/prompts";
import {
  deriveComponentsFromToolResults,
  type AssistantChatComponent,
  type ToolResultRecord,
} from "@/lib/assistant/components";
import {
  ASSISTANT_TOOL_DEFINITIONS,
  executeAssistantTool,
  type AssistantToolContext,
} from "@/lib/assistant/tools";

export type AssistantChatMessage = {
  role: "user" | "assistant";
  content: string;
};

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

const MAX_TOOL_ROUNDS = 5;

const IN_APP_UI_HINT = `
For in-app / native chat, the product renders interactive cards from your tools automatically (invoice cards, payment summaries). Keep the text reply short — do not paste long invoice tables. Prefer tools (create_invoice_draft, get_invoice, update_invoice_draft, list_unpaid_invoices, send_invoice) so cards stay in sync with the database.`;

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
  const pendingHint = pending
    ? pending.type === "send_proposal"
      ? `\nThere is a pending action: ${JSON.stringify(pending)}. If the user confirms (yes / send / go ahead), call send_proposal with confirmed=true. If they decline, call clear_pending_action.`
      : `\nThere is a pending action: ${JSON.stringify(pending)}. If the user confirms (yes / send / go ahead), call send_invoice with confirmed=true. If they decline, call clear_pending_action.`
    : "";

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
