import { router } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { StartSheet } from '@/components/StartSheet';
import { Back, Banner, Button, Card, Check, Empty, Field, Foot, H1, H2, Icon, KV, P, Screen, Segmented, Sheet, Stat, Stepbar, s } from '@/components/ui';
import { OdometerPhoto } from '@/components/OdometerPhoto';
import { api } from '@/lib/api';
import { parseNum, useApp } from '@/lib/app';
import { draftStops, fieldError, gross, LABEL, master, minFor, overweight, problems, selectTruck } from '@/lib/draft';
import { HAZMAT, num, rp } from '@/lib/format';
import { C } from '@/lib/theme';
import { getFreshPoint } from '@/lib/tracking';

export default function Pretrip() {
  const app = useApp(), { draft: d, setDraft, gps, setGps } = app;
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [skip, setSkip] = useState(false);
  const [report, setReport] = useState(false);
  const [reportedFor, setReportedFor] = useState<string | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!d) return <Screen><Back onPress={back} /><Empty title="Nothing to prepare" sub="Choose an order first." action={<Button title="Open orders" onPress={() => router.replace('/')} />} /></Screen>;
  if (!app.data?.trucks.length) return <Screen><Back onPress={back} /><Empty title="No truck assigned" sub="Contact your admin." /></Screen>;
  const o = app.order(d.orderId), t = app.truck(d.truckId), cpk = app.cpk(d.truckId), issues = problems(app, d, gps);
  const m = master(app, d), g = gross(app, d), over = overweight(app, d);
  const field = (key: 'odometer' | 'loadKg') => {
    const min = minFor(app, d, key), raw = d[key];
    return <Field key={key} label={LABEL[key]} value={raw} onChangeText={v => setDraft({ ...d, [key]: v })} keyboardType="decimal-pad" error={raw === '' ? undefined : fieldError(app, d, key)}
      hint={key === 'odometer' ? `Minimum ${num(min, 0)} km` : min > 0 ? `Minimum ${num(min, 0)} kg as specified in the order` : undefined} />;
  };
  const capture = async () => {
    setGpsBusy(true); setGpsError(null);
    try { setGps(await getFreshPoint()); } catch (e) { setGps(null); setGpsError((e as Error).message); } finally { setGpsBusy(false); }
  };
  const footer = <>
    {issues.length > 0 && <P small>{issues[0]}</P>}
    <Button title="View route options" icon="alt-route" disabled={issues.length > 0} onPress={() => { app.setPreview(null); router.push('/routes'); }} />
    <Button title="Skip routes and start" kind="flat" disabled={issues.length > 0} onPress={() => setSkip(true)} />
  </>;
  return (
    <Screen footer={footer}>
      <Back onPress={back} />
      <H1 sub="Review your details before departure.">Pre-trip checks</H1>
      <Stepbar step={1} />
      {o && <Banner>{o.reference} · {o.customer}{'\n'}<Text style={{ fontWeight: '700' }}>{o.stops.at(-1)?.address}</Text> · {num(o.cargoWeightKg, 0)} kg</Banner>}
      <Card>
        <H2>Truck</H2>
        {o ? <P small>Truck is assigned by the order.</P> : <P small>Trucks assigned to you</P>}
        <View style={{ gap: 8, marginVertical: 10 }}>
          {(o ? [t].filter(Boolean) : app.data.trucks).map(x => x && (
            <Pressable key={x.id} disabled={!!o} onPress={() => selectTruck(app, d, x.id)} style={[s.card, { marginBottom: 0, padding: 12 }, x.id === d.truckId && s.cardSelected]}>
              <Text style={{ fontWeight: '800' }}>{x.plate}</Text><Text style={s.small}>{x.model} · odometer {num(x.odometer, 0)} km</Text>
            </Pressable>
          ))}
        </View>
        <Stat label="Maintenance CPK" value={cpk == null ? '—' : rp(cpk)} unit="/km" unknown={cpk == null} hint="From this truck's workshop history" />
        {field('odometer')}
        <OdometerPhoto stage="start" typedKm={fieldError(app, d, 'odometer') ? null : parseNum(d.odometer)} check={d.odometerCheck ?? null} onCheck={odometerCheck => app.patchDraft({ odometerCheck })} note={d.odometerNote ?? ''} onNote={odometerNote => app.patchDraft({ odometerNote })} />
      </Card>
      <Card>
        <H2>Truck specifications</H2>
        <P small>Set by your admin</P>
        <View style={{ marginTop: 10 }}>
          {m ? <>
            <KV k="Height" v={`${num(m.heightM)} m`} /><KV k="Width" v={`${num(m.widthM)} m`} /><KV k="Length" v={`${num(m.lengthM)} m`} />
            <KV k="Axles" v={num(m.axles, 0)} /><KV k="Tare weight" v={`${num(m.tareKg, 0)} kg`} /><KV k="Maximum weight" v={`${num(m.maxGrossKg, 0)} kg`} />
          </> : <Banner tone="warning">Truck specifications are not set yet. Height, width, length and weight limits will not be checked on the route. Ask your admin to add them.</Banner>}
        </View>
        {t && (reportedFor === t.id ? <Banner>Sent to your admin.</Banner> : <View style={{ alignItems: 'flex-start' }}><Button kind="flat" icon="report-problem" title="Report a mismatch" onPress={() => setReport(true)} /></View>)}
      </Card>
      <Card>
        <H2 style={{ marginBottom: 12 }}>Cargo</H2>
        {field('loadKg')}
        <Text style={s.label}>Hazardous cargo</Text>
        <Segmented value={d.hazmat} options={HAZMAT} onChange={hazmat => setDraft({ ...d, hazmat })} />
        {m ? <Banner tone={over ? 'error' : 'info'}>Gross weight = {num(g, 0)} kg out of a maximum of {num(m.maxGrossKg, 0)} kg{over ? '\nOver the limit; the server will reject this load.' : ''}</Banner>
          : <Banner>Gross weight unknown until your admin sets the truck specifications.</Banner>}
      </Card>
      {!o && (
        <Card>
          <H2>Destinations</H2>
          {d.destinations.map((x, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Field label={`Stop ${i + 1}${i === d.destinations.length - 1 ? ' · final' : ''}`} value={x} maxLength={300} placeholder="Place and city, e.g. Kawasan Industri Pulogadung, Jakarta" onChangeText={v => setDraft({ ...d, destinations: d.destinations.map((y, j) => (j === i ? v : y)) })} />
              {d.destinations.length > 1 && <Pressable accessibilityLabel="Remove stop" style={{ padding: 12, marginBottom: 20 }} onPress={() => setDraft({ ...d, destinations: d.destinations.filter((_, j) => j !== i) })}><Icon name="close" /></Pressable>}
            </View>
          ))}
          {d.destinations.length < 10 && <View style={{ alignItems: 'flex-start' }}><Button kind="flat" icon="add" title="Add stop" onPress={() => setDraft({ ...d, destinations: [...d.destinations, ''] })} /></View>}
          <Foot>Named places (industrial estates, ports, warehouses) are found more precisely than street addresses.</Foot>
        </Card>
      )}
      <Card>
        <H2>Starting location</H2>
        <Foot>Your phone location is the trip origin. Accuracy must be 100 m or better.</Foot>
        <View style={{ marginTop: 12 }}><Button kind="secondary" icon="my-location" title="Get GPS location" loading={gpsBusy} onPress={capture} /></View>
        <P small style={{ marginTop: 8 }}>{gps ? `Location ready · ${gps.latitude.toFixed(5)}, ${gps.longitude.toFixed(5)} · accuracy ${Math.round(gps.accuracy)} m` : gpsError || 'Not captured yet'}</P>
        {gpsError?.includes('permission') && <Button kind="flat" title="Open settings" onPress={() => Linking.openSettings()} />}
      </Card>
      <Check checked={d.confirmed} onChange={confirmed => setDraft({ ...d, confirmed })}>I checked that this truck matches the specifications above and the cargo is correct.</Check>
      {!o && draftStops(d).length === 0 && <P small style={{ color: C.muted }}>Add at least one destination.</P>}
      <StartSheet visible={skip} onClose={() => setSkip(false)} route={null} />
      {t && <SpecReport visible={report} truckId={t.id} plate={t.plate} onClose={() => setReport(false)} onSent={() => { setReport(false); setReportedFor(t.id); }} />}
    </Screen>
  );
}

function SpecReport({ visible, truckId, plate, onClose, onSent }: { visible: boolean; truckId: string; plate: string; onClose: () => void; onSent: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const len = note.trim().length, ok = len >= 5 && len <= 300;
  const close = () => { setError(null); onClose(); };
  const send = async () => {
    setBusy(true); setError(null);
    try { await api(`/api/trucks/${encodeURIComponent(truckId)}/spec-reports`, { method: 'POST', body: { note: note.trim() } }); setNote(''); onSent(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Sheet visible={visible} onClose={close}>
      <H2>Report a mismatch</H2>
      <P small>Tell your admin what does not match on {plate}. The specifications stay as they are until your admin changes them.</P>
      <View style={{ marginTop: 12 }}>
        <Field label="What is different?" value={note} onChangeText={setNote} maxLength={300} multiline placeholder="e.g. Height is 4.2 m after the new box body" style={{ minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }}
          error={len > 0 && len < 5 ? 'At least 5 characters' : undefined} hint={`${len}/300`} />
      </View>
      {error && <Banner tone="error">{error}</Banner>}
      <Button title="Send" disabled={!ok} loading={busy} onPress={send} />
      <Button title="Cancel" kind="flat" onPress={close} />
    </Sheet>
  );
}
