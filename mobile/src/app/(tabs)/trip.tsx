import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { RestrictionList, Timeline } from '@/components/domain';
import { RouteMap, type MapSpec } from '@/components/RouteMap';
import { Banner, Button, Card, Divider, Empty, Foot, H1, H2, Loading, P, Screen, StatusBadge, s } from '@/components/ui';
import { useApp } from '@/lib/app';
import { startDraft } from '@/lib/draft';
import { duration, num } from '@/lib/format';
import { KEYS, readJson } from '@/lib/storage';
import { C } from '@/lib/theme';
import { isExpoGo } from '@/lib/tracking';
import { useTripDetail } from '@/lib/useTrip';
import type { LocationPoint } from '@/lib/types';

export default function Trip() {
  const app = useApp(), a = app.activeTrip, { trip } = useTripDetail(a?.id);
  const [fix, setFix] = useState<LocationPoint | null>(null), [now, setNow] = useState(() => Date.now());
  // The background task writes the last fix to storage; poll it so the screen shows a live "last fix" age.
  useEffect(() => { const t = setInterval(async () => { setFix(await readJson<LocationPoint | null>(KEYS.lastFix, null)); setNow(Date.now()); }, 5000); return () => clearInterval(t); }, []);
  // Without the background service, the screen must stay on for foreground GPS to keep running.
  const keepAwake = !!a && app.tracking === 'foreground';
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('trip');
    return () => { deactivateKeepAwake('trip'); };
  }, [keepAwake]);
  const spec = useMemo<MapSpec | null>(() => a && ({
    routes: a.routing.plan ? [{ coords: a.routing.plan.polyline, selected: true }] : [],
    trail: (trip?.points ?? [a.origin, a.lastLocation].filter(Boolean) as LocationPoint[]).map(p => [p.latitude, p.longitude] as [number, number]),
    points: [{ at: [a.origin.latitude, a.origin.longitude], kind: 'origin' as const },
      ...(a.routing.plan?.polyline.length ? [{ at: a.routing.plan.polyline.at(-1)!, kind: 'stop' as const }] : []),
      ...(fix ? [{ at: [fix.latitude, fix.longitude] as [number, number], kind: 'here' as const }] : [])],
    fitKey: `trip:${a.id}:${trip ? 'd' : ''}`,
  }), [a, trip, fix]);

  if (!app.data) return <Screen><Loading /></Screen>;
  if (!a) return (
    <Screen>
      <H1 sub="Every trip, clearly recorded.">Trip</H1>
      <Empty title="No active trip" sub="Select an order to prepare your next trip." action={<Button title="Start from an order" onPress={() => router.navigate('/')} />} />
      <Button kind="flat" title="Start without an order" onPress={() => { startDraft(app, null); router.push('/pretrip'); }} />
    </Screen>
  );
  const plan = a.routing.plan, stops = a.deliveryStops ?? [], age = fix ? Math.max(0, Math.round((now - fix.timestamp) / 1000)) : null;
  const status = app.tracking === 'background' ? 'GPS active · keeps recording with the screen locked' : app.tracking === 'foreground' ? 'GPS active · keep this app open (Expo Go has no background GPS)' : 'GPS stopped';
  return (
    <Screen footer={<Button title="Arrived at destination" onPress={() => router.push('/complete')} />}>
      <H1 sub="Stay focused. Arrive safely.">Active trip</H1>
      {plan?.provider === 'fixture' && <Banner tone="warning">Sample route: the routing provider was unavailable at departure.</Banner>}
      <RouteMap spec={spec} height={280} />
      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}><H2>{a.plate}</H2><StatusBadge status="active" /></View>
        <P muted>{a.destination}</P>
        <View style={{ flexDirection: 'row', marginTop: 16 }}>
          {[['GPS distance (approx.)', `${num(trip?.gpsDistanceKm ?? a.gpsDistanceKm)} km`], ['Points received', num(trip?.points?.length ?? a.pointCount ?? null, 0)], ['Duration', duration(Math.max(0, (now - Date.parse(a.startedAt)) / 60000))]].map(([k, v]) => (
            <View key={k} style={{ flex: 1 }}><Text style={s.small}>{k}</Text><Text style={{ fontSize: 20, fontWeight: '800' }}>{v}</Text></View>
          ))}
        </View>
        <Divider />
        <View style={s.row}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: app.tracking === 'off' ? C.danger : C.success }} /><Text style={s.small}>{status}{age != null ? ` · last fix ${age} s ago` : ''}</Text></View>
        {app.tracking === 'off' && <Button kind="flat" title="Resume GPS" onPress={() => app.beginTracking(a.id)} />}
        {app.pending > 0 && <P small>{app.pending} GPS points waiting for a connection.</P>}
        {isExpoGo && <Foot>Running in Expo Go: GPS pauses when the screen locks. The installed app records in the background.</Foot>}
        {plan && <><Divider /><P small>Planned route: {num(plan.distanceKm)} km · {duration(plan.durationMin)}{plan.wasRecommended ? ' · recommended' : ''}</P><RestrictionList r={plan.restrictions} /></>}
      </Card>
      {stops.length > 0 && <Card><H2>Delivery stops</H2><Timeline stops={stops} detail /></Card>}
      <Button kind="secondary" icon="map" title="Open in Google Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.destination)}&travelmode=driving`)} />
      <Foot>Official distance comes from the arrival odometer, not GPS.</Foot>
    </Screen>
  );
}
