import { describe, it, expect } from "vitest";
import { resolveAuthRedirect, DEFAULT_PORTAL_URL } from "./authRedirect";

function loc(partial: Partial<Location>): Location {
  return {
    origin: "https://example.com",
    pathname: "/",
    protocol: "https:",
    hostname: "example.com",
    ...partial,
  } as unknown as Location;
}

describe("resolveAuthRedirect", () => {
  it("prefers the configured VITE_PORTAL_URL when present", () => {
    expect(
      resolveAuthRedirect({
        configured: "https://portal.mstogo.com/",
        location: loc({ origin: "http://localhost:5173", hostname: "localhost", protocol: "http:" }),
      }),
    ).toBe("https://portal.mstogo.com/");
  });

  it("ignores a malformed configured value and falls back", () => {
    expect(
      resolveAuthRedirect({ configured: "not-a-url", location: undefined }),
    ).toBe(DEFAULT_PORTAL_URL);
  });

  it("uses window.location when on a public https origin", () => {
    expect(
      resolveAuthRedirect({
        configured: "",
        location: loc({
          origin: "https://portal-preview--site.netlify.app",
          pathname: "/dashboard",
          hostname: "portal-preview--site.netlify.app",
        }),
      }),
    ).toBe("https://portal-preview--site.netlify.app/dashboard");
  });

  it("falls back to the deployed portal when running on localhost", () => {
    expect(
      resolveAuthRedirect({
        configured: "",
        location: loc({
          origin: "http://localhost:5173",
          hostname: "localhost",
          protocol: "http:",
          pathname: "/",
        }),
      }),
    ).toBe(DEFAULT_PORTAL_URL);
  });

  it("falls back to the deployed portal when running on http (non-https)", () => {
    // Even if the dev forgot to set VITE_PORTAL_URL and is on a public http
    // host, we should not hand Supabase an http URL — production Supabase will
    // reject it and the link is unsafe over the wire anyway.
    expect(
      resolveAuthRedirect({
        configured: "",
        location: loc({
          origin: "http://example.com",
          hostname: "example.com",
          protocol: "http:",
        }),
      }),
    ).toBe(DEFAULT_PORTAL_URL);
  });

  it("rejects loopback and RFC1918 hosts", () => {
    for (const host of ["127.0.0.1", "10.0.0.5", "192.168.1.20", "172.16.5.5"]) {
      expect(
        resolveAuthRedirect({
          configured: "",
          location: loc({ hostname: host, origin: `https://${host}`, protocol: "https:" }),
        }),
      ).toBe(DEFAULT_PORTAL_URL);
    }
  });

  it("returns the default when no location is available (SSR/Node)", () => {
    expect(resolveAuthRedirect({ configured: "", location: undefined })).toBe(
      DEFAULT_PORTAL_URL,
    );
  });

  it("allows pointing magic links at a local dev server via VITE_PORTAL_URL", () => {
    // Devs who actually want to receive magic-link emails on their phone but
    // bounce to a tunneled dev server (ngrok, Cloudflare Tunnel) just set
    // VITE_PORTAL_URL in .env.local. This test pins that override behavior.
    expect(
      resolveAuthRedirect({
        configured: "https://dev-tunnel.example.com/",
        location: loc({ hostname: "localhost", origin: "http://localhost:5173", protocol: "http:" }),
      }),
    ).toBe("https://dev-tunnel.example.com/");
  });
});
