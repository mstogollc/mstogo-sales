import { describe, expect, it } from "vitest";
import { resolveRoute } from "./router";

describe("resolveRoute", () => {
  it("maps docusign callback path", () => {
    expect(resolveRoute("/docusign/oauth/callback")).toBe("docusign-callback");
  });

  it("maps docusign consent complete path", () => {
    expect(resolveRoute("/docusign/consent-complete")).toBe("docusign-consent-complete");
  });

  it("maps privacy and terms", () => {
    expect(resolveRoute("/privacy")).toBe("privacy");
    expect(resolveRoute("/terms")).toBe("terms");
  });

  it("ignores trailing slashes and case", () => {
    expect(resolveRoute("/Privacy/")).toBe("privacy");
    expect(resolveRoute("/DocuSign/OAuth/Callback")).toBe("docusign-callback");
  });

  it("falls back to app for unknown paths", () => {
    expect(resolveRoute("/")).toBe("app");
    expect(resolveRoute("/anything-else")).toBe("app");
  });
});
