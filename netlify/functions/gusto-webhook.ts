import type { Context } from "@netlify/functions";
import {
  GUSTO_ACK,
  isTestEvent,
  parseGustoPayload,
  summarizeGustoEvent,
  verifyGustoSignature,
} from "./_lib/gusto";
import { getEnv } from "./_lib/env";

function ackResponse(status = 200, body = GUSTO_ACK): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export default async (req: Request, _ctx: Context) => {
  if (req.method === "GET" || req.method === "HEAD") {
    return ackResponse();
  }
  if (req.method !== "POST") {
    return new Response(GUSTO_ACK, {
      status: 405,
      headers: { "content-type": "text/plain; charset=utf-8", allow: "POST, GET, HEAD" },
    });
  }

  const contentType = req.headers.get("content-type") || "";
  let rawBody = "";
  try {
    rawBody = await req.text();
  } catch {
    return ackResponse();
  }

  const parsed = parseGustoPayload(rawBody, contentType);
  if (!parsed.ok || !parsed.payload) {
    console.warn(JSON.stringify({
      source: "gusto-webhook",
      level: "warn",
      reason: parsed.reason || "unparseable_payload",
      contentType,
    }));
    return ackResponse();
  }

  const secret = getEnv("GUSTO_WEBHOOK_SECRET");
  const signatureHeader =
    req.headers.get("x-gusto-signature") ||
    req.headers.get("gusto-signature") ||
    req.headers.get("x-hub-signature-256");
  const verified = secret
    ? verifyGustoSignature(rawBody, { secret, signature: signatureHeader })
    : null;

  const summary = summarizeGustoEvent(parsed.payload, verified);

  console.log(JSON.stringify({
    source: "gusto-webhook",
    level: "info",
    test: isTestEvent(parsed.payload),
    ...summary,
  }));

  return ackResponse();
};
