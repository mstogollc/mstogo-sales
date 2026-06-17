import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Netlify derives a function name from each top-level file in the functions
// directory and rejects deploys when a name contains anything other than
// alphanumerics, hyphens, or underscores. A stray `*.test.ts` left at the top
// level (instead of under tests/netlify-functions) produces a name like
// "foo.test" — the dot fails Netlify's check and the whole deploy aborts.
const FUNCTIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "netlify", "functions");
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

describe("netlify function names", () => {
  it("only exposes top-level functions with deploy-safe names", () => {
    const offenders = readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name.replace(/\.(ts|js|mjs|cjs)$/, ""))
      .filter((name) => !VALID_NAME.test(name));

    expect(offenders).toEqual([]);
  });
});
