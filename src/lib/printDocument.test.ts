import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { printingClass, printOnly } from "./printDocument";

describe("print document tokens", () => {
  it("derives the body isolation class the print stylesheet keys off", () => {
    expect(printingClass("notes")).toBe("printing-notes");
    expect(printingClass("playbook")).toBe("printing-playbook");
  });

  it("matches the body.printing-* selectors in the print stylesheet", () => {
    const css = readFileSync(
      fileURLToPath(new URL("../styles.css", import.meta.url)),
      "utf8",
    );
    expect(css).toContain(`body.${printingClass("notes")}`);
    expect(css).toContain(`body.${printingClass("playbook")}`);
  });
});

describe("printOnly", () => {
  const realDocument = globalThis.document;
  const realWindow = globalThis.window;

  afterEach(() => {
    (globalThis as { document?: unknown }).document = realDocument;
    (globalThis as { window?: unknown }).window = realWindow;
    vi.restoreAllMocks();
  });

  function fakeEnv() {
    const classes = new Set<string>();
    const listeners: Record<string, Array<() => void>> = {};
    const doc = {
      body: {
        classList: {
          add: (c: string) => classes.add(c),
          remove: (c: string) => classes.delete(c),
        },
      },
    };
    const win = {
      print: vi.fn(),
      addEventListener: (evt: string, cb: () => void) => {
        (listeners[evt] ||= []).push(cb);
      },
      removeEventListener: (evt: string, cb: () => void) => {
        listeners[evt] = (listeners[evt] || []).filter((l) => l !== cb);
      },
    };
    (globalThis as { document?: unknown }).document = doc;
    (globalThis as { window?: unknown }).window = win;
    const fireAfterPrint = () => (listeners.afterprint || []).slice().forEach((cb) => cb());
    return { classes, win, fireAfterPrint };
  }

  it("tags the body with the target class, prints, then clears on afterprint", () => {
    const { classes, win, fireAfterPrint } = fakeEnv();
    printOnly("notes");
    expect(classes.has("printing-notes")).toBe(true);
    expect(win.print).toHaveBeenCalledTimes(1);
    fireAfterPrint();
    expect(classes.has("printing-notes")).toBe(false);
  });

  it("prints the whole page when no target is given", () => {
    const { classes, win } = fakeEnv();
    printOnly();
    expect(win.print).toHaveBeenCalledTimes(1);
    expect(classes.size).toBe(0);
  });
});

describe("assistant print button wiring", () => {
  const hubSrc = readFileSync(
    fileURLToPath(new URL("../components/TrainingHub.tsx", import.meta.url)),
    "utf8",
  );

  it("renders a sales-facing print button for the assistant notes", () => {
    expect(hubSrc).toContain("Print notes");
    expect(hubSrc).toContain('printOnly("notes")');
  });

  it("wraps the printable notes in the isolated print-doc-notes container", () => {
    expect(hubSrc).toContain("print-document print-doc-notes");
  });

  it("keeps the print controls out of the printed output", () => {
    expect(hubSrc).toMatch(/ops-page-head no-print[\s\S]*Print notes/);
  });
});
