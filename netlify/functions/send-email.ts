import type { Context } from "@netlify/functions";
import { ok, badRequest, methodNotAllowed, readJson } from "./_lib/http";
import { sendEmail } from "./_lib/resend";

interface SendBody {
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  from?: string;
  replyTo?: string;
  kind?: "qualification" | "prospect" | "follow_up" | "proposal";
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

  return ok({
    kind: body.kind || "prospect",
    delivery: result,
  });
};
