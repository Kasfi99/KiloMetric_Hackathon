import { odometerReady } from '@/components/OdometerPhoto';
import { num } from './format';
import { parseNum, type Draft, useApp } from './app';
import type { CargoSpecs, Explanation, LocationPoint, Preview, RouteCandidate, RoutePlan, TruckSpecs } from './types';

type App = ReturnType<typeof useApp>;
type FieldKey = 'odometer' | 'loadKg';
export const GPS_FRESH_MS = 100000; // server rejects origins older than 120 s
export const LABEL: Record<FieldKey, string> = { odometer: 'Starting odometer', loadKg: 'Cargo weight (kg)' };
const text = (v: number | null | undefined) => (v == null ? '' : String(v));

export function startDraft(app: App, orderId: string | null) {
  const order = app.order(orderId), truck = order ? app.truck(order.truckId) : app.data?.trucks[0] ?? null;
  if (app.draft && app.draft.orderId === orderId) return;
  app.setGps(null); app.setPreview(null);
  app.setDraft({ orderId, truckId: truck?.id ?? null, odometer: text(truck?.odometer), loadKg: text(order?.cargoWeightKg), hazmat: 'none', confirmed: false, destinations: [''] });
}
export const selectTruck = (app: App, d: Draft, truckId: string) => app.setDraft({ ...d, truckId, odometer: text(app.truck(truckId)?.odometer), confirmed: false });

export const minFor = (app: App, d: Draft, key: FieldKey) => (key === 'odometer' ? app.truck(d.truckId)?.odometer ?? 0 : app.order(d.orderId)?.cargoWeightKg ?? 0);
const maxFor = (key: FieldKey) => (key === 'odometer' ? 1e12 : 200000);
export function fieldError(app: App, d: Draft, key: FieldKey) {
  const raw = d[key], v = parseNum(raw), min = minFor(app, d, key), max = maxFor(key);
  if (raw.trim() === '') return 'Required';
  if (v == null) return 'Enter a number';
  if (v < min || v > max) return `Must be ${num(min)}–${num(max)}`;
  return undefined;
}
export const specs = (d: Draft): CargoSpecs => ({ loadKg: parseNum(d.loadKg) as number, hazmat: d.hazmat });
export const master = (app: App, d: Draft): TruckSpecs | null => app.truck(d.truckId)?.specifications ?? null;
// Unknown without the truck master: tare is never guessed.
export const gross = (app: App, d: Draft) => { const m = master(app, d), load = parseNum(d.loadKg); return m && load != null ? m.tareKg + load : null; };
export const overweight = (app: App, d: Draft) => { const m = master(app, d), g = gross(app, d); return !!m && g != null && g > m.maxGrossKg; };
export const gpsFresh = (p: LocationPoint | null) => !!p && Date.now() - p.timestamp < GPS_FRESH_MS;
export const draftStops = (d: Draft) => d.destinations.map(x => x.trim()).filter(Boolean).map(address => ({ address }));

export function problems(app: App, d: Draft | null, gps: LocationPoint | null): string[] {
  if (!d) return ['Choose an order first.'];
  const out: string[] = [];
  if (!app.truck(d.truckId)) out.push('Select an assigned truck.');
  for (const k of ['odometer', 'loadKg'] as const) { const e = fieldError(app, d, k); if (e) out.push(`${LABEL[k]}: ${e.toLowerCase()}.`); }
  if (overweight(app, d)) out.push('Gross weight exceeds the maximum; the server will reject this load.');
  if (!d.orderId && !draftStops(d).length) out.push('Enter a destination.');
  const typed = parseNum(d.odometer), check = d.odometerCheck ?? null;
  if (!check || check.typedKm !== typed) out.push('Take a photo of the odometer.');
  else if (!odometerReady(check, typed, d.odometerNote ?? '')) out.push('Explain why the odometer photo does not confirm the reading.');
  if (!d.confirmed) out.push('Confirm that the truck and cargo are correct.');
  if (!gpsFresh(gps)) out.push('Capture your GPS location.');
  return out;
}
export const isIdentity = (order: number[]) => order.every((v, i) => v === i);
export const validOrder = (order: number[] | null | undefined, n: number): order is number[] => !!order && order.length === n && new Set(order).size === n && order.every(i => Number.isInteger(i) && i >= 0 && i < n);
export const inOrder = <T,>(items: T[], order: number[] | null | undefined) => (validOrder(order, items.length) ? order.map(i => items[i]) : items);
// The final destination is the last stop in visiting order, which a chosen stop order can change.
export const destination = (app: App, d: Draft, order?: number[] | null) => inOrder(app.order(d.orderId)?.stops ?? [], order).at(-1)?.address ?? inOrder(draftStops(d), order).at(-1)?.address ?? '';

// Server keeps at most 5000 plan points; long stitched routes exceed that. Keep the shape with evenly spaced points.
const thin = (line: [number, number][], max = 2000) => line.length <= max ? line : Array.from({ length: max }, (_, i) => line[Math.round((i * (line.length - 1)) / (max - 1))]);
export function routePlan(p: Preview, r: RouteCandidate): RoutePlan {
  const x: Explanation = p.explanation;
  return { routeId: r.id, provider: p.routing.provider, distanceKm: r.distanceKm, durationMin: Math.max(1, r.durationMin), polyline: thin(r.polyline), restrictions: r.restrictions,
    explanation: x.status === 'ok' ? { recommendedRouteId: x.recommendedRouteId, headline: (x.perRoute.find(q => q.routeId === r.id)?.headline || x.summary).slice(0, 200) } : null,
    wasRecommended: r.recommended === true, chosenAt: new Date().toISOString(), cost: r.cost, roadCondition: r.roadCondition,
    stops: p.stops.filter(st => st.latitude != null && st.longitude != null).slice(0, 11).map(st => ({ address: st.address, latitude: st.latitude!, longitude: st.longitude! })), stopOrder: p.stopOrder?.applied ?? null };
}
