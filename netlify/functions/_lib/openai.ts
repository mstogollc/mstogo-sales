import { getEnv } from "./env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface ChatResult {
  source: "openai" | "fallback";
  text: string;
  model?: string;
  reason?: string;
}

const DEFAULT_MODEL = "gpt-4o-mini";

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
  model?: string;
  error?: { message?: string };
}

export async function chat(
  messages: ChatMessage[],
  options: ChatOptions = {},
  fallback?: () => string,
  fetchImpl: typeof fetch = fetch,
): Promise<ChatResult> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    return {
      source: "fallback",
      text: fallback ? fallback() : "",
      reason: "openai_not_configured",
    };
  }
  const model = options.model || DEFAULT_MODEL;
  try {
    const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.6,
        max_tokens: options.maxTokens ?? 700,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ChatCompletionResponse;
      return {
        source: "fallback",
        text: fallback ? fallback() : "",
        reason: body.error?.message || `openai_${res.status}`,
      };
    }

    const body = (await res.json()) as ChatCompletionResponse;
    const content = body.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return {
        source: "fallback",
        text: fallback ? fallback() : "",
        reason: "openai_empty_response",
      };
    }
    return {
      source: "openai",
      text: content,
      model: body.model || model,
    };
  } catch (err) {
    return {
      source: "fallback",
      text: fallback ? fallback() : "",
      reason: err instanceof Error ? err.message : "openai_unknown_error",
    };
  }
}
