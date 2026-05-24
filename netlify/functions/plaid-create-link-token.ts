import type { Context } from "@netlify/functions";
import { badRequest, methodNotAllowed, ok, readJson, serverError } from "./_lib/http";
import { currentUser } from "./_lib/supabase";
import { createLinkToken, PlaidApiError } from "./_lib/plaid";

interface CreateLinkBody {
  legal_name?: string;
  email?: string;
  phone?: string;
  redirect_uri?: string;
  client_user_id?: string;
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: CreateLinkBody;
  try {
    body = await readJson<CreateLinkBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  const me = await currentUser(req);
  const userId = me?.id ?? body.client_user_id;
  if (!userId) return badRequest("authentication_required");

  try {
    const result = await createLinkToken({
      userId,
      legalName: body.legal_name,
      email: body.email ?? me?.email ?? undefined,
      phone: body.phone,
      redirectUri: body.redirect_uri,
    });
    return ok({
      link_token: result.link_token,
      expiration: result.expiration,
    });
  } catch (err) {
    if (err instanceof PlaidApiError) {
      console.warn(JSON.stringify({
        source: "plaid-create-link-token",
        level: "warn",
        status: err.status,
        error_code: err.errorCode,
        error_type: err.errorType,
        request_id: err.requestId,
      }));
      return serverError("plaid_link_token_failed", {
        error_code: err.errorCode,
        error_type: err.errorType,
      });
    }
    const msg = err instanceof Error ? err.message : "unknown_error";
    if (msg.startsWith("missing_env:")) {
      return serverError("plaid_not_configured", { detail: msg });
    }
    console.error("[plaid-create-link-token]", msg);
    return serverError("internal_error");
  }
};
