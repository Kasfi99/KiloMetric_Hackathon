import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import { Badge, Button, Field, P, s } from './ui';
import { api } from '@/lib/api';
import { num } from '@/lib/format';

type Photo = { uri: string; mimeType: string; data: string };
export type OdometerCheck ={ checkId: string; status: 'match' | 'mismatch' | 'unreadable' | 'unavailable'; ocrKm: number | null; typedKm: number; reason: string | null };

// Photo evidence for the typed odometer. The server reads it with Gemini; a mismatch or unreadable photo needs a reason.
export function OdometerPhoto({ stage, typedKm, check, onCheck, note, onNote }: { stage: 'start' | 'end'; typedKm: number | null; check: OdometerCheck | null; onCheck: (c: OdometerCheck | null) => void; note: string; onNote: (v: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [photo, setPhoto] = useState<Photo | null>(null);
  // A check belongs to one typed value; editing the odometer re-checks the same photo instead of asking for a new one.
  const stale = !!check && typedKm !== check.typedKm;
  const latestKm = useRef(typedKm), onCheckRef = useRef(onCheck);
  useEffect(() => { latestKm.current = typedKm; onCheckRef.current = onCheck; }, [typedKm, onCheck]);
  const send = useCallback(async (p: Photo, km: number) => {
    setBusy(true); setError(null);
    try {
      const c = await api<OdometerCheck>('/api/odometer/read', { method: 'POST', timeoutMs: 30000, body: { stage, typedKm: km, image: { mimeType: p.mimeType, data: p.data } } });
      if (latestKm.current === km) onCheckRef.current(c); // the value changed during the request; the effect below re-checks it
    } catch (e) { onCheckRef.current(null); setError((e as Error).message); } finally { setBusy(false); }
  }, [stage]);
  // Debounced so typing digit by digit sends one request (the server allows 10 checks a minute).
  useEffect(() => {
    if (!photo || !stale || typedKm == null || busy) return;
    const t = setTimeout(() => send(photo, typedKm), 1000);
    return () => clearTimeout(t);
  }, [photo, stale, typedKm, busy, send]);
  const take = async (fromLibrary: boolean) => {
    setError(null);
    if (typedKm == null) { setError('Enter the odometer value first.'); return; }
    const permission = fromLibrary ? await ImagePicker.requestMediaLibraryPermissionsAsync() : await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { setError(fromLibrary ? 'Photo library permission denied.' : 'Camera permission denied. Allow the camera for KiloMetric in Settings.'); return; }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.5, base64: true };
    const result = fromLibrary ? await ImagePicker.launchImageLibraryAsync(options) : await ImagePicker.launchCameraAsync(options);
    const asset = result.canceled ? null : result.assets[0];
    if (!asset?.base64) return;
    const p = { uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg', data: asset.base64 };
    setPhoto(p);
    await send(p, typedKm);
  };
  const needsReason = !!check && !stale && (check.status === 'mismatch' || check.status === 'unreadable');
  const chip = !check || stale ? null
    : check.status === 'match' ? <Badge tone="green" label={`Photo matches · ${num(check.ocrKm, 0)} km`} />
    : check.status === 'mismatch' ? <Badge tone="orange" label={`Mismatch · photo reads ${num(check.ocrKm, 0)} km`} />
    : check.status === 'unreadable' ? <Badge tone="orange" label="Photo unreadable" />
    : <Badge tone="gray" label="Photo saved · not verified" />;
  return (
    <View style={{ marginTop: 4 }}>
      <Text style={s.label}>Odometer photo</Text>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        {photo && <Image source={{ uri: photo.uri }} style={{ width: 64, height: 48, borderRadius: 8 }} />}
        <View style={{ flex: 1 }}><Button kind="secondary" icon="photo-camera" title={check && !stale ? 'Retake photo' : 'Take odometer photo'} loading={busy} onPress={() => take(false)} /></View>
      </View>
      {__DEV__ && <Button kind="flat" title="Choose from gallery (dev only)" onPress={() => take(true)} />}
      <View style={{ marginTop: 8 }}>{chip}</View>
      {stale && <P small style={{ marginTop: 6 }}>{photo && typedKm != null ? 'The odometer value changed. Checking the photo again…' : 'The odometer value changed. Take the photo again.'}</P>}
      {check?.status === 'unavailable' && !stale && <P small style={{ marginTop: 6 }}>Automatic reading is unavailable{check.reason ? ` (${check.reason})` : ''}. The photo is kept as evidence.</P>}
      {needsReason && <Field label="Reason (required)" value={note} onChangeText={onNote} placeholder="e.g. Glare on the display" maxLength={300} hint={check.status === 'mismatch' ? `You entered ${num(check.typedKm, 0)} km; the photo reads ${num(check.ocrKm, 0)} km. Correct the value or explain.` : 'The photo could not be read. Retake it or explain.'} />}
      {error && <P small style={{ color: '#B91C1C', marginTop: 6 }}>{error}{error.includes('Settings') ? ' ' : ''}</P>}
      {error?.includes('Settings') && <Button kind="flat" title="Open settings" onPress={() => Linking.openSettings()} />}
    </View>
  );
}

// Ready to submit: a fresh check for this value, with a reason when the photo does not confirm it.
export const odometerReady = (check: OdometerCheck | null, typedKm: number | null, note: string) =>
  !!check && check.typedKm === typedKm && (!['mismatch', 'unreadable'].includes(check.status) || note.trim().length >= 5);
