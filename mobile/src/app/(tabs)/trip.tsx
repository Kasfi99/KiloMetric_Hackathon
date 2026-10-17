import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { RestrictionList, Timeline } from '@/components/domain';
import { RouteMap, type MapSpec } from '@/components/RouteMap';
import { Banner, Button, Card, Divider, Empty, Foot, H1, H2, Loading, P, Screen, StatusBadge, s } from '@/components/ui';
import { useApp } from '@/lib/app';
import { inOrder, startDraft } from '@/lib/draft';
import { duration, num } from '@/lib/format';
import { C } from '@/lib/theme';
import { isExpoGo } from '@/lib/tracking';
import { useLastFix } from '@/lib/useLastFix';
import { useTripDetail } from '@/lib/useTrip';
import type { LocationPoint, RoutePlan } from '@/lib/types';

// Path form /maps/dir//A/B/C: every stop is its own path segment, and the empty first segment makes Google Maps
// start from the phone's location (an explicit coordinate origin would only offer "Preview", not navigation).
// Not the ?api=1 form: there every stop but the last rides in the optional `waypoints` parameter, which Google
// documents as ignored where unsupported; on an Android phone it once opened with only the destination.
// data=!4m2!4m1!3e0 selects driving, so a phone left in two-wheeler mode does not route a truck as a motorbike.
// At most 10 stops per link (Google's limit: 9 waypoints + destination); longer plans open in two parts. Same as public/driver/app.js.
const MAPS_STOPS_PER_LINK = 10;
function mapsLinks(points: NonNullable<RoutePlan['stops']>) {
  const at = (q: { latitude: number; longitude: number }) => `${q.latitude.toFixed(6)},${q.longitude.toFixed(6)}`;
  const url = (pts: typeof points) => `https://www.google.com/maps/dir//${pts.map(at).join('/')}/data=!4m2!4m1!3e0`;
  const parts: (typeof points)[] = [];
  for (let i = 0; i < points.length; i += MAPS_STOPS_PER_LINK) parts.push(points.slice(i, i + MAPS_STOPS_PER_LINK));
  return parts.map(pts => ({ url: url(pts), stops: pts.length }));
}

export default function Trip() {
  const app = useApp(), a = app.activeTrip, { trip } = useTripDetail(a?.id);
  // The background task writes the last fix to storage; useLastFix polls it for the map dot and the "last fix" age.
  const fix = useLastFix(), [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(t); }, []);
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
  const plan = a.routing.plan, stops = inOrder(a.deliveryStops ?? [], plan?.stopOrder), links = plan?.stops?.length ? mapsLinks(plan.stops) : null, age = fix ? Math.max(0, Math.round((now - fix.timestamp) / 1000)) : null;
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
        {plan && <><Divider /><P small>Planned route: {num(plan.distanceKm)} km · {duration(plan.durationMin)}{plan.wasRecommended ? ' · recommended' : ''}</P><RestrictionList r={plan.restrictions} sample={plan.provider === 'fixture'} /></>}
      </Card>
      {stops.length > 0 && <Card><H2>Delivery stops</H2><Timeline stops={stops} detail /></Card>}
      {links ? <>
        {links.map((l, i) => <Button key={l.url} kind="secondary" icon="map" title={`Open in Google Maps${links.length > 1 ? ` (part ${i + 1} of ${links.length})` : ''} · ${l.stops} ${l.stops === 1 ? 'stop' : 'stops'}`} onPress={() => Linking.openURL(l.url)} />)}
        <Foot>Google Maps should list {links.length > 1 ? 'the stops shown on each button' : `${links[0].stops} ${links[0].stops === 1 ? 'stop' : 'stops'}`}, starting from your location. If it shows fewer, close Google Maps completely and tap again.</Foot>
      </> : <Button kind="secondary" icon="map" title="Open in Google Maps" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a.destination)}&travelmode=driving`)} />}
      <Foot>Official distance comes from the arrival odometer, not GPS.</Foot>
    </Screen>
  );
}
