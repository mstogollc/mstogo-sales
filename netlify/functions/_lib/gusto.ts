import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

export const GUSTO_ACK = "ok";

export interface GustoWebhookPayload {
  event_type?: string;
  resource_type?: string;
  resource_uuid?: string;
  entity_type?: string;
  entity_uuid?: string;
  timestamp?: string;
  [key: string]: unknown;
}

export interface GustoParseResult {
  ok: boolean;
  payload?: GustoWebhookPayload;
  reason?: string;
}

function tryJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseGustoPayload(rawBody: string, contentType: string): GustoParseResult {
  if (!rawBody || rawBody.trim().length === 0) {
    return { ok: false, reason: "empty_body" };
  }

  const ctLower = (contentType || "").toLowerCase();

  if (ctLower.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawBody);
    const payloadField = params.get("payload") || params.get("json");
    if (payloadField) {
      const parsed = tryJsonParse(payloadField);
      if (parsed && typeof parsed === "object") {
        return { ok: true, payload: parsed as GustoWebhookPayload };
      }
    }
    const obj: Record<string, unknown> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    if (Object.keys(obj).length === 0) return { ok: false, reason: "empty_form" };
    return { ok: true, payload: obj as GustoWebhookPayload };
  }

  const parsed = tryJsonParse(rawBody);
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, reason: "invalid_json" };
  }
  return { ok: true, payload: parsed as GustoWebhookPayload };
}

export interface GustoSummary {
  event_type: string;
  resource_type?: string;
  resource_uuid?: string;
  entity_type?: string;
  entity_uuid?: string;
  timestamp?: string;
  verified: boolean | null;
}

export function summarizeGustoEvent(payload: GustoWebhookPayload, verified: boolean | null): GustoSummary {
  return {
    event_type: typeof payload.event_type === "string" ? payload.event_type : "unknown",
    resource_type: typeof payload.resource_type === "string" ? payload.resource_type : undefined,
    resource_uuid: typeof payload.resource_uuid === "string" ? payload.resource_uuid : undefined,
    entity_type: typeof payload.entity_type === "string" ? payload.entity_type : undefined,
    entity_uuid: typeof payload.entity_uuid === "string" ? payload.entity_uuid : undefined,
    timestamp: typeof payload.timestamp === "string" ? payload.timestamp : undefined,
    verified,
  };
}

export interface GustoVerifyOptions {
  secret?: string;
  signature?: string | null;
}

export function verifyGustoSignature(rawBody: string, opts: GustoVerifyOptions = {}): boolean {
  const secret = opts.secret ?? getEnv("GUSTO_WEBHOOK_SECRET");
  const signature = opts.signature?.trim();
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.replace(/^sha256=/i, ""), "utf8");
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isTestEvent(payload: GustoWebhookPayload | undefined): boolean {
  if (!payload) return false;
  const t = typeof payload.event_type === "string" ? payload.event_type.toLowerCase() : "";
  return t === "test" || t === "webhook.test" || t === "verification";
}
