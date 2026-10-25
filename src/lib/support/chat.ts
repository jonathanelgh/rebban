import { SUPPORT_SYSTEM_PROMPT } from "@/lib/support/knowledge";
import {
  SUPPORT_TOOL_DEFINITIONS,
  executeSupportTool,
  type SupportToolContext,
} from "@/lib/support/tools";
import {
  ASSISTANT_TOOL_DEFINITIONS,
  executeAssistantTool,
  type AssistantPendingAction,
  type AssistantToolContext,
} from "@/lib/assistant/tools";

export type SupportChatMessage = {
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

export function isSupportAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

const MAX_TOOL_ROUNDS = 5;

/** Support-only tools that do not collide with WhatsApp assistant tool names. */
const SUPPORT_EXTRA_TOOL_NAMES = new Set([
  "get_account_plan",
  "get_client",
  "get_proposal",
  "get_invoice",
  "get_time_summary",
  "get_email_connections",
  "escalate_to_human",
]);

const ASSISTANT_TOOL_NAMES = new Set(
  ASSISTANT_TOOL_DEFINITIONS.map((t) => t.function.name)
);

const DASHBOARD_TOOL_DEFINITIONS = [
  ...ASSISTANT_TOOL_DEFINITIONS,
  ...SUPPORT_TOOL_DEFINITIONS.filter((t) =>
    SUPPORT_EXTRA_TOOL_NAMES.has(t.function.name)
  ),
];

const WORKSPACE_ACTIONS_PROMPT = `## Workspace actions (same capabilities as WhatsApp Assistant)
You can take action in THIS user's workspace with tools — not only look things up:
- Add / find / list clients and leads
- List / find / create projects
- List / create tasks (board columns: backlog, todo, in_progress, review, done)
- List draft invoices; create fixed-amount invoice drafts
- List unbilled worked hours and create a draft invoice from them
- List unpaid invoices
- Create AI draft proposals from the user's project notes/context
- List draft proposals
- Send an invoice or proposal ONLY after the user clearly confirms (yes / send it / confirm)

Action rules:
- Always use tools for lookups and writes. Do not invent IDs, amounts, counts, or statuses.
- Never create duplicate clients. If add_client returns already_existed, reuse that client_id. Do not call add_client again when creating an invoice/proposal for someone who already exists — use client_id or client_query.
- When a tool returns multiple client matches, ask once then retry with client_id. Identical email matches should use the first id without re-asking.
- Website/domains belong in website, not company.
- "How many clients / list clients" → list_clients. "How many leads" → list_leads.
- Creating a project requires a client. Creating a task can optionally link client and/or project.
- "Invoices to send" / drafts → list_draft_invoices. Unpaid / who owes me → list_unpaid_invoices.
- Unbilled hours / bill time → list_unbilled_hours, then create_invoice_from_unbilled for a client.
- Proposal requests → create_proposal_draft. Put ALL useful context from their message into notes.
- When creating any invoice/proposal draft, summarize client, amount (and hours if from time / title if proposal), and status Draft, then ask if they want it sent.
- Pending send_invoice → call send_invoice with confirmed=true. Pending send_proposal → call send_proposal with confirmed=true.
- Never send unless the user confirmed in this conversation (or pending confirmation is set).
- If a tool returns an error or empty result, say so clearly and ask a clarifying question.
- Prefer action tools for "do this for me" requests. Prefer product docs for "how do I…" click-path questions.
- This is Rebban Assistant, not a support ticket by default. Only call escalate_to_human when the user asks for a human / support agent, or for bugs, billing disputes, account lockouts, legal/security requests you cannot resolve.
- escalate_to_human creates a support ticket — do not escalate for normal how-tos or workspace actions.`;

export async function generateSupportReply(options: {
  messages: SupportChatMessage[];
  userName?: string | null;
  conversationId: string;
  toolContext: SupportToolContext;
  pendingAction: AssistantPendingAction | null;
  setPendingAction: (action: AssistantPendingAction | null) => Promise<void>;
}): Promise<{ reply: string; toolsUsed: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const history = options.messages
    .filter((m) => m.content.trim())
    .slice(-20)
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

  const pending = options.pendingAction;
  const pendingHint = pending
    ? pending.type === "send_proposal"
      ? `\nThere is a pending action: ${JSON.stringify(pending)}. If the user confirms (yes / send / go ahead), call send_proposal with confirmed=true. If they decline, call clear_pending_action.`
      : `\nThere is a pending action: ${JSON.stringify(pending)}. If the user confirms (yes / send / go ahead), call send_invoice with confirmed=true. If they decline, call clear_pending_action.`
    : "";

  const system = `${SUPPORT_SYSTEM_PROMPT}

${WORKSPACE_ACTIONS_PROMPT}

The user's name is ${options.userName || "there"}.${pendingHint}

You have tools to look up AND change THIS user's real workspace data, plus escalate_to_human for issues you cannot resolve.
- Use action tools when they ask you to create, send, list, or manage work.
- Use lookup tools (get_*) and product docs for how-to and account questions.
- Do not invent account specifics. If a tool returns an error or empty result, say so clearly.
- For how-to questions, follow the product docs in the system prompt exactly (real Rebban labels and placements). Never guess with "usually" or generic SaaS patterns.
- When escalate_to_human succeeds, tell the user a human will email within 24 hours and include the ticket reference returned by the tool.
- Never expose raw IDs unless helpful for support; prefer titles, names, and statuses.
- Keep answers concise and practical. Light Markdown is fine.`;

  const messages: OpenAiMessage[] = [
    { role: "system", content: system },
    ...history,
  ];

  const toolsUsed: string[] = [];

  const assistantCtx: AssistantToolContext = {
    db: options.toolContext.db,
    userId: options.toolContext.userId,
    organizationId: options.toolContext.organizationId,
    conversationId: options.conversationId,
    pendingAction: options.pendingAction,
    setPendingAction: async (action) => {
      assistantCtx.pendingAction = action;
      await options.setPendingAction(action);
    },
    channel: "in_app",
  };

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 900,
        tools: DASHBOARD_TOOL_DEFINITIONS,
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
          `OpenAI rejected the API key. Check OPENAI_API_KEY in .env.local / Vercel.`
        );
      }
      throw new Error(detail);
    }

    const message = json.choices?.[0]?.message;
    if (!message) throw new Error("Empty support reply.");

    const toolCalls = message.tool_calls || [];
    if (!toolCalls.length) {
      const content = message.content?.trim();
      if (!content) throw new Error("Empty support reply.");
      return { reply: content, toolsUsed };
    }

    messages.push({
      role: "assistant",
      content: message.content || null,
      tool_calls: toolCalls,
    });

    for (const call of toolCalls) {
      const name = call.function?.name || "unknown";
      toolsUsed.push(name);
      console.info("[support] tool call", {
        name,
        userId: options.toolContext.userId,
      });

      const result = ASSISTANT_TOOL_NAMES.has(name)
        ? await executeAssistantTool(
            assistantCtx,
            name,
            call.function?.arguments || "{}"
          )
        : await executeSupportTool(
            options.toolContext,
            name,
            call.function?.arguments || "{}"
          );

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result).slice(0, 12000),
      });
    }
  }

  throw new Error("Support AI took too many tool steps. Try a simpler question.");
}
