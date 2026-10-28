export function getOpenAiApiKey() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  return key;
}

export function getBlogWriteModel() {
  return (
    process.env.OPENAI_BLOG_MODEL ||
    process.env.OPENAI_PROPOSAL_MODEL ||
    "gpt-5.4"
  );
}

export function getBlogImageModel() {
  // gpt-image-1 was shut down 2026-10-23.
  return process.env.OPENAI_BLOG_IMAGE_MODEL || "gpt-image-2";
}

/** gpt-5+ / o-series only allow the default temperature (1). */
function modelAllowsCustomTemperature(model: string) {
  const m = model.toLowerCase();
  return !(
    m.startsWith("gpt-5") ||
    m.startsWith("gpt-6") ||
    m.startsWith("o1") ||
    m.startsWith("o3") ||
    m.startsWith("o4")
  );
}

function chatBody(options: {
  model: string;
  temperature?: number;
  maxTokens?: number;
  system: string;
  user: string;
  tokenField: "max_completion_tokens" | "max_tokens";
}) {
  const body: Record<string, unknown> = {
    model: options.model,
    [options.tokenField]: options.maxTokens ?? 8000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: options.system },
      { role: "user", content: options.user },
    ],
  };
  if (modelAllowsCustomTemperature(options.model)) {
    body.temperature = options.temperature ?? 0.55;
  }
  return body;
}

export async function openAiChatJson(options: {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}) {
  const apiKey = getOpenAiApiKey();
  const model = options.model || getBlogWriteModel();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      chatBody({
        model,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        system: options.system,
        user: options.user,
        tokenField: "max_completion_tokens",
      })
    ),
  });

  const json = (await res.json()) as OpenAiChatResponse;

  if (!res.ok) {
    // Fallback: some models still use max_tokens instead of max_completion_tokens.
    if (res.status === 400 && json.error?.message?.includes("max_completion_tokens")) {
      const retry = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          chatBody({
            model,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            system: options.system,
            user: options.user,
            tokenField: "max_tokens",
          })
        ),
      });
      const retryJson = (await retry.json()) as OpenAiChatResponse;
      if (!retry.ok) {
        throw new Error(
          retryJson.error?.message || `OpenAI error (${retry.status}).`
        );
      }
      return parseChatJsonContent(retryJson);
    }
    throw new Error(json.error?.message || `OpenAI error (${res.status}).`);
  }

  return parseChatJsonContent(json);
}

type OpenAiChatResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

function parseChatJsonContent(json: OpenAiChatResponse) {
  const choice = json.choices?.[0];
  const content = choice?.message?.content?.trim();
  const finishReason = choice?.finish_reason;

  if (!content) {
    throw new Error(
      finishReason === "length"
        ? "OpenAI response was truncated (token limit). Try a smaller batch."
        : "Empty OpenAI response."
    );
  }

  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(
      finishReason === "length"
        ? "OpenAI JSON was truncated mid-response. Try a smaller batch."
        : "OpenAI returned invalid JSON."
    );
  }
}
