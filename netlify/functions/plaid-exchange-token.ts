import type { Context } from "@netlify/functions";
import { badRequest, methodNotAllowed, ok, readJson, serverError } from "./_lib/http";
import { currentUser } from "./_lib/supabase";
import { serviceClient } from "./_lib/supabase";
import {
  buildVerificationSummary,
  exchangePublicToken,
  getAuth,
  getIdentity,
  getInstitution,
  PlaidApiError,
} from "./_lib/plaid";

interface ExchangeBody {
  public_token?: string;
  institution_name?: string;
  expected_owner_name?: string;
  metadata?: Record<string, unknown>;
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== "POST") return methodNotAllowed(["POST"]);

  let body: ExchangeBody;
  try {
    body = await readJson<ExchangeBody>(req);
  } catch {
    return badRequest("invalid_json_body");
  }

  if (!body.public_token || typeof body.public_token !== "string") {
    return badRequest("missing_public_token");
  }

  const me = await currentUser(req);

  try {
    const exchange = await exchangePublicToken(body.public_token);
    const accessToken = exchange.access_token;
    const itemId = exchange.item_id;

    const auth = await getAuth(accessToken);

    let identity = null;
    try {
      identity = await getIdentity(accessToken);
    } catch (e) {
      if (e instanceof PlaidApiError) {
        console.warn(JSON.stringify({
          source: "plaid-exchange-token",
          level: "warn",
          stage: "identity",
          error_code: e.errorCode,
          error_type: e.errorType,
        }));
      }
    }

    let institutionName = body.institution_name;
    const institutionId = auth.item?.institution_id;
    if (!institutionName && institutionId) {
      try {
        const inst = await getInstitution(institutionId);
        institutionName = inst.institution?.name;
      } catch {
        // best-effort
      }
    }

    const expectedOwner = body.expected_owner_name ?? me?.email ?? null;
    const summary = buildVerificationSummary({
      itemId,
      auth,
      identity,
      institutionName,
      expectedOwnerName: expectedOwner,
    });

    // Best-effort persistence using the service role. We never write
    // routing/account numbers; only last4 mask + verification metadata.
    if (me) {
      const svc = serviceClient();
      if (svc) {
        const primaryAccount = summary.accounts.find((a) => a.has_ach) ?? summary.accounts[0];
        if (primaryAccount) {
          const row = {
            rep_id: me.id,
            provider: "plaid",
            item_id: itemId,
            access_token: accessToken,
            institution_id: summary.institution_id ?? null,
            institution_name: summary.institution_name ?? null,
            account_id: primaryAccount.account_id,
            account_name: primaryAccount.name ?? null,
            account_official_name: primaryAccount.official_name ?? null,
            account_type: primaryAccount.type ?? null,
            account_subtype: primaryAccount.subtype ?? null,
            account_mask: primaryAccount.mask ?? null,
            owner_match: summary.owner_match,
            owner_names_seen: summary.owner_names_seen,
            status: summary.status,
            last_verified_at: new Date().toISOString(),
            metadata: body.metadata ?? {},
          };
          const { error } = await svc
            .from("rep_payout_accounts")
            .upsert(row, { onConflict: "rep_id,item_id,account_id" });
          if (error) {
            console.warn(JSON.stringify({
              source: "plaid-exchange-token",
              level: "warn",
              stage: "persist",
              message: error.message,
            }));
          }
        }
      }
    }

    // NEVER return the access_token to the browser.
    return ok({
      persisted: Boolean(me),
      summary,
    });
  } catch (err) {
    if (err instanceof PlaidApiError) {
      console.warn(JSON.stringify({
        source: "plaid-exchange-token",
        level: "warn",
        status: err.status,
        error_code: err.errorCode,
        error_type: err.errorType,
        request_id: err.requestId,
      }));
      return serverError("plaid_exchange_failed", {
        error_code: err.errorCode,
        error_type: err.errorType,
      });
    }
    const msg = err instanceof Error ? err.message : "unknown_error";
    if (msg.startsWith("missing_env:")) {
      return serverError("plaid_not_configured", { detail: msg });
    }
    console.error("[plaid-exchange-token]", msg);
    return serverError("internal_error");
  }
};
