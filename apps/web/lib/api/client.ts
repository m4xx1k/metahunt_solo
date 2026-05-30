// Shared backend boundary. Every lib/api fetcher goes through these:
// one place resolves the base URL, builds the query string, and turns a
// non-2xx response into a thrown error. Resource files only declare their
// wire types + endpoint paths. (Taxonomy mutations keep their own typed
// error path — see TaxonomyApiError.)

export function apiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Add it to apps/web/.env.local (e.g. http://localhost:3000).",
    );
  }
  return base.replace(/\/+$/, "");
}

// Skips undefined/null/"" and non-primitive values; repeats array values
// as multiple params (?skills=a&skills=b). Returns "" or "?<qs>".
export function buildQs(params?: object): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) sp.append(k, String(item));
      continue;
    }
    if (
      typeof v !== "string" &&
      typeof v !== "number" &&
      typeof v !== "boolean"
    ) {
      continue;
    }
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, init ?? { cache: "no-store" });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`api ${res.status} ${path}: ${body}`);
  }
  return (await res.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`api ${res.status} ${path}: ${text}`);
  }
  return (await res.json()) as T;
}
