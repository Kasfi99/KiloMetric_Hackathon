import { useState, type ReactNode } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Badge, Button, Card, Icon, P, s, Stat, StatusBadge } from './ui';
import { day, num, rp, RESTRICTION } from '@/lib/format';
import { C } from '@/lib/theme';
import type { Order, OrderStop, Restrictions, RoadCondition, RouteCost } from '@/lib/types';

const SPEC_KEYS = ['height', 'width', 'length', 'weight'], NO_SOURCE = ['bridge_limits', 'truck_bans', 'time_restrictions'];
const names = (keys: string[]) => keys.map(k => (RESTRICTION[k] ?? k).toLowerCase()).join(', ');
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

// Why each unchecked limit was not checked (contract: lib/routing.js, design.md §4). Shown on tap; never dropped.
function restrictionReasons(r: Restrictions, sample: boolean) {
  const u = r.unknown, out: string[] = [];
  if (!r.checked.length) out.push(sample ? 'Sample routes are not calculated for any truck, so no limits were checked.' : 'Truck specifications are not set by your admin, so no truck limits were sent to the route provider.');
  else {
    const spec = u.filter(k => SPEC_KEYS.includes(k));
    if (spec.length) out.push(`${cap(names(spec))}: not sent to the route provider.`);
    if (u.includes('axleload')) out.push('Axle load: per-axle weight is not recorded, so it is not sent.');
    if (u.includes('hazmat')) out.push('Hazardous goods: checked only when the cargo is declared hazardous.');
  }
  const none = u.filter(k => NO_SOURCE.includes(k));
  if (none.length) out.push(`${cap(names(none))}: no data source covers Indonesian roads.`);
  const other = u.filter(k => ![...SPEC_KEYS, 'axleload', 'hazmat', ...NO_SOURCE].includes(k));
  if (other.length && r.checked.length) out.push(`${cap(names(other))}: not checked.`);
  out.push('Follow dispatcher guidance and posted road signs.');
  return out;
}

// Checked limits lead in one green line; every unchecked one stays listed in one muted line with the reasons behind "Why?".
export function RestrictionList({ r, sample = false }: { r: Restrictions; sample?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!r.checked.length && !r.unknown.length) return null;
  const line = !r.checked.length ? `Not checked: all truck limits (${sample ? 'sample route' : 'truck specifications not set'})` : `Not checked: ${names(r.unknown)}`;
  return (
    <View style={{ marginVertical: 8, gap: 4 }}>
      {r.checked.length > 0 && <View style={[s.row, { alignItems: 'flex-start', gap: 6 }]}><Icon name="check-circle" size={16} color={C.success} /><Text style={[s.small, { color: C.success, flexShrink: 1 }]}>Checked for your truck: {names(r.checked)}</Text></View>}
      {r.unknown.length > 0 && <>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityHint="Shows why these limits were not checked" onPress={() => setOpen(o => !o)} hitSlop={8} style={[s.row, { alignItems: 'flex-start', gap: 6 }]}>
          <Icon name="info-outline" size={16} color={C.muted} />
          <Text style={[s.small, { flexShrink: 1 }]}>{line} <Text style={[s.small, s.link]}>{open ? 'Hide' : 'Why?'}</Text></Text>
        </Pressable>
        {open && <View style={{ paddingLeft: 22, gap: 2 }}>{(!r.checked.length ? [`Not checked: ${names(r.unknown)}.`, ...restrictionReasons(r, sample)] : restrictionReasons(r, sample)).map(t => <Text key={t} style={s.small}>{t}</Text>)}</View>}
      </>}
    </View>
  );
}

export const sameRestrictions = (a: Restrictions, b: Restrictions) => a.checked.join() === b.checked.join() && a.unknown.join() === b.unknown.join();

// Route estimate: total and trip CPK lead; components below; unknown stays "—" with the reason.
export function RouteCostBlock({ cost, distanceKm }: { cost: RouteCost; distanceKm: number }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Stat label="Est. trip cost" value={rp(cost.totalCost)} unknown={cost.totalCost == null} />
        <Stat label="Trip CPK" value={rp(cost.tripCpk)} unit="/km" unknown={cost.tripCpk == null} />
      </View>
      <Text style={s.small}>Maintenance {rp(cost.maintenanceCost)} · Fuel {rp(cost.fuelCost)}{cost.fuelCost == null ? ' (no fuel inputs on order)' : ''} · {cost.tollCost == null ? 'Toll unknown' : cost.tollCost === 0 ? 'No toll roads' : `Toll ${rp(cost.tollCost)}`}</Text>
      {cost.tollCost != null && !cost.tollIncluded && <Text style={s.foot}>Toll not in the total: one route has an unknown toll, so totals compare maintenance and fuel only.</Text>}
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
