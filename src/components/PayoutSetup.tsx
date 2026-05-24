import { useCallback, useEffect, useState, type FC } from "react";
import { authHeader, supabaseConfigured } from "../lib/supabase";

const PLAID_LINK_SRC = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";

interface PlaidLinkHandler {
  open: () => void;
  exit: (opts?: { force?: boolean }) => void;
  destroy: () => void;
}

interface PlaidLinkOnSuccessMetadata {
  institution?: { name?: string; institution_id?: string } | null;
  accounts?: Array<{ id: string; name: string; mask?: string; type?: string; subtype?: string }>;
  link_session_id?: string;
}

interface PlaidGlobal {
  create(opts: {
    token: string;
    onSuccess: (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => void;
    onExit?: (err: unknown, metadata: unknown) => void;
    onEvent?: (eventName: string, metadata: unknown) => void;
  }): PlaidLinkHandler;
}

declare global {
  interface Window {
    Plaid?: PlaidGlobal;
  }
}

interface AccountSummary {
  account_id: string;
  name?: string;
  official_name?: string | null;
  mask?: string | null;
  type?: string;
  subtype?: string | null;
  has_ach: boolean;
}

interface VerificationSummary {
  item_id: string;
  institution_id?: string;
  institution_name?: string;
  accounts: AccountSummary[];
  owner_match: "match" | "partial" | "mismatch" | "unknown";
  owner_names_seen: number;
  status: "verified" | "needs_review" | "unverified";
}

interface ExchangeResponse {
  persisted: boolean;
  summary: VerificationSummary;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  Object.assign(headers, await authHeader());
  const res = await fetch(path, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `request_failed_${res.status}`);
  }
  return data;
}

function loadPlaidScript(): Promise<PlaidGlobal> {
  if (typeof window === "undefined") return Promise.reject(new Error("no_window"));
  if (window.Plaid) return Promise.resolve(window.Plaid);
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PLAID_LINK_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => {
        if (window.Plaid) resolve(window.Plaid);
        else reject(new Error("plaid_script_load_failed"));
      });
      existing.addEventListener("error", () => reject(new Error("plaid_script_load_failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = PLAID_LINK_SRC;
    s.async = true;
    s.onload = () => {
      if (window.Plaid) resolve(window.Plaid);
      else reject(new Error("plaid_script_load_failed"));
    };
    s.onerror = () => reject(new Error("plaid_script_load_failed"));
    document.head.appendChild(s);
  });
}

function statusLabel(s: VerificationSummary["status"]): { label: string; color: string } {
  switch (s) {
    case "verified":
      return { label: "Verified", color: "var(--ms2go-green)" };
    case "needs_review":
      return { label: "Needs review", color: "var(--ms2go-yellow)" };
    case "unverified":
    default:
      return { label: "Not yet verified", color: "var(--ms2go-red)" };
  }
}

function ownerMatchLabel(m: VerificationSummary["owner_match"]): string {
  switch (m) {
    case "match":
      return "Name on file matches the bank account holder.";
    case "partial":
      return "Partial name match. A manager may follow up.";
    case "mismatch":
      return "Bank holder name does not match. A manager will reach out.";
    case "unknown":
    default:
      return "Owner name not available from your bank.";
  }
}

export const PayoutSetup: FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<VerificationSummary | null>(null);
  const [linking, setLinking] = useState(false);

  const handleConnect = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const { link_token } = await postJson<{ link_token: string }>(
        "/api/plaid-create-link-token",
        {},
      );
      const Plaid = await loadPlaidScript();
      setLinking(true);
      const handler = Plaid.create({
        token: link_token,
        onSuccess: async (publicToken, metadata) => {
          setLinking(false);
          setLoading(true);
          try {
            const res = await postJson<ExchangeResponse>("/api/plaid-exchange-token", {
              public_token: publicToken,
              institution_name: metadata.institution?.name,
            });
            setSummary(res.summary);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not finish bank verification.");
          } finally {
            setLoading(false);
          }
        },
        onExit: (err) => {
          setLinking(false);
          if (err) setError("Bank linking was cancelled or failed.");
        },
      });
      handler.open();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start bank linking.");
      setLinking(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // No-op: status is loaded only after a successful link in this view.
  }, []);

  const status = summary ? statusLabel(summary.status) : null;

  return (
    <section className="card">
      <h2>Direct deposit setup</h2>
      <p className="subtitle">
        Connect the bank account where you want your MS2GO commissions deposited. We use Plaid to verify
        your account — we never see or store your full account or routing numbers.
      </p>

      {!supabaseConfigured && (
        <p className="error">
          Sign in is not configured in this environment. Bank connection requires an authenticated session.
        </p>
      )}

      <div className="actions" style={{ marginTop: 8 }}>
        <button className="primary" onClick={handleConnect} disabled={loading || linking}>
          {linking ? "Opening Plaid…" : loading ? "Working…" : summary ? "Reconnect bank" : "Connect bank account"}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {summary && (
        <>
          <div className="divider" />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: status?.color,
                }}
              />
              <strong>{status?.label}</strong>
            </div>
            {summary.institution_name && (
              <div style={{ fontSize: 14, marginBottom: 4 }}>
                <strong>Institution:</strong> {summary.institution_name}
              </div>
            )}
            <p style={{ fontSize: 13, color: "var(--ms2go-gray-700)" }}>
              {ownerMatchLabel(summary.owner_match)}
            </p>
            {summary.accounts.length > 0 && (
              <ul style={{ paddingLeft: 18, fontSize: 14 }}>
                {summary.accounts.map((a) => (
                  <li key={a.account_id}>
                    {a.name || a.official_name || "Account"}
                    {a.mask ? ` ····${a.mask}` : ""}
                    {a.type ? ` (${a.type}${a.subtype ? `/${a.subtype}` : ""})` : ""}
                    {a.has_ach ? " — eligible for direct deposit" : " — not ACH-eligible"}
                  </li>
                ))}
              </ul>
            )}
            <p style={{ fontSize: 12, color: "var(--ms2go-gray-500)", marginTop: 12 }}>
              We store only the last 4 digits, institution name, account type, and a verification result.
              Full routing and account numbers stay with Plaid.
            </p>
          </div>
        </>
      )}
    </section>
  );
};
