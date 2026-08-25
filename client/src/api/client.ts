// Thin fetch wrapper: same-origin in production (server serves the built
// client), proxied to the API server in dev via vite.config.ts.
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// import.meta.env.BASE_URL is Vite's own reflection of the `base` config
// value (see vite.config.ts) - "/" by default (standalone dev/prod), or
// "/hub/" when built for the unified RDC Dashboard. Deriving the API
// prefix from it keeps this file working unmodified in both setups.
// Exported so pages that need a raw URL rather than going through
// api.get/post/etc. (e.g. an <a href> to a file download) can still land
// under the right prefix — a hardcoded "/api/..." works standalone but
// 404s under RDC Nexus's "/hub/" mount, since it resolves against the
// Nexus root instead. See RequestDetail.tsx's attachment links.
export const API_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    credentials: "include",
    headers:
      options.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json", ...options.headers }
        : options.headers,
    ...options,
  });

  if (!res.ok) {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
      if (body?.code) code = body.code;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
