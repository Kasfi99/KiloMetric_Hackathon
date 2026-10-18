import { getToken } from './storage';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: any = {}) { super(message); }
}

// Fixed server: the public demo deployment. EXPO_PUBLIC_API_URL (inlined at bundle time) points a dev build at a laptop server.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'https://kilometric-799771602971.asia-southeast1.run.app').replace(/\/$/, '');

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export async function api<T = any>(path: string, { method = 'GET', body, timeoutMs = 15000, auth = true }: { method?: string; body?: unknown; timeoutMs?: number; auth?: boolean } = {}): Promise<T> {
  const base = API_URL, token = auth ? await getToken() : null;
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    // No Origin header: the server's origin check only applies to browsers. Auth is a bearer token.
    res = await fetch(base + path, { method, signal: ctrl.signal, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (e: any) {
    throw new ApiError(0, e?.name === 'AbortError' ? 'The server took too long to respond. Try again.' : `Cannot reach the server at ${base}. Check the internet connection.`);
  } finally { clearTimeout(timer); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) onUnauthorized();
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (HTTP ${res.status}).`, data);
  return data as T;
}
