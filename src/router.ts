export type RouteId = "app" | "docusign-callback" | "docusign-consent-complete" | "privacy" | "terms";

export function resolveRoute(pathname: string): RouteId {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase();
  switch (normalized) {
    case "/docusign/oauth/callback":
      return "docusign-callback";
    case "/docusign/consent-complete":
      return "docusign-consent-complete";
    case "/privacy":
      return "privacy";
    case "/terms":
      return "terms";
    default:
      return "app";
  }
}
