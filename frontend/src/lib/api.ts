import type { UserOut } from "@/types/api";

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;
let onTokenRefreshed: ((token: string, user: UserOut) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function bindAuthHandlers(handlers: {
  onSessionExpired: () => void;
  onTokenRefreshed: (token: string, user: UserOut) => void;
}) {
  onSessionExpired = handlers.onSessionExpired;
  onTokenRefreshed = handlers.onTokenRefreshed;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= (async () => {
    try {
      const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" });
      if (!res.ok) return false;
      const data = (await res.json()) as { access_token: string; user: UserOut };
      accessToken = data.access_token;
      onTokenRefreshed?.(data.access_token, data.user);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

async function parseError(res: Response): Promise<ApiError> {
  try {
    const data = await res.json();
    if (data?.error?.code) return new ApiError(data.error.code, data.error.message, res.status);
  } catch {
    /* cuerpo no-JSON */
  }
  return new ApiError("HTTP_ERROR", `Error ${res.status}`, res.status);
}

async function request<T>(path: string, options: RequestInit = {}, isRetry = false): Promise<T> {
  const headers = new Headers(options.headers);
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (options.body && typeof options.body === "string") headers.set("Content-Type", "application/json");

  const res = await fetch(`/api/v1${path}`, { ...options, headers, credentials: "include" });

  if (res.status === 401 && !path.startsWith("/auth/") && !isRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, true);
    onSessionExpired?.();
    throw await parseError(res);
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function query(params?: Record<string, unknown>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}

export const api = {
  get: <T>(path: string, params?: Record<string, unknown>) => request<T>(`${path}${query(params)}`),
  post: <T>(path: string, body?: unknown, params?: Record<string, unknown>) =>
    request<T>(`${path}${query(params)}`, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<T>(path, { method: "POST", body: form });
  },
  /** Descarga autenticada (CSV): dispara el guardado en el navegador. */
  download: async (path: string, filename: string) => {
    const headers = new Headers();
    if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
    const res = await fetch(`/api/v1${path}`, { headers, credentials: "include" });
    if (!res.ok) throw await parseError(res);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  },
};
