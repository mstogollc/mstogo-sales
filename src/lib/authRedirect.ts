/**
 * Resolves the URL that Supabase should send users back to after they click a
 * magic-link email.
 *
 * The bug we're fixing: someone signs in from a desktop dev build, opens the
 * email on a phone, and the link points at `http://localhost:5173/` — which
 * the phone can't reach, surfacing ERR_CONNECTION_FAILED.
 *
 * Resolution order:
 *   1. `VITE_PORTAL_URL` build-time env (e.g. https://portal.mstogo.com).
 *      This is the only reliable signal in production where the deployed origin
 *      is known at build time.
 *   2. The current `window.location` IF it's an https origin that is NOT
 *      localhost / loopback / a private LAN host. This handles preview deploys
 *      and ad-hoc Netlify branch URLs that we didn't bake into VITE_PORTAL_URL.
 *   3. Hard fallback to `https://portal.mstogo.com/`, so a magic link clicked
 *      on a phone always lands somewhere usable even when the dev forgot to
 *      set VITE_PORTAL_URL.
 *
 * For local development you can set `VITE_PORTAL_URL=http://localhost:5173`
 * in `.env.local` to keep magic links pointing at the dev server.
 */

export const DEFAULT_PORTAL_URL = "https://portal.mstogo.com/";

export interface RedirectInputs {
  /** Value of `import.meta.env.VITE_PORTAL_URL`, or whatever the caller supplies. */
  configured?: string | undefined | null;
  /** `window.location` shape — pass `undefined` in non-browser contexts. */
  location?: Pick<Location, "origin" | "pathname" | "protocol" | "hostname"> | undefined;
}

function normalize(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isLocalHostname(host: string): boolean {
  if (!host) return true;
  if (host === "localhost") return true;
  if (host === "0.0.0.0") return true;
  if (host === "::1") return true;
  if (host.endsWith(".local")) return true;
  if (host.endsWith(".localhost")) return true;
  // IPv4 loopback / RFC1918 private ranges that aren't reachable from a phone.
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export function resolveAuthRedirect(inputs: RedirectInputs = {}): string {
  const configured = normalize(inputs.configured ?? "");
  if (configured) return configured;

  const loc = inputs.location;
  if (loc) {
    const host = (loc.hostname || "").toLowerCase();
    const proto = loc.protocol;
    if (proto === "https:" && !isLocalHostname(host)) {
      // Use origin + pathname so we don't drop preview deploy path prefixes,
      // but strip query / hash that may already contain stale auth state.
      const path = loc.pathname || "/";
      return `${loc.origin}${path}`;
    }
  }

  return DEFAULT_PORTAL_URL;
}

/**
 * Convenience wrapper that reads from `import.meta.env` and `window`. Kept thin
 * so tests can exercise `resolveAuthRedirect` directly with explicit inputs.
 */
export function getAuthRedirect(): string {
  const configured =
    typeof import.meta !== "undefined"
      ? ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
          ?.VITE_PORTAL_URL ?? "")
      : "";
  const location = typeof window !== "undefined" ? window.location : undefined;
  return resolveAuthRedirect({ configured, location });
}
