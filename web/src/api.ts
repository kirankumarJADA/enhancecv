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
  return res.json() as Promise<T>;
}

async function request<T>(method: string, path: string, body?: unknown, isForm = false): Promise<T> {
  const init: RequestInit = { method, credentials: 'include' };
  if (body !== undefined) {
    if (isForm) {
      init.body = body as FormData;
    } else {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
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
