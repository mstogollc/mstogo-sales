import { getEnv, requireEnv } from "./env";

/**
 * Plaid helper for MS2GO contractor payout onboarding.
 *
 * Use case: independent contractor sales reps connect a bank account so we
 * can route commission direct-deposit. We use only Auth + Identity. We never
 * return raw account/routing numbers or the access_token to the browser.
 */

export type PlaidEnv = "sandbox" | "development" | "production";

const HOST_BY_ENV: Record<PlaidEnv, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com",
};

export function resolvePlaidEnv(value: string | undefined): PlaidEnv {
  const normalized = (value ?? "sandbox").toLowerCase().trim();
  if (normalized === "production" || normalized === "development" || normalized === "sandbox") {
    return normalized;
  }
  return "sandbox";
}

export function plaidBaseUrl(env: PlaidEnv): string {
  return HOST_BY_ENV[env];
}

export interface PlaidCredentials {
  clientId: string;
  secret: string;
  env: PlaidEnv;
}

export function readPlaidCredentials(): PlaidCredentials {
  return {
    clientId: requireEnv("PLAID_CLIENT_ID"),
    secret: requireEnv("PLAID_SECRET"),
    env: resolvePlaidEnv(getEnv("PLAID_ENV")),
  };
}

export interface PlaidRequestOptions {
  credentials?: PlaidCredentials;
  /** Override fetch for testability. */
  fetchImpl?: typeof fetch;
}

export class PlaidApiError extends Error {
  status: number;
  errorCode?: string;
  errorType?: string;
  requestId?: string;

  constructor(message: string, init: { status: number; errorCode?: string; errorType?: string; requestId?: string }) {
    super(message);
    this.name = "PlaidApiError";
    this.status = init.status;
    this.errorCode = init.errorCode;
    this.errorType = init.errorType;
    this.requestId = init.requestId;
  }
}

export async function plaidPost<T>(
  path: string,
  body: Record<string, unknown>,
  opts: PlaidRequestOptions = {},
): Promise<T> {
  const creds = opts.credentials ?? readPlaidCredentials();
  const f = opts.fetchImpl ?? fetch;
  const url = `${plaidBaseUrl(creds.env)}${path}`;

  const payload = {
    client_id: creds.clientId,
    secret: creds.secret,
    ...body,
  };

  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let parsed: unknown = undefined;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // fall through; will be treated as upstream error if !ok
    }
  }

  if (!res.ok) {
    const obj = (parsed ?? {}) as {
      error_message?: string;
      error_code?: string;
      error_type?: string;
      request_id?: string;
    };
    throw new PlaidApiError(obj.error_message || `plaid_${res.status}`, {
      status: res.status,
      errorCode: obj.error_code,
      errorType: obj.error_type,
      requestId: obj.request_id,
    });
  }

  return (parsed ?? {}) as T;
}

// ---------------- Link token ----------------

export interface CreateLinkTokenInput {
  userId: string;
  clientName?: string;
  legalName?: string;
  email?: string;
  phone?: string;
  redirectUri?: string;
  webhook?: string;
}

export interface CreateLinkTokenResponse {
  link_token: string;
  expiration: string;
  request_id?: string;
}

export async function createLinkToken(
  input: CreateLinkTokenInput,
  opts: PlaidRequestOptions = {},
): Promise<CreateLinkTokenResponse> {
  const body: Record<string, unknown> = {
    client_name: input.clientName || "MS2GO Sales Command Center",
    language: "en",
    country_codes: ["US"],
    products: ["auth", "identity"],
    user: {
      client_user_id: input.userId,
      ...(input.legalName ? { legal_name: input.legalName } : {}),
      ...(input.email ? { email_address: input.email } : {}),
      ...(input.phone ? { phone_number: input.phone } : {}),
    },
  };
  if (input.redirectUri) body.redirect_uri = input.redirectUri;
  if (input.webhook) body.webhook = input.webhook;

  return plaidPost<CreateLinkTokenResponse>("/link/token/create", body, opts);
}

// ---------------- Token exchange ----------------

export interface ExchangePublicTokenResponse {
  access_token: string;
  item_id: string;
  request_id?: string;
}

export async function exchangePublicToken(
  publicToken: string,
  opts: PlaidRequestOptions = {},
): Promise<ExchangePublicTokenResponse> {
  return plaidPost<ExchangePublicTokenResponse>(
    "/item/public_token/exchange",
    { public_token: publicToken },
    opts,
  );
}

// ---------------- Auth / Identity ----------------

export interface PlaidAccount {
  account_id: string;
  name?: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string;
  subtype?: string | null;
}

export interface PlaidAuthNumbersACH {
  account_id: string;
  account: string;
  routing: string;
  wire_routing?: string | null;
}

export interface AuthResponse {
  accounts: PlaidAccount[];
  numbers: {
    ach?: PlaidAuthNumbersACH[];
  };
  item: { institution_id?: string };
  request_id?: string;
}

export async function getAuth(accessToken: string, opts: PlaidRequestOptions = {}): Promise<AuthResponse> {
  return plaidPost<AuthResponse>("/auth/get", { access_token: accessToken }, opts);
}

export interface PlaidIdentityOwner {
  names?: string[];
  emails?: Array<{ data: string; primary?: boolean; type?: string }>;
  phone_numbers?: Array<{ data: string; primary?: boolean; type?: string }>;
  addresses?: Array<{ data?: Record<string, string | null>; primary?: boolean }>;
}

export interface PlaidIdentityAccount extends PlaidAccount {
  owners?: PlaidIdentityOwner[];
}

export interface IdentityResponse {
  accounts: PlaidIdentityAccount[];
  item: { institution_id?: string };
  request_id?: string;
}

export async function getIdentity(accessToken: string, opts: PlaidRequestOptions = {}): Promise<IdentityResponse> {
  return plaidPost<IdentityResponse>("/identity/get", { access_token: accessToken }, opts);
}

export interface InstitutionResponse {
  institution: { institution_id: string; name: string };
  request_id?: string;
}

export async function getInstitution(
  institutionId: string,
  opts: PlaidRequestOptions = {},
): Promise<InstitutionResponse> {
  const creds = opts.credentials ?? readPlaidCredentials();
  return plaidPost<InstitutionResponse>(
    "/institutions/get_by_id",
    { institution_id: institutionId, country_codes: ["US"] },
    { ...opts, credentials: creds },
  );
}

// ---------------- Verification summary ----------------

function normalizeName(s: string | undefined | null): string {
  if (!s) return "";
  return s.toLowerCase().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ").trim();
}

export type OwnerMatchLevel = "match" | "partial" | "mismatch" | "unknown";

export function compareOwnerName(expected: string | undefined | null, ownerNames: string[]): OwnerMatchLevel {
  const target = normalizeName(expected);
  if (!target || ownerNames.length === 0) return "unknown";
  const expectedTokens = target.split(" ").filter(Boolean);
  let best: OwnerMatchLevel = "mismatch";
  for (const raw of ownerNames) {
    const candidate = normalizeName(raw);
    if (!candidate) continue;
    if (candidate === target) return "match";
    const candTokens = candidate.split(" ").filter(Boolean);
    const overlap = expectedTokens.filter((t) => candTokens.includes(t)).length;
    if (overlap >= Math.min(2, expectedTokens.length) && overlap > 0) {
      best = "partial";
    }
  }
  return best;
}

export interface AccountVerificationSummary {
  account_id: string;
  name?: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string;
  subtype?: string | null;
  has_ach: boolean;
}

export interface PlaidVerificationSummary {
  item_id: string;
  institution_id?: string;
  institution_name?: string;
  accounts: AccountVerificationSummary[];
  owner_match: OwnerMatchLevel;
  owner_names_seen: number;
  status: "verified" | "needs_review" | "unverified";
}

export interface BuildSummaryInput {
  itemId: string;
  auth: AuthResponse;
  identity?: IdentityResponse | null;
  institutionName?: string;
  expectedOwnerName?: string | null;
}

export function buildVerificationSummary(input: BuildSummaryInput): PlaidVerificationSummary {
  const accounts: AccountVerificationSummary[] = input.auth.accounts.map((acct) => {
    const hasAch =
      Array.isArray(input.auth.numbers?.ach) &&
      input.auth.numbers.ach!.some((n) => n.account_id === acct.account_id);
    return {
      account_id: acct.account_id,
      name: acct.name,
      official_name: acct.official_name ?? null,
      mask: acct.mask ?? null,
      type: acct.type,
      subtype: acct.subtype ?? null,
      has_ach: hasAch,
    };
  });

  const ownerNames: string[] = [];
  if (input.identity?.accounts) {
    for (const a of input.identity.accounts) {
      for (const o of a.owners ?? []) {
        for (const n of o.names ?? []) {
          if (typeof n === "string" && n.trim()) ownerNames.push(n);
        }
      }
    }
  }

  const owner_match = compareOwnerName(input.expectedOwnerName, ownerNames);

  const anyAch = accounts.some((a) => a.has_ach);
  let status: PlaidVerificationSummary["status"] = "unverified";
  if (anyAch && (owner_match === "match" || owner_match === "unknown")) status = "verified";
  else if (anyAch && owner_match === "partial") status = "needs_review";
  else if (anyAch && owner_match === "mismatch") status = "needs_review";

  return {
    item_id: input.itemId,
    institution_id: input.auth.item?.institution_id,
    institution_name: input.institutionName,
    accounts,
    owner_match,
    owner_names_seen: ownerNames.length,
    status,
  };
}
