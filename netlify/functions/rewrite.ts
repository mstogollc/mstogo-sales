import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";

interface RewriteBody {
  text?: string;
  tone?: "warm" | "direct" | "consultative" | "shorter" | "more_confident";
  audience?: string;
}

const TONE_PROMPTS: Record<string, string> = {
  warm: "Make it warmer and more personable, but stay professional.",
  direct: "Make it shorter and more direct. Cut filler.",
  consultative: "Rewrite in a consultative tone — anchor on the prospect's problem first.",
  shorter: "Tighten it to roughly half the length, keep the core ask intact.",
  more_confident: "Rewrite with more confidence and clearer next step.",
};

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: RewriteBody;
  try {
    body = await readJson<RewriteBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const text = body.text?.trim();
  if (!text) return badRequest("missing_text");

  const directive = TONE_PROMPTS[body.tone || "consultative"] || TONE_PROMPTS.consultative;
  const audience = body.audience ? `Audience: ${body.audience}.` : "";

  const result = await chat(
    [
      {
        role: "system",
        content:
          "You rewrite sales copy for MS2GO. Preserve the user's intent. " +
          "Never mention that you are an AI or reference prompts/models. " +
          "Return only the rewritten copy — no preamble.",
      },
      { role: "user", content: `${directive} ${audience}\n\n---\n${text}` },
    ],
    { temperature: 0.5, maxTokens: 600 },
    () => text,
  );

  return ok({ text: result.text, source: result.source });
};
