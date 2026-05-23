export type JsonBody = Record<string, unknown> | Array<unknown>;

const baseHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

export function json(status: number, body: JsonBody) {
  return new Response(JSON.stringify(body), { status, headers: baseHeaders });
}

export function ok(body: JsonBody) {
  return json(200, body);
}

export function badRequest(message: string, extra?: Record<string, unknown>) {
  return json(400, { error: message, ...extra });
}

export function serverError(message: string, extra?: Record<string, unknown>) {
  return json(500, { error: message, ...extra });
}

export function methodNotAllowed(allowed: string[]) {
  return new Response(JSON.stringify({ error: "method_not_allowed" }), {
    status: 405,
    headers: { ...baseHeaders, allow: allowed.join(", ") },
  });
}

export async function readJson<T = unknown>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("invalid_json_body");
  }
}
