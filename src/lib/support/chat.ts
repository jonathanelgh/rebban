import { SUPPORT_SYSTEM_PROMPT } from "@/lib/support/knowledge";
import {
  SUPPORT_TOOL_DEFINITIONS,
  executeSupportTool,
  type SupportToolContext,
} from "@/lib/support/tools";

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

const MAX_TOOL_ROUNDS = 4;

export async function generateSupportReply(options: {
  messages: SupportChatMessage[];
  userName?: string | null;
  toolContext: SupportToolContext;
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

  const model = process.env.OPENAI_SUPPORT_MODEL || "gpt-4o-mini";
  const system = `${SUPPORT_SYSTEM_PROMPT}

The user's name is ${options.userName || "there"}.

You have tools to look up THIS user's real workspace data (plan, clients, proposals, invoices, tasks, time, email connections), and escalate_to_human for issues you cannot resolve.
- Use tools when the question is about their account or their data.
- Do not invent account specifics. If a tool returns an error or empty result, say so clearly.
- For how-to questions, follow the product docs in the system prompt exactly (real Rebban labels and placements). Never guess with "usually" or generic SaaS patterns.
- When escalate_to_human succeeds, tell the user a human will email within 24 hours and include the ticket reference returned by the tool.
- Never expose raw IDs unless helpful for support; prefer titles, names, and statuses.
- Keep answers concise and practical. Light Markdown is fine.`

  const messages: OpenAiMessage[] = [
    { role: "system", content: system },
    ...history,
  ];

  const toolsUsed: string[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 800,
        tools: SUPPORT_TOOL_DEFINITIONS,
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
      const result = await executeSupportTool(
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
