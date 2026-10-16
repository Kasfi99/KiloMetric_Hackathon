// Demo helper: moves the Android emulator's GPS along the active trip's planned route.
// Usage: npm run demo:drive -- [steps|all] [stepM=250] [intervalS=10]
// 250 m every 10 s is about 90 km/h; the server rejects jumps above 160 km/h.
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const [stepsArg = '30', stepArg = '250', intervalArg = '10'] = process.argv.slice(2);
const stepM = Number(stepArg), intervalS = Number(intervalArg), all = stepsArg === 'all', steps = all ? Infinity : Number(stepsArg);
if (!(stepM > 0) || !(intervalS > 0) || !(steps > 0)) throw new Error('Usage: npm run demo:drive -- [steps|all] [stepM] [intervalS]');
if (stepM / intervalS * 3.6 > 150) throw new Error('Too fast: the server rejects GPS jumps above 160 km/h.');

const base = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const adb = process.env.ADB || path.join(process.env.ANDROID_HOME || path.join(process.env.HOME, 'Library/Android/sdk'), 'platform-tools/adb');
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const email = process.env.DRIVER_EMAIL || 'driver@demo.id', password = process.env.DRIVER_PASSWORD || 'demo1234';

const login = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, client: 'mobile' }) });
if (!login.ok) throw new Error(`Login failed (${login.status}). Is the server running at ${base}?`);
const { token } = await login.json();
const get = p => fetch(base + p, { headers: { authorization: `Bearer ${token}` } }).then(r => r.json());
const active = (await get('/api/state')).trips.find(t => t.status === 'active');
if (!active) throw new Error('No active trip. Start a trip in the app first.');
const { trip } = await get(`/api/trips/${active.id}`);
const line = trip.routing?.plan?.polyline;
if (!line?.length) throw new Error('This trip has no planned route (started with "Skip routes").');

// Resume from the point on the route nearest to the last GPS fix the server accepted.
const R = 6371000, rad = d => d * Math.PI / 180;
const dist = (a, b) => 2 * R * Math.asin(Math.sqrt(Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2));
const last = trip.points?.at(-1), here = last ? [last.latitude, last.longitude] : line[0];
let start = 0;
line.forEach((p, i) => { if (dist(p, here) < dist(line[start], here)) start = i; });

const pts = [];
let carry = 0;
for (let i = start + 1; i < line.length && pts.length < steps; i++) {
  const a = line[i - 1], b = line[i], d = dist(a, b);
  let s = stepM - carry;
  while (s <= d && pts.length < steps) { const f = s / d; pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]); s += stepM; }
  carry = d - (s - stepM);
}
if (!pts.length) { console.log('Already at the end of the planned route.'); process.exit(0); }

const km = pts.length * stepM / 1000;
console.log(`Trip ${trip.plate ?? active.plate} → ${active.destination}`);
console.log(`Driving ${pts.length} steps (${km.toFixed(1)} km) at ${(stepM / intervalS * 3.6).toFixed(0)} km/h, about ${Math.ceil(pts.length * intervalS / 60)} min. Keep the app open. Ctrl+C stops.`);
for (const [i, [lat, lng]] of pts.entries()) {
  execFileSync(adb, ['-s', serial, 'emu', 'geo', 'fix', String(lng), String(lat)]);
  console.log(`  ${i + 1}/${pts.length} · ${((i + 1) * stepM / 1000).toFixed(2)} km`);
  await new Promise(r => setTimeout(r, intervalS * 1000));
}
const { trip: after } = await get(`/api/trips/${active.id}`);
console.log(`Done. Server: ${after.points?.length ?? '?'} GPS points, ${after.gpsDistanceKm == null ? '?' : after.gpsDistanceKm.toFixed(1)} km. Tap "Arrived at destination" in the app.`);
