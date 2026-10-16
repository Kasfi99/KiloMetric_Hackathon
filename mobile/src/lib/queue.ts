import { api, ApiError } from './api';
import { KEYS, readJson, writeJson } from './storage';
import type { LocationPoint } from './types';

// Offline GPS queue in AsyncStorage. Foreground watcher and background task both write here; flush sends batches ≤ 50.
type Queue = { tripId: string | null; points: LocationPoint[] };
const MAX_POINTS = 2000, BATCH = 50, EVERY_MS = 10000, EVERY_M = 25;
let chain: Promise<unknown> = Promise.resolve();
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };
const listeners = new Set<(pending: number) => void>();
export const onPendingChange = (fn: (pending: number) => void) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = (n: number) => listeners.forEach(fn => fn(n));

export const readQueue = () => readJson<Queue>(KEYS.queue, { tripId: null, points: [] });

function metres(a: LocationPoint, b: LocationPoint) {
  const r = (x: number) => (x * Math.PI) / 180, dLat = r(b.latitude - a.latitude), dLon = r(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Sparse points keep GPS jitter from looking like impossible speed (server rejects > 160 km/h between points).
export const pushPoint = (tripId: string, p: LocationPoint) => serial(async () => {
  await writeJson(KEYS.lastFix, p);
  if (p.accuracy > 100) return;
  const q = await readQueue();
  if (q.tripId !== tripId) { q.tripId = tripId; q.points = []; }
  const last = q.points.at(-1) ?? (await readJson<LocationPoint | null>(`${KEYS.lastFix}:queued:${tripId}`, null));
  if (last && (p.timestamp <= last.timestamp || (p.timestamp - last.timestamp < EVERY_MS && metres(last, p) < EVERY_M))) return;
  q.points.push(p);
  if (q.points.length > MAX_POINTS) q.points = q.points.slice(-MAX_POINTS);
  await writeJson(KEYS.queue, q);
  await writeJson(`${KEYS.lastFix}:queued:${tripId}`, p);
  notify(q.points.length);
});

let flushing = false;
export async function flush(deadlineMs?: number) {
  if (flushing) return;
  flushing = true;
  const until = deadlineMs ? Date.now() + deadlineMs : Infinity;
  try {
    while (Date.now() < until) {
      const q = await readQueue();
      if (!q.tripId || !q.points.length) break;
      const batch = q.points.slice(0, BATCH);
      try { await api(`/api/trips/${encodeURIComponent(q.tripId)}/locations`, { method: 'POST', body: { points: batch } }); }
      catch (e) { if (!(e instanceof ApiError && e.status === 400)) break; console.warn('GPS batch rejected and dropped:', e.message); }
      await serial(async () => {
        const now = await readQueue(), sent = new Set(batch.map(b => b.timestamp));
        now.points = now.points.filter(p => !sent.has(p.timestamp));
        await writeJson(KEYS.queue, now);
        notify(now.points.length);
      });
    }
  } finally { flushing = false; }
}
export const clearQueue = () => serial(async () => { await writeJson(KEYS.queue, { tripId: null, points: [] }); notify(0); });
