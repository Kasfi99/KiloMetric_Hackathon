import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';
import { RestrictionList, RoadChips, RouteCostBlock } from '@/components/domain';
import { RouteMap, type MapSpec } from '@/components/RouteMap';
import { Back, Card, Empty, Foot, H1, H2, Icon, KV, P, Screen, Stat } from '@/components/ui';
import { useApp } from '@/lib/app';
import { dayTime, duration, HAZMAT, num, rp } from '@/lib/format';
import { C } from '@/lib/theme';
import { useTripDetail } from '@/lib/useTrip';

export default function TripDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp(), summary = app.data?.trips.find(t => t.id === id), { trip } = useTripDetail(id, 0), h = trip ?? summary;
  const back = () => (router.canGoBack() ? router.back() : router.replace('/history'));
  const spec = useMemo<MapSpec | null>(() => !h ? null : ({
    routes: h.routing.plan ? [{ coords: h.routing.plan.polyline, selected: true }] : [],
    trail: (trip?.points ?? []).map(p => [p.latitude, p.longitude] as [number, number]),
    points: [{ at: [h.origin.latitude, h.origin.longitude], kind: 'origin' as const }], fitKey: `history:${h.id}:${trip ? 'd' : ''}`,
  }), [h, trip]);
  if (!h) return <Screen><Back onPress={back} /><Empty title="Trip not found" /></Screen>;
  const plan = h.routing.plan, mins = h.endedAt ? (Date.parse(h.endedAt) - Date.parse(h.startedAt)) / 60000 : null;
  return (
    <Screen>
      <Back onPress={back} />
      <H1 sub={dayTime(h.endedAt ?? h.startedAt)}>Trip details</H1>
      <Card style={{ alignItems: 'center' }}><Icon name="check-circle" size={40} color={C.success} /><H2>{h.status === 'completed' ? 'Trip completed' : 'Trip in progress'}</H2><P muted>{h.plate} → {h.destination}</P></Card>
      <RouteMap spec={spec} height={240} />
      <Card><H2>Distance</H2><KV k="Starting odometer" v={`${num(h.startOdometer, 0)} km`} /><KV k="Arrival odometer" v={`${num(h.endOdometer, 0)} km`} /><KV k="Odometer distance (official)" v={`${num(h.odometerDistanceKm)} km`} /><KV k="GPS distance (approx.)" v={`${num(h.gpsDistanceKm)} km`} />{plan && <KV k="Planned route" v={`${num(plan.distanceKm)} km`} />}</Card>
      <Card><H2>Time</H2><KV k="Started" v={dayTime(h.startedAt)} /><KV k="Ended" v={dayTime(h.endedAt)} /><KV k="Duration" v={duration(mins)} /></Card>
      <Card>
        <H2>Estimated cost</H2>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
          <Stat label="Trip maintenance" value={rp(h.estimatedMaintenanceCost)} unknown={h.estimatedMaintenanceCost == null} />
          <Stat label="CPK at departure" value={rp(h.maintenanceCpkAtStart)} unit="/km" unknown={h.maintenanceCpkAtStart == null} />
        </View>
        <P small>{h.maintenanceCpkAtStart != null && h.odometerDistanceKm != null ? `CPK at departure ${rp(h.maintenanceCpkAtStart)}/km × ${num(h.odometerDistanceKm)} km` : 'Truck CPK was unknown at departure.'}</P>
        <Foot>Not an invoice; calculated from historical truck CPK.</Foot>
      </Card>
      {plan && <Card><H2>Selected route</H2><KV k="Provider" v={plan.provider === 'fixture' ? 'sample routes' : 'OpenRouteService'} /><KV k="Route" v={`${num(plan.distanceKm)} km · ${duration(plan.durationMin)}`} /><KV k="Recommendation" v={plan.cost || plan.explanation ? (plan.wasRecommended ? 'Followed' : 'Different route chosen') : 'None'} />{plan.explanation && <Foot>{plan.explanation.headline}</Foot>}{plan.cost && <RouteCostBlock cost={plan.cost} distanceKm={plan.distanceKm} />}{plan.roadCondition !== undefined && <RoadChips road={plan.roadCondition} distanceKm={plan.distanceKm} />}<RestrictionList r={plan.restrictions} /><Foot>Planned estimate at departure. The trip maintenance estimate above uses the odometer distance.</Foot></Card>}
      <Card><H2>Declaration</H2><KV k="Dimensions" v={`${num(h.specs.heightM)} × ${num(h.specs.widthM)} × ${num(h.specs.lengthM)} m`} /><KV k="Axles" v={num(h.specs.axles, 0)} /><KV k="Gross / maximum" v={`${num(h.specs.grossKg, 0)} / ${num(h.specs.maxGrossKg, 0)} kg`} /><KV k="Hazardous cargo" v={HAZMAT.find(([v]) => v === h.specs.hazmat)?.[1] ?? h.specs.hazmat} /></Card>
    </Screen>
  );
}
