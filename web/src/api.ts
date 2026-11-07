// Typed fetch client for the Curevo AI API.
//
// API base resolution:
// - Production (Vercel frontend → Render backend): VITE_API_URL is set at
//   build time (e.g. https://curevo-ai.onrender.com) and every request goes
//   to `${API_BASE}/api/...`.
// - Local development: VITE_API_URL is unset → API_BASE is empty → requests
//   stay same-origin (`/api/...`) and hit the Vite dev proxy.
//
// Cross-origin deployment means cookies must be sent with
// `credentials: 'include'` (harmless same-origin).

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export { resolveApiBase, apiUrl } from './apiBase';
import { apiUrl, resolveApiBase } from './apiBase';

/** Production: VITE_API_URL (e.g. https://curevo-ai.onrender.com). Local dev: '' → same-origin /api. */
export const API_BASE = resolveApiBase(import.meta.env.VITE_API_URL as string | undefined);

let inMemoryCsrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
  if (typeof document !== 'undefined') {
    const match = document.cookie.match(/(?:^|;\s*)ecv_csrf=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export async function fetchCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch(apiUrl('/auth/csrf', API_BASE), {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.csrfToken && typeof data.csrfToken === 'string') {
        setCsrfToken(data.csrfToken);
        return data.csrfToken;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let code = 'ERROR';
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) {
        code = body.error.code || code;
        message = body.error.message || message;
      }
    } catch {
      // non-JSON error — keep defaults
    }
    throw new ApiError(code, message, res.status);
  }
  const data = (await res.json()) as T;
  if (data && typeof data === 'object' && 'csrfToken' in (data as Record<string, unknown>)) {
    const token = (data as { csrfToken?: unknown }).csrfToken;
    if (typeof token === 'string') {
      setCsrfToken(token);
    }
  }
  return data;
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    if (isForm) {
      init.body = body as FormData;
    } else {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }

  const upperMethod = method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(upperMethod)) {
    let token = getCsrfToken();
    if (!token && (path.includes('/auth') || path.includes('/profile'))) {
      token = await fetchCsrfToken();
    }
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
  }

  if (Object.keys(headers).length > 0) {
    init.headers = headers;
  }

  const res = await fetch(apiUrl(path, API_BASE), init);
  return handle<T>(res);
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload: <T>(path: string, form: FormData) => request<T>('POST', path, form, true),
};

/** Download helper: internal API paths go through the configured API base; external URLs pass through. */
export function downloadFile(path: string, filename: string): void {
  const a = document.createElement('a');
  a.href = apiUrl(path, API_BASE);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** POST-based binary download helper: sends JSON payload and triggers browser download of the returned blob. */
export async function downloadPdfBlob(path: string, body: unknown, filename: string): Promise<void> {
  const res = await fetch(apiUrl(path, API_BASE), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Failed to generate PDF (${res.status})`;
    let code = 'PDF_ERROR';
    try {
      const errJson = await res.json();
      if (errJson?.error) {
        code = errJson.error.code || code;
        message = errJson.error.message || message;
      }
    } catch {
      // non-JSON error
    }
    throw new ApiError(code, message, res.status);
  }
  const blob = await res.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}
