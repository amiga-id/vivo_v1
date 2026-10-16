export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ??
  (import.meta.env.DEV ? 'http://127.0.0.1:8000/api/v1' : '/api/v1')
).replace(/\/+$/, '');
const TOKEN_KEY = 'amiga_access_token';

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getAccessToken(): string | null {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (
    init.body !== undefined &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi dan server backend.', 0);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('Server mengirim respons yang tidak valid.', response.status);
  }

  const body = payload as {
    success?: boolean;
    error?: string | { message?: string };
    detail?: string | { message?: string };
  };
  if (!response.ok || body.success === false) {
    if (response.status === 401) {
      clearAccessToken();
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('amiga:unauthorized'));
    }
    const detail = body.error ?? body.detail;
    const message = typeof detail === 'string' ? detail : detail?.message;
    throw new ApiError(message || `Permintaan gagal (${response.status}).`, response.status);
  }

  return payload as T;
}
