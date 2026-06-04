import type { SalesOpsModuleId } from "./components/SalesOpsLayout";

export type RouteId =
  | "ops"
  | "docusign-callback"
  | "docusign-consent-complete"
  | "gusto-callback"
  | "privacy"
  | "terms";

export interface Route {
  id: RouteId;
  module?: SalesOpsModuleId;
}

const OPS_PATHS: Record<string, SalesOpsModuleId> = {
  "/sales-ops": "command-center",
  "/sales-ops/leads": "leads",
  "/sales-ops/intel": "intel",
  "/sales-ops/heat-map": "heatmap",
  "/sales-ops/proposals": "proposal",
  "/sales-ops/outreach": "outreach",
  "/sales-ops/calendar": "calendar",
  "/sales-ops/pipeline": "pipeline",
  "/sales-ops/payouts": "payouts",
  "/sales-ops/training": "training",
  "/sales-ops/integrations": "integrations",
};

export function resolveRoute(pathname: string): Route {
  const normalized = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  switch (normalized) {
    case "/docusign/oauth/callback":
      return { id: "docusign-callback" };
    case "/docusign/consent-complete":
      return { id: "docusign-consent-complete" };
    case "/gusto/oauth/callback":
      return { id: "gusto-callback" };
    case "/privacy":
      return { id: "privacy" };
    case "/terms":
      return { id: "terms" };
  }

  if (normalized in OPS_PATHS) {
    return { id: "ops", module: OPS_PATHS[normalized] };
  }

  return { id: "ops", module: "command-center" };
}

export function pathForModule(module: SalesOpsModuleId): string {
  for (const [path, m] of Object.entries(OPS_PATHS)) {
    if (m === module) return path;
  }
  return "/sales-ops";
}
