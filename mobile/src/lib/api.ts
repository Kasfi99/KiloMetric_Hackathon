import { getToken, readJson, KEYS } from './storage';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) { super(message); }
}

// Default server: EXPO_PUBLIC_API_URL, editable on the sign-in screen (saved per device).
export const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000';
export const getApiUrl = () => readJson<string>(KEYS.apiUrl, DEFAULT_API_URL);

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, { method = 'GET', body, timeoutMs = 15000, auth = true }: { method?: string; body?: unknown; timeoutMs?: number; auth?: boolean } = {}): Promise<T> {
  const [base, token] = await Promise.all([getApiUrl(), auth ? getToken() : Promise.resolve(null)]);
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    // No Origin header: the server's origin check only applies to browsers. Auth is a bearer token.
    res = await fetch(base.replace(/\/$/, '') + path, { method, signal: ctrl.signal, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e: any) {
    throw new ApiError(0, e?.name === 'AbortError' ? 'The server took too long to respond. Try again.' : `Cannot reach the server at ${base}. Check the server address and Wi-Fi.`);
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (HTTP ${res.status}).`, data);
  return data as T;
}
