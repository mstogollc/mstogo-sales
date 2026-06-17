import { getEnv } from "./env";
import { MS2GO_BRAND } from "./brand";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  from?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Wrap a plain-text proposal in a warm, MS2GO-branded HTML email so the prospect
 * receives a professional message rather than a bare text dump. The proposal copy
 * itself is preserved verbatim (escaped, newlines honored) inside the body — no
 * pricing or structure is altered here.
 */
export function proposalEmailHtml(opts: {
  proposalText: string;
  businessName?: string;
  contactName?: string;
}): string {
  const rep = MS2GO_BRAND.primaryRep;
  const greetingName = opts.contactName?.trim();
  const greeting = greetingName ? `Hi ${escapeHtml(greetingName)},` : "Hello,";
  const forBusiness = opts.businessName?.trim() ? ` for ${escapeHtml(opts.businessName.trim())}` : "";
  const body = escapeHtml(opts.proposalText).replace(/\n/g, "<br />");
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a2e;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#0b1f3a;padding:28px 32px;">
                <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">MS2GO</div>
                <div style="font-size:13px;color:#9fb3d1;margin-top:4px;">Growth Proposal</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${greeting}</p>
                <p style="margin:0 0 20px;font-size:16px;line-height:1.6;">
                  Thank you for the opportunity to put together this proposal${forBusiness}. We're excited about
                  what we can build together. Your full proposal is below — please reach out with any questions,
                  and we'll be glad to walk through it with you.
                </p>
                <div style="border:1px solid #e3e7ee;border-radius:8px;padding:20px 24px;background:#fbfcfe;font-size:14px;line-height:1.6;color:#1a1a2e;">
                  ${body}
                </div>
                <p style="margin:24px 0 4px;font-size:16px;line-height:1.5;">Warm regards,</p>
                <p style="margin:0;font-size:16px;font-weight:600;">${escapeHtml(rep.name)}</p>
                <p style="margin:2px 0 0;font-size:14px;color:#5a6478;">${escapeHtml(rep.title)}</p>
                <p style="margin:2px 0 0;font-size:14px;color:#5a6478;">
                  <a href="mailto:${escapeHtml(rep.defaultEmail)}" style="color:#1f5fb0;text-decoration:none;">${escapeHtml(rep.defaultEmail)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 32px;background:#f4f5f7;font-size:12px;color:#8a94a6;text-align:center;">
                MS2GO — Local growth, done for you.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export type SendEmailResult =
  | { status: "sent"; id: string }
  | { status: "queued_local"; reason: string }
  | { status: "error"; reason: string };

interface ResendSuccess {
  id?: string;
}

interface ResendError {
  message?: string;
  name?: string;
}

const RESEND_URL = "https://api.resend.com/emails";

function resolveFrom(input: SendEmailInput): string {
  return input.from || getEnv("MS2GO_FROM_EMAIL") || MS2GO_BRAND.defaultFromEmail;
}

function resolveReplyTo(input: SendEmailInput): string {
  return input.replyTo || getEnv("MS2GO_REPLY_TO") || MS2GO_BRAND.defaultReplyTo;
}

export async function sendEmail(
  input: SendEmailInput,
  fetchImpl: typeof fetch = fetch,
): Promise<SendEmailResult> {
  const apiKey = getEnv("RESEND_API_KEY");
  if (!apiKey) {
    return {
      status: "queued_local",
      reason: "RESEND_API_KEY not configured — message ready to send once domain verification completes.",
    };
  }

  const from = resolveFrom(input);
  const replyTo = resolveReplyTo(input);

  try {
    const res = await fetchImpl(RESEND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(input.to) ? input.to : [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: replyTo,
      }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as ResendError;
      return { status: "error", reason: body.message || `resend_${res.status}` };
    }

    const body = (await res.json()) as ResendSuccess;
    return { status: "sent", id: body.id || "" };
  } catch (err) {
    return {
      status: "error",
      reason: err instanceof Error ? err.message : "unknown_resend_error",
    };
  }
}
