export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

// Returns the first set value among several env var names. Lets server-side
// code accept either the canonical name or a known alias (e.g. a VITE_*
// variable that an operator set on the wrong side of the build) without ever
// exposing which name was used.
export function getEnvAny(...names: string[]): string | undefined {
  for (const name of names) {
    const v = getEnv(name);
    if (v) return v;
  }
  return undefined;
}

export function requireEnv(name: string): string {
  const v = getEnv(name);
  if (!v) {
    const err = new Error(`missing_env:${name}`);
    (err as Error & { code?: string }).code = "missing_env";
    throw err;
  }
  return v;
}
