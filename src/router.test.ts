import { describe, expect, it } from "vitest";
import { pathForModule, resolveRoute } from "./router";

describe("resolveRoute", () => {
  it("maps docusign callback path", () => {
    expect(resolveRoute("/docusign/oauth/callback").id).toBe("docusign-callback");
  });

  it("maps docusign consent complete path", () => {
    expect(resolveRoute("/docusign/consent-complete").id).toBe("docusign-consent-complete");
  });

  it("maps gusto callback path", () => {
    expect(resolveRoute("/gusto/oauth/callback").id).toBe("gusto-callback");
    expect(resolveRoute("/Gusto/OAuth/Callback/").id).toBe("gusto-callback");
  });

  it("maps privacy and terms", () => {
    expect(resolveRoute("/privacy").id).toBe("privacy");
    expect(resolveRoute("/terms").id).toBe("terms");
  });

  it("ignores trailing slashes and case", () => {
    expect(resolveRoute("/Privacy/").id).toBe("privacy");
    expect(resolveRoute("/DocuSign/OAuth/Callback").id).toBe("docusign-callback");
  });

  it("routes ops sub-paths to the matching module", () => {
    expect(resolveRoute("/sales-ops")).toEqual({ id: "ops", module: "command-center" });
    expect(resolveRoute("/sales-ops/leads")).toEqual({ id: "ops", module: "leads" });
    expect(resolveRoute("/sales-ops/intel")).toEqual({ id: "ops", module: "intel" });
    expect(resolveRoute("/sales-ops/heat-map")).toEqual({ id: "ops", module: "heatmap" });
    expect(resolveRoute("/sales-ops/proposals")).toEqual({ id: "ops", module: "proposal" });
    expect(resolveRoute("/sales-ops/outreach")).toEqual({ id: "ops", module: "outreach" });
    expect(resolveRoute("/sales-ops/calendar")).toEqual({ id: "ops", module: "calendar" });
    expect(resolveRoute("/sales-ops/pipeline")).toEqual({ id: "ops", module: "pipeline" });
    expect(resolveRoute("/sales-ops/payouts")).toEqual({ id: "ops", module: "payouts" });
    expect(resolveRoute("/sales-ops/training")).toEqual({ id: "ops", module: "training" });
    expect(resolveRoute("/sales-ops/integrations")).toEqual({ id: "ops", module: "integrations" });
  });

  it("falls back to the command center for unknown paths", () => {
    expect(resolveRoute("/")).toEqual({ id: "ops", module: "command-center" });
    expect(resolveRoute("/anything-else")).toEqual({ id: "ops", module: "command-center" });
  });

  it("pathForModule round-trips every nav entry", () => {
    expect(pathForModule("command-center")).toBe("/sales-ops");
    expect(pathForModule("leads")).toBe("/sales-ops/leads");
    expect(pathForModule("integrations")).toBe("/sales-ops/integrations");
  });
});
