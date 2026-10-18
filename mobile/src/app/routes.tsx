import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { RestrictionList, RoadChips, RouteCostBlock, sameRestrictions } from '@/components/domain';
import { RouteMap, type MapSpec } from '@/components/RouteMap';
import { StartSheet } from '@/components/StartSheet';
import { Back, Badge, Banner, Button, Card, Divider, Empty, Foot, H1, H2, Icon, Loading, P, Screen, Stepbar, s } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useApp } from '@/lib/app';
import { draftStops, gpsFresh, isIdentity, specs } from '@/lib/draft';
import { duration, num } from '@/lib/format';
import { C } from '@/lib/theme';
import { getFreshPoint } from '@/lib/tracking';
import { useLastFix } from '@/lib/useLastFix';
import type { Preview, PreviewStop, StopOrder } from '@/lib/types';

const TIMEOUT_MS = 60000, SLOW_MS = 8000;

function StopSuggestion({ sug, applied, names, hasPickup, onUse, onKeep }: { sug: NonNullable<StopOrder['suggestion']>; applied: number[]; names: string[]; hasPickup: boolean; onUse: () => void; onKeep: () => void }) {
  const m = sug.minutes, ai = sug.source === 'gemini' && sug.basis === 'notes';
  // The AI can confirm the current order (e.g. notes forbid the faster one); then there is nothing to switch to.
  const same = sug.order.join() === applied.join();
  return (
    <Card style={ai ? { backgroundColor: C.aiBg } : undefined}>
      <View style={[s.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}><H2>{same ? 'Stop order checked' : 'Suggested stop order'}</H2><Badge tone={ai ? 'orange' : 'green'} label={ai ? 'AI read the stop notes' : 'Fastest by Google Maps traffic'} /></View>
      {hasPickup && <P small style={{ marginTop: 8 }}>Pickup stays first.</P>}
      {sug.order.map((i, n) => <P key={i} style={{ marginTop: n ? 4 : 8, fontWeight: '700' }}>{n + 1}. {names[i] ?? `Stop ${i + 1}`}</P>)}
      <P small style={{ marginTop: 8 }}>{sug.reason}</P>
      {same ? m.fastest != null && m.applied != null && m.fastest < m.applied && <Foot>The fastest order would take about {duration(m.fastest)} instead of {duration(m.applied)} (Google Maps traffic), but the notes require this order.</Foot>
        : m.applied != null && m.suggested != null && <Foot>About {duration(m.suggested)} vs {duration(m.applied)} in the current order (Google Maps traffic)</Foot>}
      <View style={{ marginTop: 12, gap: 4 }}>{same ? <Button kind="secondary" title="OK" onPress={onKeep} /> : <><Button title="Use this order" onPress={onUse} /><Button kind="flat" title="Keep current order" onPress={onKeep} /></>}</View>
    </Card>
  );
}

function Found({ stops, hasPickup }: { stops: PreviewStop[]; hasPickup: boolean }) {
  return (
    <Card>
      <H2>Locations found</H2>
      <Foot>Check that each place is the one you expect. The map provider sometimes picks a different place.{stops.some(st => st.geocodeSource === 'google') ? '\nPlaces found with Google Maps.' : ''}</Foot>
      {stops.map((st, i) => (
        <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderColor: C.border, paddingTop: i ? 10 : 12, marginTop: 10 }}>
          <P small>{hasPickup && i === 0 ? 'Pickup' : `Stop ${hasPickup ? i : i + 1}`} · {st.address}</P>
          {st.latitude == null ? <View style={s.row}><Text style={{ fontWeight: '700' }}>Not found</Text><Badge tone="red" label="Not found" /></View> : <>
            <View style={[s.row, { flexWrap: 'wrap' }]}><Text style={{ fontWeight: '700', flexShrink: 1 }}>Found as: {st.geocodeLabel || 'unnamed point'}</Text>{st.geocodePrecision === 'approximate' ? <Badge tone="orange" label="Approximate" /> : st.geocodePrecision === 'exact' ? <Badge tone="green" label="Exact place" /> : null}</View>
            {st.geocodePrecision === 'approximate' && <P small>Only the general area was found; distance and time to this stop are approximate.</P>}
          </>}
        </View>
      ))}
    </Card>
  );
}

export default function Routes() {
  const app = useApp(), { draft: d, preview: p, setPreview } = app;
  const [loading, setLoading] = useState(!p && !!d), [slow, setSlow] = useState(false);
  const [error, setError] = useState<{ status: number; message: string; stops?: PreviewStop[] } | null>(null);
  const [index, setIndex] = useState(0), [sheet, setSheet] = useState<'route' | 'none' | null>(null);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/pretrip'));
  const { gps, setGps } = app;
  // A preview kept in app state may already use a chosen order; keep sending it on retries.
  const [stopOrder, setStopOrder] = useState<number[] | null>(() => (p?.stopOrder && !isIdentity(p.stopOrder.applied) ? p.stopOrder.applied : null));
  const [kept, setKept] = useState<string | null>(null);

  // Async only: every state update happens after the first await, so the mount effect can call it.
  const fetchRoutes = useCallback(async (order: number[] | null) => {
    if (!d) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    try {
      const origin = gpsFresh(gps) ? gps! : await getFreshPoint();
      const res = await api<Preview>('/api/routes/preview', { method: 'POST', timeoutMs: TIMEOUT_MS, body: { origin, specs: specs(d), lang: 'en', truckId: d.truckId, ...(d.orderId ? { orderId: d.orderId } : { stops: draftStops(d) }), ...(order ? { stopOrder: order } : {}) } });
      setGps(origin); setPreview(res);
      const rec = res.routes.findIndex(r => r.recommended); setIndex(rec >= 0 ? rec : 0);
    } catch (e) { setError({ status: e instanceof ApiError ? e.status : 0, message: (e as Error).message, stops: e instanceof ApiError ? e.body?.stops : undefined }); }
    finally { clearTimeout(timer); setLoading(false); }
  }, [d, gps, setGps, setPreview]);
  const load = (order: number[] | null = stopOrder) => { setStopOrder(order); setLoading(true); setSlow(false); setError(null); setPreview(null); fetchRoutes(order); };
  const started = useRef(false);
  useEffect(() => { if (!started.current && !p && d) { started.current = true; fetchRoutes(null); } }, [p, d, fetchRoutes]);

  // The driver's dot: newest of the stored fix (written by getFreshPoint) and the origin fix held in app state.
  const stored = useLastFix(), me = stored && (!gps || stored.timestamp >= gps.timestamp) ? stored : gps;
  const spec = useMemo<MapSpec | null>(() => p && ({
    routes: p.routes.map((r, i) => ({ coords: r.polyline, selected: i === index })), trail: [],
    points: [{ at: [p.origin.latitude, p.origin.longitude], kind: 'origin' }, ...p.stops.filter(st => st.latitude != null).map(st => ({ at: [st.latitude!, st.longitude!] as [number, number], kind: 'stop' as const })),
      ...(me ? [{ at: [me.latitude, me.longitude] as [number, number], kind: 'here' as const }] : [])],
    fitKey: p.routing.computedAt,
  }), [p, index, me]);

  const head = <><Back onPress={back} /><H1 sub="Fastest route priority · Tolls allowed">Choose a route</H1><Stepbar step={2} /></>;
  if (!d) return <Screen>{head}<Empty title="Nothing to route" sub="Prepare a trip first." /></Screen>;
  if (loading) return <Screen>{head}<Loading label={slow ? 'Still calculating… the free routing provider can be slow.' : 'Calculating routes for your truck…'} /></Screen>;
  if (error) return (
    <Screen header footer={<>
      {error.status !== 422 && error.status !== 400 && <Button title="Try again" onPress={() => load()} />}
      {error.status === 400 ? <Button title="Back to pre-trip checks" onPress={back} /> : <Button title="Start without a route" kind="secondary" onPress={() => setSheet('none')} />}
      {stopOrder && <Button kind="flat" title="Back to order as entered" onPress={() => load(null)} />}
    </>}>
      {head}<Banner tone="error">{error.message}</Banner>{error.status === 422 && error.stops && <Found stops={error.stops} hasPickup={!!d.orderId} />}
      <StartSheet visible={sheet === 'none'} onClose={() => setSheet(null)} route={null} />
    </Screen>
  );
  if (!p) return <Screen>{head}<Empty title="No routes yet" action={<Button title="Calculate routes" onPress={() => load()} />} /></Screen>;

  const routes = p.routes, single = routes.length === 1, x = p.explanation, chosen = routes[index] ?? routes[0];
  // Warnings repeated on every route are shown once as banners; route-specific ones stay on their card.
  const shared = routes[0]?.warnings.filter(w => routes.every(r => r.warnings.includes(w))) ?? [];
  // Same for truck limits: identical on every route (the usual case) → one block below the cards, not one per card.
  const sample = p.routing.provider === 'fixture', sameLimits = !single && routes.every(r => sameRestrictions(r.restrictions, routes[0].restrictions));
  const aiSummary = x.summary?.trim(), caveats = x.status === 'ok' ? x.caveats.filter(c => c.trim()) : [];
  const so = p.stopOrder, sug = so?.suggestion && kept !== so.suggestion.order.join() ? so.suggestion : null, reordered = !!so && !isIdentity(so.applied);
  const names = d.orderId ? (app.order(d.orderId)?.stops ?? []).map(st => st.recipient || st.address) : draftStops(d).map(st => st.address);
  return (
    <Screen footer={<Button title={single ? 'Start trip with this route' : `Start trip with Route ${chosen.rank}`} onPress={() => setSheet('route')} />}>
      {head}
      <RouteMap spec={spec} height={260} />
      {p.routing.provider === 'fixture' && <Banner tone="warning">Sample routes: the routing provider is unavailable. Distances and times are not real.</Banner>}
      {shared.map(w => <Banner key={w}>{w}</Banner>)}
      {reordered && <><Banner>Using the suggested stop order</Banner><Button kind="flat" title="Back to order as entered" onPress={() => load(null)} /></>}
      {sug && <StopSuggestion sug={sug} applied={so!.applied} names={names} hasPickup={!!d.orderId} onUse={() => load(sug.order)} onKeep={() => setKept(sug.order.join())} />}
      {p.routing.provider !== 'fixture' && <Found stops={p.stops} hasPickup={!!d.orderId} />}
      {routes.map((r, i) => {
        const own = r.warnings.filter(w => !shared.includes(w)), on = i === index, q = x.status === 'ok' ? x.perRoute.find(e => e.routeId === r.id) : undefined;
        // Hide empty AI parts instead of drawing blank rows.
        const ai = q && { headline: q.headline?.trim(), pros: q.pros.filter(t => t.trim()), cons: q.cons.filter(t => t.trim()) }, hasAi = !!ai && (!!ai.headline || ai.pros.length + ai.cons.length > 0);
        return (
          <Card key={r.id} selected={on && !single} onPress={single ? undefined : () => setIndex(i)}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <View style={s.row}>{!single && <Icon name={on ? 'radio-button-checked' : 'radio-button-unchecked'} color={on ? C.primary : C.muted} />}<H2>Route {r.rank}</H2></View>
              <View style={s.row}>{r.rank === 1 && !single && <Badge label="Fastest" />}{r.recommended && <Badge tone="green" label={p.recommendation?.basis === 'cost' ? 'Recommended · lowest cost' : p.recommendation?.basis === 'time' ? 'Recommended · fastest' : 'Only route'} />}</View>
            </View>
            <Text style={{ fontSize: 20, fontWeight: '800', marginTop: 10 }}>{num(r.distanceKm)} <Text style={s.small}>km</Text> / {duration(r.durationMin)}</Text>
            {r.trafficDurationMin != null && <P small>With current traffic ≈ {duration(r.trafficDurationMin)} (Google Maps)</P>}
            <RouteCostBlock cost={r.cost} distanceKm={r.distanceKm} />
            <RoadChips road={r.roadCondition} distanceKm={r.distanceKm} />
            <P small style={{ marginTop: 8 }}>{r.ascendM == null && r.descendM == null ? 'Ascent and descent: unknown' : `Ascent ↑ ${num(r.ascendM, 0)} m · Descent ↓ ${num(r.descendM, 0)} m`}</P>
            {!sameLimits && <RestrictionList r={r.restrictions} sample={sample} />}
            {own.map(w => <Foot key={w}>⚠ {w}</Foot>)}
            {hasAi && <><Divider /><P small>AI explanation</P>{!!ai.headline && <Text style={{ fontStyle: 'italic', marginBottom: 4 }}>{ai.headline}</Text>}{ai.pros.map(t => <P key={t} small style={{ color: C.success }}>✓ {t}</P>)}{ai.cons.map(t => <P key={t} small style={{ color: C.danger }}>✕ {t}</P>)}</>}
          </Card>
        );
      })}
      {sameLimits && <Card><H2>Truck limits on {routes.length === 2 ? 'both routes' : `all ${routes.length} routes`}</H2><RestrictionList r={routes[0].restrictions} sample={sample} /></Card>}
      {(!!aiSummary || caveats.length > 0) && <Card style={{ backgroundColor: C.aiBg }}>
        <H2>AI explanation</H2>
        {!!aiSummary && <P small style={{ marginTop: 8 }}>{aiSummary}</P>}
        {x.status === 'ok' ? caveats.map(c => <Foot key={c}>⚠ {c}</Foot>) : <Foot>Route figures above still come from the routing provider.</Foot>}
      </Card>}
      <StartSheet visible={sheet === 'route'} onClose={() => setSheet(null)} route={chosen} />
    </Screen>
  );
}
