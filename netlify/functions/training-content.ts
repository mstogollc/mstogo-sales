import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { chat } from "./_lib/openai";

interface TrainingBody {
  topic?: string;
  audience?: "new_rep" | "veteran_rep" | "manager";
  format?: "lesson" | "role_play" | "talk_track" | "objection_handling";
  context?: string;
}

const FORMAT_DIRECTIVE: Record<string, string> = {
  lesson:
    "Produce a tight training lesson: 'Why this matters', '3 things to know', 'Try it' practice prompts, and a one-line takeaway.",
  role_play:
    "Produce a role-play script between an MS2GO rep and a prospective owner. Include 2–3 turns of dialogue per side, a curveball objection, and a coaching note at the end.",
  talk_track:
    "Produce a concise talk track the rep can read aloud, broken into Hook / Insight / Ask, with one-line variations.",
  objection_handling:
    "Produce a structured response: the objection, why it usually surfaces, the MS2GO reframe, and the follow-up question.",
};

function fallbackTraining(body: TrainingBody): string {
  const topic = body.topic || "selling MS2GO Growth";
  return [
    `Topic: ${topic}`,
    "Why this matters: Local businesses convert when their Google footprint is healthy and the rep can speak to specifics.",
    "Three things to know:",
    "  1. The story is in the reviews — quote them on the call.",
    "  2. Tie every recommendation to a number the owner already cares about.",
    "  3. Ask for the next step, not the close.",
    "Try it: Pull a recent lead and write the first three lines of your outreach.",
    "Takeaway: Specific beats clever. Always.",
  ].join("\n");
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: TrainingBody;
  try {
    body = await readJson<TrainingBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  if (!body.topic) return badRequest("missing_topic");
  const directive = FORMAT_DIRECTIVE[body.format || "lesson"] || FORMAT_DIRECTIVE.lesson;
  const audience = body.audience || "new_rep";

  const result = await chat(
    [
      {
        role: "system",
        content:
          "You are MS2GO's sales-enablement coach. Write training content for reps. " +
          "Keep it under 350 words. Use plain English. Never reference AI, models, or prompts. " +
          "Anchor every piece of advice to a specific behavior the rep can do on their next call.",
      },
      {
        role: "user",
        content: [
          `Audience: ${audience}`,
          `Topic: ${body.topic}`,
          body.context ? `Context: ${body.context}` : null,
          directive,
        ]
          .filter(Boolean)
          .join("\n"),
      },
    ],
    { temperature: 0.6, maxTokens: 800 },
    () => fallbackTraining(body),
  );

  return ok({
    content: result.text,
    source: result.source,
    format: body.format || "lesson",
    audience,
  });
};
