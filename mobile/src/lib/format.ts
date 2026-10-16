// Unknown stays unknown: null renders as an em dash, never 0.
export const num = (n: number | null | undefined, digits = 1) => (n == null || !Number.isFinite(n) ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: digits }).format(n));
export const rp = (n: number | null | undefined) => (n == null ? '—' : `Rp${num(n, 0)}`);
export const duration = (min: number | null | undefined) => (min == null ? '—' : min < 60 ? `${Math.round(min)} min` : `${Math.floor(min / 60)} h ${Math.round(min % 60)} min`);
export const minutesSince = (iso: string) => Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
export function day(s?: string) {
  if (!s) return 'Date not set';
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
export const dayTime = (s?: string) => (s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
export const RESTRICTION: Record<string, string> = { height: 'Height', width: 'Width', length: 'Length', weight: 'Gross weight', axleload: 'Axle load', hazmat: 'Hazardous goods', bridge_limits: 'Bridge limits', truck_bans: 'Truck bans', time_restrictions: 'Time restrictions' };
export const HAZMAT = [['none', 'None'], ['flammable', 'Flammable'], ['explosive', 'Explosive'], ['other', 'Other']] as const;
export const TOLL_SOURCE: Record<string, string> = { admin_estimate: 'admin estimate', google_driving_estimate: 'Google driving estimate', unknown: 'unknown' };
