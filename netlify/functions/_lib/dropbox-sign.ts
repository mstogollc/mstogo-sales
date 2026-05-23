import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

export const DROPBOX_SIGN_ACK = "Hello API Event Received";

export interface DropboxSignEvent {
  event_type?: string;
  event_time?: string;
  event_hash?: string;
  event_metadata?: Record<string, unknown>;
}

export interface DropboxSignPayload {
  event?: DropboxSignEvent;
  account?: Record<string, unknown>;
  signature_request?: Record<string, unknown>;
  template?: Record<string, unknown>;
  raw?: unknown;
}

export interface DropboxSignParseResult {
  ok: boolean;
  payload?: DropboxSignPayload;
  reason?: string;
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function extractJsonField(rawBody: string, contentType: string): string | undefined {
  const ctLower = contentType.toLowerCase();
  if (ctLower.includes("application/json")) return rawBody;

  if (ctLower.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const json = params.get("json");
    return json ?? undefined;
  }

  if (ctLower.includes("multipart/form-data")) {
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
    if (!boundary) return undefined;
    const delimiter = `--${boundary}`;
    const parts = rawBody.split(delimiter);
    for (const part of parts) {
      const headerEnd = part.indexOf("\r\n\r\n");
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd);
      const disposition = headers.match(/name="([^"]+)"/i)?.[1];
      if (disposition === "json") {
        let value = part.slice(headerEnd + 4);
        if (value.endsWith("\r\n")) value = value.slice(0, -2);
        return value.trim();
      }
    }
    return undefined;
  }

  return rawBody;
}

export function parseDropboxSignPayload(rawBody: string, contentType: string): DropboxSignParseResult {
  if (!rawBody || rawBody.trim().length === 0) {
    return { ok: false, reason: "empty_body" };
  }

  const jsonText = extractJsonField(rawBody, contentType);
  if (!jsonText) return { ok: false, reason: "missing_json_field" };

  const parsed = tryJsonParse(jsonText);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_json" };
  }

  return { ok: true, payload: parsed as DropboxSignPayload };
}

export interface VerifyOptions {
  apiKey?: string;
}

export function verifyEventHash(event: DropboxSignEvent | undefined, opts: VerifyOptions = {}): boolean {
  const apiKey = opts.apiKey ?? getEnv("DROPBOX_SIGN_API_KEY");
  if (!apiKey || !event?.event_hash || !event.event_time || !event.event_type) return false;
  const expected = createHmac("sha256", apiKey)
    .update(`${event.event_time}${event.event_type}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(event.event_hash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface EventSummary {
  event_type: string;
  event_time?: string;
  signature_request_id?: string;
  account_id?: string;
  template_id?: string;
  verified: boolean | null;
}

export function summarizeEvent(payload: DropboxSignPayload, verified: boolean | null): EventSummary {
  const ev = payload.event ?? {};
  const sr = payload.signature_request as { signature_request_id?: string } | undefined;
  const acct = payload.account as { account_id?: string } | undefined;
  const tpl = payload.template as { template_id?: string } | undefined;
  return {
    event_type: ev.event_type || "unknown",
    event_time: ev.event_time,
    signature_request_id: sr?.signature_request_id,
    account_id: acct?.account_id,
    template_id: tpl?.template_id,
    verified,
  };
}
