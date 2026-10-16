import { odometerReady } from '@/components/OdometerPhoto';
import { num } from './format';
import { parseNum, SPEC_KEYS, type Draft, type SpecKey, useApp } from './app';
import type { Explanation, LocationPoint, Preview, RouteCandidate, RoutePlan, Truck, TruckSpecs } from './types';

type App = ReturnType<typeof useApp>;
export const GPS_FRESH_MS = 100000; // server rejects origins older than 120 s
export const LABEL: Record<SpecKey | 'odometer', string> = { odometer: 'Starting odometer', heightM: 'Height (m)', widthM: 'Width (m)', lengthM: 'Length (m)', axles: 'Number of axles', tareKg: 'Tare weight (kg)', maxGrossKg: 'Maximum weight (kg)', loadKg: 'Cargo weight (kg)' };
const RANGE: Record<SpecKey, [number, number]> = { heightM: [0.5, 10], widthM: [0.5, 10], lengthM: [1, 50], axles: [2, 20], tareKg: [500, 200000], maxGrossKg: [500, 250000], loadKg: [0, 200000] };
const text = (v: number | null | undefined) => (v == null ? '' : String(v));

function specsText(truck: Truck | null, loadKg: number | null): Draft['specs'] {
  const s = truck?.specifications;
  return { heightM: text(s?.heightM), widthM: text(s?.widthM), lengthM: text(s?.lengthM), axles: text(s?.axles), tareKg: text(s?.tareKg), maxGrossKg: text(s?.maxGrossKg), loadKg: text(loadKg) };
}
export function startDraft(app: App, orderId: string | null) {
  const order = app.order(orderId), truck = order ? app.truck(order.truckId) : app.data?.trucks[0] ?? null;
  if (app.draft && app.draft.orderId === orderId) return;
  app.setGps(null); app.setPreview(null);
  app.setDraft({ orderId, truckId: truck?.id ?? null, odometer: text(truck?.odometer), specs: specsText(truck, order?.cargoWeightKg ?? null), hazmat: truck?.specifications?.hazmat ?? 'none', confirmed: false, destinations: [''] });
}
export function selectTruck(app: App, d: Draft, truckId: string) {
  const t = app.truck(truckId);
  app.setDraft({ ...d, truckId, odometer: text(t?.odometer), specs: { ...specsText(t, null), loadKg: d.specs.loadKg }, hazmat: t?.specifications?.hazmat ?? d.hazmat });
}

export const minFor = (app: App, d: Draft, key: SpecKey | 'odometer') => key === 'odometer' ? app.truck(d.truckId)?.odometer ?? 0 : key === 'loadKg' ? app.order(d.orderId)?.cargoWeightKg ?? 0 : RANGE[key][0];
export const maxFor = (key: SpecKey | 'odometer') => (key === 'odometer' ? 1e12 : RANGE[key][1]);
export function fieldError(app: App, d: Draft, key: SpecKey | 'odometer') {
  const raw = key === 'odometer' ? d.odometer : d.specs[key], v = parseNum(raw), min = minFor(app, d, key), max = maxFor(key);
  if (raw.trim() === '') return 'Required';
  if (v == null) return 'Enter a number';
  if (v < min || v > max) return `Must be ${num(min)}–${num(max)}`;
  if (key === 'axles' && !Number.isInteger(v)) return 'Whole number';
  return undefined;
}
export function specs(d: Draft): TruckSpecs {
  const n = (k: SpecKey) => parseNum(d.specs[k]) as number;
  return { heightM: n('heightM'), widthM: n('widthM'), lengthM: n('lengthM'), axles: n('axles'), tareKg: n('tareKg'), maxGrossKg: n('maxGrossKg'), loadKg: n('loadKg'), hazmat: d.hazmat };
}
export const gross = (d: Draft) => (parseNum(d.specs.tareKg) ?? 0) + (parseNum(d.specs.loadKg) ?? 0);
export const gpsFresh = (p: LocationPoint | null) => !!p && Date.now() - p.timestamp < GPS_FRESH_MS;
export const draftStops = (d: Draft) => d.destinations.map(x => x.trim()).filter(Boolean).map(address => ({ address }));

export function problems(app: App, d: Draft | null, gps: LocationPoint | null): string[] {
  if (!d) return ['Choose an order first.'];
  const out: string[] = [];
  if (!app.truck(d.truckId)) out.push('Select an assigned truck.');
  for (const k of ['odometer', ...SPEC_KEYS] as const) { const e = fieldError(app, d, k); if (e) out.push(`${LABEL[k]}: ${e.toLowerCase()}.`); }
  const max = parseNum(d.specs.maxGrossKg);
  if (max != null && gross(d) > max) out.push('Gross weight exceeds the maximum; the server will reject this load.');
  if (!d.orderId && !draftStops(d).length) out.push('Enter a destination.');
  const typed = parseNum(d.odometer), check = d.odometerCheck ?? null;
  if (!check || check.typedKm !== typed) out.push('Take a photo of the odometer.');
  else if (!odometerReady(check, typed, d.odometerNote ?? '')) out.push('Explain why the odometer photo does not confirm the reading.');
  if (!d.confirmed) out.push('Confirm your declaration.');
  if (!gpsFresh(gps)) out.push('Capture your GPS location.');
  return out;
}
export const destination = (app: App, d: Draft) => app.order(d.orderId)?.stops.at(-1)?.address ?? draftStops(d).at(-1)?.address ?? '';

// Server keeps at most 5000 plan points; long stitched routes exceed that. Keep the shape with evenly spaced points.
const thin = (line: [number, number][], max = 2000) => line.length <= max ? line : Array.from({ length: max }, (_, i) => line[Math.round((i * (line.length - 1)) / (max - 1))]);
export function routePlan(p: Preview, r: RouteCandidate): RoutePlan {
  const x: Explanation = p.explanation;
  return { routeId: r.id, provider: p.routing.provider, distanceKm: r.distanceKm, durationMin: Math.max(1, r.durationMin), polyline: thin(r.polyline), restrictions: r.restrictions,
    explanation: x.status === 'ok' ? { recommendedRouteId: x.recommendedRouteId, headline: (x.perRoute.find(q => q.routeId === r.id)?.headline || x.summary).slice(0, 200) } : null,
    wasRecommended: r.recommended === true, chosenAt: new Date().toISOString(), cost: r.cost, roadCondition: r.roadCondition };
}
