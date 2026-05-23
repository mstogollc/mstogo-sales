import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { sendEmail } from "./_lib/resend";
import { currentUser, tryPersist } from "./_lib/supabase";

interface SendBody {
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  kind?: "qualification" | "prospect" | "follow_up" | "proposal";
  leadId?: string;
  prospectId?: string;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: SendBody;
  try {
    body = await readJson<SendBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const recipients = Array.isArray(body.to) ? body.to : body.to ? [body.to] : [];
  if (recipients.length === 0) return badRequest("missing_recipient");
  for (const r of recipients) {
    if (!isEmail(r)) return badRequest("invalid_recipient", { value: r });
  }
  if (!body.subject?.trim()) return badRequest("missing_subject");
  if (!body.text?.trim()) return badRequest("missing_text");

  const result = await sendEmail({
    to: recipients,
    subject: body.subject,
    text: body.text,
    html: body.html,
    from: body.from,
    replyTo: body.replyTo,
  });

  const me = await currentUser(req);
  if (me) {
    await tryPersist("send-email", async () => {
      const { error } = await me.client.from("outreach_activity").insert({
        owner_id: me.id,
        lead_id: body.leadId ?? null,
        prospect_id: body.prospectId ?? null,
        channel: "email",
        direction: "outbound",
        subject: body.subject,
        body: body.text,
        status: typeof result === "object" && result && "status" in result ? String((result as { status: unknown }).status) : "sent",
        metadata: { to: recipients, kind: body.kind ?? "prospect" },
      });
      if (error) throw error;
    });
  }

  return ok({
    kind: body.kind || "prospect",
    delivery: result,
  });
};
