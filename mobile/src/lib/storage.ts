import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const KEYS = { token: 'kilometric_token', draft: 'kilometric_pretrip_draft', queue: 'kilometric_gps_queue', activeTrip: 'kilometric_active_trip', lastFix: 'kilometric_last_fix' } as const;

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try { const raw = await AsyncStorage.getItem(key); return raw == null ? fallback : (JSON.parse(raw) as T); } catch { return fallback; }
}
export async function writeJson(key: string, value: unknown) { try { await AsyncStorage.setItem(key, JSON.stringify(value)); } catch {} }
export async function remove(key: string) { try { await AsyncStorage.removeItem(key); } catch {} }

// Session token lives in the OS keystore, never in AsyncStorage.
export const getToken = () => SecureStore.getItemAsync(KEYS.token).catch(() => null);
export const setToken = (t: string) => SecureStore.setItemAsync(KEYS.token, t);
export const clearToken = () => SecureStore.deleteItemAsync(KEYS.token).catch(() => {});
