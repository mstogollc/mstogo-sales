import type { Context } from "@netlify/functions";
import {
  DROPBOX_SIGN_ACK,
  parseDropboxSignPayload,
  summarizeEvent,
  verifyEventHash,
} from "./_lib/dropbox-sign";
import { getEnv } from "./_lib/env";

function ackResponse(status = 200): Response {
  return new Response(DROPBOX_SIGN_ACK, {
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
    return new Response(DROPBOX_SIGN_ACK, {
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

  const parsed = parseDropboxSignPayload(rawBody, contentType);
  if (!parsed.ok || !parsed.payload) {
    console.warn(JSON.stringify({
      source: "dropbox-sign-callback",
      level: "warn",
      reason: parsed.reason || "unparseable_payload",
      contentType,
    }));
    return ackResponse();
  }

  const apiKey = getEnv("DROPBOX_SIGN_API_KEY");
  const verified = apiKey ? verifyEventHash(parsed.payload.event, { apiKey }) : null;
  const summary = summarizeEvent(parsed.payload, verified);

  console.log(JSON.stringify({
    source: "dropbox-sign-callback",
    level: "info",
    ...summary,
  }));

  return ackResponse();
};
