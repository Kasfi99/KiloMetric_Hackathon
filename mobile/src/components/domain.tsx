import type { ReactNode } from 'react';
import { Linking, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, P, s, Stat, StatusBadge } from './ui';
import { day, num, rp, RESTRICTION } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Order, OrderStop, Restrictions, RoadCondition, RouteCost } from '@/lib/types';

export function RestrictionList({ r }: { r: Restrictions }) {
  return (
    <View style={{ marginVertical: 8, gap: 4 }}>
      <Text style={[s.small, { color: C.success }]}>Checked: {r.checked.length ? r.checked.map(k => RESTRICTION[k] ?? k).join(' · ') : 'none'}</Text>
      <Text style={s.small}>Unknown: {r.unknown.map(k => RESTRICTION[k] ?? k).join(' · ') || '—'}</Text>
    </View>
  );
}

// Route estimate: total and trip CPK lead; components below; unknown stays "—" with the reason.
export function RouteCostBlock({ cost, distanceKm }: { cost: RouteCost; distanceKm: number }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Est. trip cost" value={rp(cost.totalCost)} unknown={cost.totalCost == null} />
        <Stat label="Trip CPK" value={rp(cost.tripCpk)} unit="/km" unknown={cost.tripCpk == null} />
      </View>
      <Text style={s.small}>Maintenance {rp(cost.maintenanceCost)} · Fuel {rp(cost.fuelCost)}{cost.fuelCost == null ? ' (no fuel inputs on order)' : ''} · Toll unknown</Text>
      {cost.factorApplied && <Text style={[s.foot, { color: C.warningText }]}>Rough-road factor ×{cost.roughRoadFactor} applied (assumption, not calibrated).</Text>}
      {cost.totalCost == null && cost.maintenanceCost != null && <Text style={s.foot}>Total unknown until every part is known. Maintenance alone ≈ {rp(cost.maintenanceCost / distanceKm)}/km.</Text>}
    </View>
  );
}

export function RoadChips({ road, distanceKm }: { road: RoadCondition | null | undefined; distanceKm: number }) {
  if (!road) return <Text style={s.small}>Road condition: no data (sample route)</Text>;
  const pct = (km: number) => `${Math.round((km / Math.max(distanceKm, 0.1)) * 100)}%`;
  const chips: [string, 'green' | 'orange' | 'gray' | 'red'][] = [[`Paved ${pct(road.pavedKm)}`, 'green'], [`Rough ${pct(road.roughKm)}`, road.roughKm > 0 ? 'orange' : 'gray'], [`Unknown surface ${pct(road.unknownKm)}`, 'gray']];
  if (road.steepKm > 0) chips.push([`Steep ${num(road.steepKm)} km`, 'orange']);
  if (road.ferryKm > 0) chips.push([`Ferry ${num(road.ferryKm)} km`, 'red']);
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>{chips.map(([l, t]) => <Badge key={l} label={l} tone={t} />)}</View>;
}

export const call = (contact: string) => Linking.openURL(`tel:${contact.replace(/[^\d+]/g, '')}`);

export function Timeline({ pickup, stops, detail }: { pickup?: string; stops: OrderStop[]; detail?: boolean }) {
  const shown = detail ? stops : stops.slice(-1);
  return (
    <View style={{ gap: 14, marginVertical: 8 }}>
      {pickup !== undefined && <Stop label="PICKUP" title={pickup} />}
      {shown.map((st, i) => {
        const index = detail ? i : stops.length - 1, final = index === stops.length - 1;
        return (
          <Stop key={index} label={detail ? `STOP ${index + 1}${final ? ' · FINAL DESTINATION' : ''}` : `${stops.length} ${stops.length === 1 ? 'STOP' : 'STOPS'} · FINAL DESTINATION`} title={detail ? st.recipient || 'Recipient not set' : st.address}>
            {detail && <P small>{st.address}</P>}
            {detail && st.notes ? <Text style={s.foot}>{st.notes}</Text> : null}
            {detail && st.contact ? <View style={{ alignItems: 'flex-start' }}><Button kind="flat" icon="call" title={`Call ${st.contact}`} onPress={() => call(st.contact)} /></View> : null}
          </Stop>
        );
      })}
    </View>
  );
}
function Stop({ label, title, children }: { label: string; title: string; children?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: C.primary, marginTop: 4 }} />
      <View style={{ flex: 1 }}><Text style={[s.small, { fontWeight: '700', letterSpacing: 0.6, fontSize: 11 }]}>{label}</Text><Text style={[s.p, { fontWeight: '700' }]}>{title}</Text>{children}</View>
    </View>
  );
}

// truck: plate of the truck the admin assigned to this order; the driver must take this one.
export function OrderCard({ o, truck, onPress, action }: { o: Order; truck: string | null; onPress: () => void; action?: ReactNode }) {
  return (
    <Card onPress={onPress}>
      <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={[s.small, { fontWeight: '700' }]}>{o.reference}</Text><StatusBadge status={o.status} /></View>
      <Text style={[s.h2, { marginTop: 8 }]}>{o.customer || 'Customer not set'}</Text>
      <View style={[s.row, { marginTop: 6 }]}><Icon name="local-shipping" size={18} color={C.primary} /><Text style={{ fontWeight: '700', color: C.primary }}>{truck ?? 'Truck not available'}</Text></View>
      <Timeline pickup={o.pickupAddress} stops={o.stops} />
      <View style={[s.row, { gap: 16, marginTop: 4 }]}>
        <View style={s.row}><Icon name="scale" size={16} color={C.muted} /><Text style={s.small}>{num(o.cargoWeightKg)} kg{o.cargoWeightKg == null ? ' · unknown' : ''}</Text></View>
        <View style={s.row}><Icon name="event" size={16} color={C.muted} /><Text style={s.small}>{day(o.deliveryDate)}</Text></View>
      </View>
      <Text style={[s.small, { marginTop: 8 }]}>{o.estimate ? `Estimated distance ${num(o.estimate.distanceKm)} km · Estimated cost ${rp(o.estimate.totalCost)}${o.estimate.totalCost == null ? ' (unknown)' : ''}` : 'No admin estimate yet'}</Text>
      {/* Drivers missed that the card itself is tappable, so both paths are buttons. */}
      <View style={{ marginTop: 12, gap: 4 }}>
        {action}
        <Button kind="flat" title="View details" onPress={onPress} />
      </View>
    </Card>
  );
}
