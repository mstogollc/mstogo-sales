export function getEnv(name: string): string | undefined {
  const v = process.env[name];
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length === 0 ? undefined : trimmed;
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
