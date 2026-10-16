import { router } from 'expo-router';
import { useState } from 'react';
import { Back, Banner, Button, Card, Field, Foot, H1, H2, KV, P, Screen, Sheet } from '@/components/ui';
import { api } from '@/lib/api';
import { parseNum, useApp } from '@/lib/app';
import { duration, minutesSince, num, rp } from '@/lib/format';
import { clearQueue, flush } from '@/lib/queue';
import { useTripDetail } from '@/lib/useTrip';
import { OdometerPhoto, odometerReady, type OdometerCheck } from '@/components/OdometerPhoto';

export default function Complete() {
  // The trip summary in app state is only refreshed on mutations; load the live trip so GPS distance is current.
  const app = useApp(), a = app.activeTrip, { trip: live } = useTripDetail(a?.id, 0);
  const [value, setValue] = useState(''), [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<OdometerCheck | null>(null), [note, setNote] = useState('');
  const back = () => (router.canGoBack() ? router.back() : router.replace('/trip'));
  if (!a) return <Screen><Back onPress={back} /><P>No active trip.</P></Screen>;
  const min = Math.max(a.startOdometer, app.truck(a.truckId)?.odometer ?? 0), end = parseNum(value), valid = end != null && end >= min, dist = valid ? end - a.startOdometer : null;
  const photoOk = odometerReady(check, end, note);
  const finish = async () => {
    setBusy(true); setError(null);
    try {
      await flush(5000); // best effort: send queued GPS before closing the trip
      await api(`/api/trips/${encodeURIComponent(a.id)}/complete`, { method: 'POST', body: { endOdometer: end, odometerCheckId: check?.checkId, odometerNote: note } });
      await app.endTracking(); await clearQueue(); await app.refresh();
      setConfirm(false); router.dismissAll(); router.replace(`/trips/${a.id}`);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen footer={<>{valid && !photoOk && <P small>{check && check.typedKm === end ? 'Explain why the photo does not confirm the reading.' : 'Take a photo of the odometer.'}</P>}<Button title="Complete trip" disabled={!valid || !photoOk} onPress={() => setConfirm(true)} /></>}>
      <Back onPress={back} />
      <H1 sub="Enter your odometer reading on arrival.">Complete trip</H1>
      <Card><H2>{a.plate}</H2><P muted>{a.destination}</P><KV k="Starting odometer" v={`${num(a.startOdometer, 0)} km`} /><KV k="GPS distance (approx.)" v={`${num(live?.gpsDistanceKm ?? a.gpsDistanceKm)} km`} /><KV k="Duration" v={duration(minutesSince(a.startedAt))} /></Card>
      <Card>
        <Field label="Arrival odometer (km)" value={value} onChangeText={setValue} keyboardType="number-pad" placeholder={String(min)} style={{ fontSize: 28, minHeight: 68 }} hint={`Minimum ${num(min, 0)} km`} error={value && !valid ? 'Must not be below the minimum reading.' : undefined} />
        <OdometerPhoto stage="end" typedKm={valid ? end : null} check={check} onCheck={setCheck} note={note} onNote={setNote} />
        <Banner>{dist == null ? 'Enter the arrival odometer reading.' : `Odometer distance = ${num(dist)} km\n${a.maintenanceCpkAtStart == null ? 'Maintenance estimate unavailable (truck CPK unknown at departure).' : `Estimated maintenance cost ≈ ${rp(dist * a.maintenanceCpkAtStart)}`}`}</Banner>
        <Foot>Estimate shown for preview only; official figures come from the server after saving.{'\n'}Not an invoice; calculated from historical truck CPK at departure.</Foot>
      </Card>
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <H2>Complete trip?</H2>
        <P small>The trip will be closed and the truck odometer updated. This cannot be undone.</P>
        <KV k="Truck" v={a.plate} /><KV k="Arrival odometer" v={`${num(end, 0)} km`} /><KV k="Odometer distance" v={`${num(dist)} km`} />
        {error && <Banner tone="error">{error}</Banner>}
        <Button title="Yes, complete trip" loading={busy} onPress={finish} />
        <Button title="Back" kind="flat" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
