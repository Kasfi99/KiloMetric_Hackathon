import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import { KEYS, readJson, remove, writeJson } from './storage';
import { flush, pushPoint } from './queue';
import type { LocationPoint } from './types';

export const TASK = 'kilometric-trip-location';
// Expo Go has no Android foreground service / TaskManager; background GPS needs the development build or APK.
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const MAX_ACCURACY_M = 100;

export const toPoint = (l: Location.LocationObject): LocationPoint => ({ latitude: l.coords.latitude, longitude: l.coords.longitude, accuracy: Math.round((l.coords.accuracy ?? 999) * 10) / 10, timestamp: Math.round(l.timestamp) });

// Must run at module scope (imported by the root layout) so the OS can wake the task with the app closed.
// Required lazily: Expo Go on Android has no TaskManager native module, and a top-level import could fail there.
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- must not load in Expo Go (see above)
    const TaskManager: typeof import('expo-task-manager') = require('expo-task-manager');
    TaskManager.defineTask<{ locations: Location.LocationObject[] }>(TASK, async ({ data, error }) => {
      if (error || !data) return;
      const tripId = await readJson<string | null>(KEYS.activeTrip, null);
      if (!tripId) return;
      for (const l of data.locations) await pushPoint(tripId, toPoint(l));
      await flush(10000);
    });
  } catch (e) { console.warn('Background location task unavailable:', e); }
}

export type TrackingMode = 'background' | 'foreground' | 'off';
let watch: Location.LocationSubscription | null = null;

export async function requestForeground() {
  const p = await Location.requestForegroundPermissionsAsync();
  return p.granted;
}

export async function getFreshPoint(): Promise<LocationPoint> {
  if (!(await requestForeground())) throw new Error('Location permission denied. Allow location for KiloMetric in Settings, then try again.');
  // getCurrentPositionAsync has no timeout; without a fix (indoors, or a stalled emulator provider) the button spun forever.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const l = await Promise.race([
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest }),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('No GPS fix after 25 seconds. Move to an open area or turn location on, then try again.')), 25000); }),
  ]).finally(() => clearTimeout(timer));
  const p = toPoint(l);
  if (p.accuracy > MAX_ACCURACY_M) throw new Error(`Accuracy ${Math.round(p.accuracy)} m; ${MAX_ACCURACY_M} m or better is required. Move to an open area and try again.`);
  await writeJson(KEYS.lastFix, p);
  return p;
}

// Prefer the background task (keeps recording with the screen locked); fall back to a foreground watcher.
export async function startTracking(tripId: string): Promise<TrackingMode> {
  await writeJson(KEYS.activeTrip, tripId);
  if (!(await requestForeground())) return 'off';
  if (!isExpoGo) {
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.granted) {
        if (!(await Location.hasStartedLocationUpdatesAsync(TASK))) {
          await Location.startLocationUpdatesAsync(TASK, {
            accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25,
            foregroundService: { notificationTitle: 'KiloMetric is recording your trip', notificationBody: 'GPS distance is being logged for this delivery.', notificationColor: '#0B5FFF' },
          });
        }
        stopWatch();
        return 'background';
      }
    } catch (e) { console.warn('Background tracking failed, using foreground:', e); }
  }
  if (!watch) watch = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 }, l => { pushPoint(tripId, toPoint(l)).then(() => flush()); });
  return 'foreground';
}
function stopWatch() { watch?.remove(); watch = null; }

export async function stopTracking() {
  stopWatch();
  if (!isExpoGo) { try { if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK); } catch {} }
  await remove(KEYS.activeTrip);
}
