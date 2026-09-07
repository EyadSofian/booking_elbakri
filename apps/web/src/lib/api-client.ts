import type { ApiErrorResponse, PaginatedResponse } from '@elbakri/shared';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:4000';

const ACCESS_TOKEN_KEY = 'elbakri.accessToken';
const REFRESH_TOKEN_KEY = 'elbakri.refreshToken';

/**
 * A failed API call, carrying the server's machine-readable code so the UI can
 * show a localised message instead of raw English from the backend.
 */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Field-level validation messages, keyed by field name. */
  get fieldErrors(): Record<string, string[]> {
    const fields = this.details?.fields;
    if (!Array.isArray(fields)) return {};
    const out: Record<string, string[]> = {};
    for (const f of fields as Array<{ field: string; constraints: string[] }>) {
      out[f.field] = f.constraints;
    }
    return out;
  }
}

export const tokenStore = {
  get access(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(ACCESS_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  get refresh(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(access: string, refresh: string): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
      window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). The session
      // then lasts only as long as the page, which is acceptable.
    }
  },
  clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
      window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  query?: Record<string, unknown>;
  /** Skips the automatic refresh-and-retry. Used by the refresh call itself. */
  skipRefresh?: boolean;
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${API_BASE}/api/v1${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        if (value.length) url.searchParams.set(key, value.join(','));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

/**
 * A single in-flight refresh shared by every request that hits a 401, so a page
 * with several parallel queries does not fire several refreshes and invalidate
 * its own rotating token.
 */
let refreshInFlight: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.refresh;
    if (!refreshToken) return false;
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!response.ok) {
        tokenStore.clear();
        return false;
      }
      const data = (await response.json()) as { accessToken: string; refreshToken: string };
      tokenStore.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, skipRefresh, headers, ...rest } = options;

  const send = async (): Promise<Response> => {
    const token = tokenStore.access;
    return fetch(buildUrl(path, query), {
      ...rest,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(headers as Record<string, string>),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiError('NETWORK', 'Could not reach the server.', 0);
  }

  // An expired access token is refreshed once and the request replayed.
  // Sign-in and refresh are excluded: a rejected sign-in is a wrong password,
  // not an expired token, and trying to refresh there only clears the session
  // and muddies the error the user actually needs to see.
  const isAuthEndpoint = /^\/auth\/(login|refresh)$/.test(path);
  if (response.status === 401 && !skipRefresh && !isAuthEndpoint) {
    const refreshed = await refreshSession();
    if (refreshed) {
      try {
        response = await send();
      } catch {
        throw new ApiError('NETWORK', 'Could not reach the server.', 0);
      }
    } else {
      tokenStore.clear();
      if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
        window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
      }
    }
  }

  if (response.status === 204) return undefined as T;

  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok) {
    let payload: ApiErrorResponse | null = null;
    if (contentType.includes('application/json')) {
      payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    }
    throw new ApiError(
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.message ?? response.statusText,
      response.status,
      payload?.error?.details,
      payload?.error?.requestId ?? response.headers.get('x-request-id') ?? undefined,
    );
  }

  if (!contentType.includes('application/json')) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown>) => apiRequest<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: 'DELETE' }),

  /** Uploads a file with the auth header attached, without forcing a JSON body. */
  upload: async <T>(path: string, file: File, field = 'file'): Promise<T> => {
    const form = new FormData();
    form.append(field, file);
    const token = tokenStore.access;
    const response = await fetch(buildUrl(path), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiError(
        payload?.error?.code ?? 'INTERNAL_ERROR',
        payload?.error?.message ?? response.statusText,
        response.status,
        payload?.error?.details,
      );
    }
    return (await response.json()) as T;
  },

  /** Triggers a file download, preserving the server's filename. */
  download: async (path: string, query?: Record<string, unknown>): Promise<void> => {
    const token = tokenStore.access;
    const response = await fetch(buildUrl(path, query), {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as ApiErrorResponse | null;
      throw new ApiError(
        payload?.error?.code ?? 'INTERNAL_ERROR',
        payload?.error?.message ?? response.statusText,
        response.status,
      );
    }
    const disposition = response.headers.get('content-disposition') ?? '';
    const match = disposition.match(/filename="?([^"]+)"?/);
    const filename = match?.[1] ?? 'export.xlsx';

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  },
};

export type { PaginatedResponse };
