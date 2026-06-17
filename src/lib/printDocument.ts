/**
 * Print a single document on a page that may hold several printable documents.
 * We tag <body> with the target's class so the print stylesheet can hide the
 * other documents, then clear the tag once printing finishes.
 *
 * Pages with one printable document can call this without a target.
 */
export type PrintTarget = "playbook" | "notes";

/** Body class the print stylesheet keys off to isolate one document. */
export function printingClass(target: PrintTarget): string {
  return `printing-${target}`;
}

export function printOnly(target?: PrintTarget): void {
  if (typeof document === "undefined" || typeof window === "undefined") return;
  if (!target) {
    window.print();
    return;
  }
  const cls = printingClass(target);
  document.body.classList.add(cls);
  const clear = () => {
    document.body.classList.remove(cls);
    window.removeEventListener("afterprint", clear);
  };
  window.addEventListener("afterprint", clear);
  window.print();
}
