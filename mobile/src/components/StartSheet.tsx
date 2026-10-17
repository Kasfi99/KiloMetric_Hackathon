import { router } from 'expo-router';
import { useState } from 'react';
import { Banner, Button, Check, H2, KV, P, Sheet } from './ui';
import { useApp } from '@/lib/app';
import { destination, gpsFresh, gross, master, routePlan, specs } from '@/lib/draft';
import { duration, num } from '@/lib/format';
import { getFreshPoint } from '@/lib/tracking';
import type { RouteCandidate } from '@/lib/types';
import { api } from '@/lib/api';

// Two-step start: the sheet repeats the key facts and requires external dispatcher approval.
export function StartSheet({ visible, onClose, route }: { visible: boolean; onClose: () => void; route: RouteCandidate | null }) {
  const app = useApp(), d = app.draft, p = app.preview;
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reset on close so the next opening always starts unapproved.
  const close = () => { setApproved(false); setError(null); onClose(); };
  if (!d) return null;
  const t = app.truck(d.truckId), m = master(app, d), approx = !!route && !!p?.stops.some(st => st.geocodePrecision === 'approximate');
  const start = async () => {
    setBusy(true); setError(null);
    try {
      const origin = gpsFresh(app.gps) ? app.gps! : await getFreshPoint();
      const plan = route && p ? routePlan(p, route) : undefined;
      const res = await api<{ tripId: string }>('/api/trips', { method: 'POST', body: { truckId: d.truckId, ...(d.orderId ? { orderId: d.orderId } : {}), destination: destination(app, d, plan?.stopOrder), startOdometer: Number(d.odometer.replace(',', '.')), specs: specs(d), specsConfirmed: true, externalRouteConfirmed: true, origin, ...(plan ? { routePlan: plan } : {}), ...(d.odometerCheck ? { odometerCheckId: d.odometerCheck.checkId, odometerNote: d.odometerNote ?? '' } : {}) } });
      app.setDraft(null); app.setPreview(null); app.setGps(null);
      await app.refresh();
      await app.beginTracking(res.tripId);
      close();
      router.dismissAll();
      router.navigate('/trip');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={close}>
      <H2>Start this trip?</H2>
      <P small>Review your departure details.</P>
      <KV k="Truck" v={t?.plate ?? '—'} />
      <KV k="Destination" v={destination(app, d, route ? p?.stopOrder?.applied : null)} />
      <KV k="Starting odometer" v={`${num(Number(d.odometer.replace(',', '.')), 0)} km`} />
      <KV k="Cargo weight" v={`${num(Number(d.loadKg.replace(',', '.')), 0)} kg`} />
      <KV k="Gross / maximum weight" v={m ? `${num(gross(app, d), 0)} / ${num(m.maxGrossKg, 0)} kg` : '—'} />
      <KV k="Route" v={route ? `${num(route.distanceKm)} km · ${duration(route.durationMin)}` : 'No planned route'} />
      <KV k="Provider" v={route ? (p?.routing.provider === 'fixture' ? 'sample routes' : 'OpenRouteService') : '—'} />
      {approx && <Banner tone="warning">Some destinations are only approximate.</Banner>}
      {!m && <Banner tone="warning">Truck specifications are not set, so height, width, length and weight limits are not checked.</Banner>}
      <Check checked={approved} onChange={setApproved}>This route has been approved by the dispatcher (external planning).</Check>
      {error && <Banner tone="error">{error}</Banner>}
      <Button title="Yes, start trip" disabled={!approved} loading={busy} onPress={start} />
      <Button title="Back" kind="flat" onPress={close} />
    </Sheet>
  );
}
