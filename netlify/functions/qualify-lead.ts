import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson, json } from "./_lib/http";
import { currentUser } from "./_lib/supabase";

interface QualifyBody {
  leadId?: string;
  prospectId?: string;
  answers?: Record<string, unknown>;
  notes?: string;
}

type Pkg = "basic" | "growth" | "premium";

function scoreAnswers(answers: Record<string, unknown>): { score: number; pkg: Pkg; qualified: boolean } {
  const keys = Object.keys(answers);
  const positives = keys.filter((k) => {
    const v = answers[k];
    return (
      v === true ||
      v === "yes" ||
      (typeof v === "number" && v > 0) ||
      (typeof v === "string" && v.length > 4)
    );
  }).length;
  const score = Math.min(100, positives * 12);
  const pkg: Pkg = score >= 80 ? "premium" : score >= 55 ? "growth" : "basic";
  return { score, pkg, qualified: score >= 50 };
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: QualifyBody;
  try {
    body = await readJson<QualifyBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  if (!body.answers || typeof body.answers !== "object") {
    return badRequest("missing_answers");
  }

  const { score, pkg, qualified } = scoreAnswers(body.answers);

  const me = await currentUser(req);
  if (!me) {
    return ok({ score, qualified, recommended_package: pkg, persisted: false });
  }

  const { data, error } = await me.client
    .from("qualification_submissions")
    .insert({
      lead_id: body.leadId ?? null,
      prospect_id: body.prospectId ?? null,
      submitted_by: me.id,
      answers: body.answers,
      qualified,
      score,
      recommended_package: pkg,
      notes: body.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return json(400, { error: error.message });

  if (qualified && body.leadId) {
    await me.client.from("leads").update({ status: "qualified", score }).eq("id", body.leadId);
  }

  return ok({
    submission_id: data.id,
    score,
    qualified,
    recommended_package: pkg,
    persisted: true,
  });
};
