import NetInfo from '@react-native-community/netinfo';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState as RNAppState } from 'react-native';
import { api, ApiError, API_URL, setUnauthorizedHandler } from './api';
import { clearQueue, flush, onPendingChange, readQueue } from './queue';
import { KEYS, clearToken, getToken, readJson, remove, setToken, writeJson } from './storage';
import { startTracking, stopTracking, type TrackingMode } from './tracking';
import type { AppState, Hazmat, LocationPoint, Order, Preview, Trip, Truck, User } from './types';
import type { OdometerCheck } from '@/components/OdometerPhoto';

// Text fields keep what the driver typed (e.g. "3," mid-entry); values are parsed only when validated or sent.
// Truck dimensions and weights are master data, so the draft holds only what the driver declares per trip.
export type Draft = { orderId: string | null; truckId: string | null; odometer: string; loadKg: string; hazmat: Hazmat; confirmed: boolean; destinations: string[]; odometerCheck?: OdometerCheck | null; odometerNote?: string };
export const parseNum = (s: string) => { const t = s.trim().replace(',', '.'); return t === '' || !Number.isFinite(Number(t)) ? null : Number(t); };
// Drafts saved by older versions kept cargo weight in specs.loadKg and were confirmed against typed dimensions.
function migrateDraft(saved: (Partial<Draft> & { specs?: { loadKg?: unknown } }) | null): Draft | null {
  if (!saved || typeof saved !== 'object') return null;
  if (typeof saved.loadKg === 'string') return saved as Draft;
  const { specs, ...rest } = saved, old = specs?.loadKg;
  return { ...rest, loadKg: typeof old === 'string' ? old : '', confirmed: false } as Draft;
}

type Ctx = {
  status: 'loading' | 'signedOut' | 'signedIn'; user: User | null; apiUrl: string; data: AppState | null; loadError: string | null; online: boolean; pending: number;
  tracking: TrackingMode; gps: LocationPoint | null; setGps: (p: LocationPoint | null) => void;
  draft: Draft | null; setDraft: (d: Draft | null) => void; patchDraft: (p: Partial<Draft>) => void; preview: Preview | null; setPreview: (p: Preview | null) => void;
  refresh: () => Promise<void>; signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>;
  beginTracking: (tripId: string) => Promise<void>; endTracking: () => Promise<void>;
  activeTrip: Trip | null; truck: (id?: string | null) => Truck | null; order: (id?: string | null) => Order | null; cpk: (truckId?: string | null) => number | null;
};
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error('useApp outside AppProvider'); return c; };

export function AppProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Ctx['status']>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [data, setData] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [tracking, setTracking] = useState<TrackingMode>('off');
  const [gps, setGps] = useState<LocationPoint | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const trackingFor = useRef<string | null>(null);

  const draftRef = useRef<Draft | null>(null);
  const setDraft = useCallback((d: Draft | null) => { draftRef.current = d; setDraftState(d); if (d) writeJson(KEYS.draft, d); else remove(KEYS.draft); }, []);
  // For async results (photo checks): merges into the latest draft, not the one captured when the request started.
  const patchDraft = useCallback((p: Partial<Draft>) => { if (draftRef.current) setDraft({ ...draftRef.current, ...p }); }, [setDraft]);
  const endTracking = useCallback(async () => { trackingFor.current = null; await stopTracking(); setTracking('off'); }, []);
  const signedOut = useCallback(async () => { await endTracking(); await clearToken(); setUser(null); setData(null); setPreview(null); setStatus('signedOut'); }, [endTracking]);

  const refresh = useCallback(async () => {
    try { setData(await api<AppState>('/api/state')); setLoadError(null); }
    catch (e) { if (!(e instanceof ApiError && e.status === 401)) setLoadError((e as Error).message); }
  }, []);

  const beginTracking = useCallback(async (tripId: string) => {
    if (trackingFor.current === tripId) return;
    trackingFor.current = tripId;
    setTracking(await startTracking(tripId));
  }, []);

  // Resume tracking for an active trip after app restart, sign-in or refresh.
  const activeTrip = data?.trips.find(t => t.status === 'active') ?? null, activeTripId = activeTrip?.id ?? null;
  useEffect(() => { if (status === 'signedIn' && activeTripId) beginTracking(activeTripId); }, [status, activeTripId, beginTracking]);

  useEffect(() => {
    setUnauthorizedHandler(() => { signedOut(); });
    const offPending = onPendingChange(setPending);
    const offNet = NetInfo.addEventListener(s => { const up = s.isConnected !== false && s.isInternetReachable !== false; setOnline(up); if (up) flush(); });
    const offApp = RNAppState.addEventListener('change', s => { if (s === 'active') flush(); });
    (async () => {
      const saved = migrateDraft(await readJson<Draft | null>(KEYS.draft, null));
      draftRef.current = saved; setDraftState(saved);
      setPending((await readQueue()).points.length);
      if (!(await getToken())) { setStatus('signedOut'); return; }
      try {
        const s = await api<{ user: User | null }>('/api/session');
        if (!s.user) { await signedOut(); return; }
        setUser(s.user); setStatus('signedIn'); await refresh();
      } catch (e) { setLoadError((e as Error).message); setStatus('signedIn'); }
    })();
    return () => { offPending(); offNet(); offApp.remove(); };
  }, [refresh, signedOut]);

  const signIn = useCallback(async (email: string, password: string) => {
    const r = await api<{ user: User; token: string }>('/api/login', { method: 'POST', body: { email, password, client: 'mobile' }, auth: false });
    await setToken(r.token); setUser(r.user); setStatus('signedIn');
    if (r.user.role === 'driver') await refresh();
  }, [refresh]);

  const signOut = useCallback(async () => { try { await api('/api/logout', { method: 'POST', body: {} }); } catch {} setDraft(null); await clearQueue(); await signedOut(); }, [setDraft, signedOut]);

  const value = useMemo<Ctx>(() => ({
    status, user, apiUrl: API_URL, data, loadError, online, pending, tracking, gps, setGps, draft, setDraft, patchDraft, preview, setPreview, refresh, signIn, signOut, beginTracking, endTracking, activeTrip,
    truck: id => data?.trucks.find(t => t.id === id) ?? null,
    order: id => data?.orders.find(o => o.id === id) ?? null,
    cpk: id => data?.analytics.trucks.find(t => t.id === id)?.cpk ?? null,
  }), [status, user, data, loadError, online, pending, tracking, gps, draft, setDraft, patchDraft, preview, refresh, signIn, signOut, beginTracking, endTracking, activeTrip]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
