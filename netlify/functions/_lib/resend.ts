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
