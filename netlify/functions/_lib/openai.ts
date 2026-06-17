import { getEnv } from "./env";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /**
   * Hard wall-clock budget for the OpenAI request, in milliseconds. When the
   * model is slow (long full-proposal generations are the worst offender) the
   * request is aborted at this deadline and the caller's deterministic fallback
   * is used instead. This keeps the Netlify function from running past its
   * gateway limit and returning a 504. Callers should pick a value that leaves
   * headroom under the function timeout; the default is conservative.
   */
  timeoutMs?: number;
}

export interface ChatResult {
  source: "openai" | "fallback";
  text: string;
  model?: string;
  reason?: string;
}

const DEFAULT_MODEL = "gpt-4o-mini";

// Default OpenAI request budget. Netlify's synchronous functions return a 504
// once they pass the gateway limit (10s on the default plan), so we abort the
// upstream call well before that and serve the deterministic fallback. An
// operator can override this with OPENAI_TIMEOUT_MS without a code change.
const DEFAULT_TIMEOUT_MS = 8000;

function resolveTimeoutMs(optionTimeout?: number): number {
  if (typeof optionTimeout === "number" && optionTimeout > 0) return optionTimeout;
  const fromEnv = Number(getEnv("OPENAI_TIMEOUT_MS"));
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return DEFAULT_TIMEOUT_MS;
}

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
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      signal: controller.signal,
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
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    return {
      source: "fallback",
      text: fallback ? fallback() : "",
      reason: aborted ? "openai_timeout" : err instanceof Error ? err.message : "openai_unknown_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
