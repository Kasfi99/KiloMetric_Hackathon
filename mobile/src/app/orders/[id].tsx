import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { Timeline } from '@/components/domain';
import { Back, Button, Card, Divider, Empty, Foot, H1, H2, KV, P, Screen, StatusBadge, s } from '@/components/ui';
import { useApp } from '@/lib/app';
import { startDraft } from '@/lib/draft';
import { day, num, rp, TOLL_SOURCE } from '@/lib/format';

export default function OrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp(), o = app.order(id), back = () => (router.canGoBack() ? router.back() : router.replace('/'));
  if (!o) return <Screen><Back onPress={back} /><Empty title="Order not found" sub="It may have been reassigned." /></Screen>;
  const e = o.estimate, busy = !!app.activeTrip;
  const money = (v: number | null) => `${rp(v)}${v == null ? ' (unknown)' : ''}`;
  const footer = o.status === 'assigned'
    ? <><Button title="Prepare delivery" icon="local-shipping" disabled={busy} onPress={() => { startDraft(app, o.id); router.push('/pretrip'); }} />{busy && <P small>Complete your active trip first.</P>}</>
    : o.status === 'in_transit' ? <Button title="Open active trip" onPress={() => router.navigate('/trip')} />
    : <Button title="View trip history" onPress={() => (o.tripId ? router.push(`/trips/${o.tripId}`) : router.navigate('/history'))} />;
  return (
    <Screen footer={footer}>
      <Back onPress={back} />
      <H1 sub={o.reference}>Order details</H1>
      <Card>
        <View style={[s.row, { justifyContent: 'space-between' }]}><H2>Delivery</H2><StatusBadge status={o.status} /></View>
        <Text style={[s.h2, { marginTop: 12 }]}>{o.customer || 'Customer not set'}</Text>
        <P small>{day(o.deliveryDate)}</P>
        {o.notes ? <Foot>{o.notes}</Foot> : null}
      </Card>
      <Card><H2>Delivery route</H2><Timeline pickup={o.pickupAddress} stops={o.stops} detail /></Card>
      <Card>
        <H2>Cargo</H2>
        {o.items.length ? o.items.map((i, n) => <KV key={n} k={i.description || 'Item'} v={i.quantity == null ? '—' : `${num(i.quantity)} ${i.unit}`} />) : <P small>No cargo lines.</P>}
        <Divider /><KV k="Cargo weight" v={`${num(o.cargoWeightKg)} kg${o.cargoWeightKg == null ? ' (unknown)' : ''}`} />
      </Card>
      <Card>
        <H2>Cost estimate (admin)</H2>
        {e ? <>
          <KV k="Distance" v={e.distanceKm == null ? '—' : `${num(e.distanceKm)} km`} />
          <KV k="Maintenance" v={money(e.maintenanceCost)} /><KV k="Fuel" v={money(e.fuelCost)} /><KV k="Tolls" v={money(e.tollCost)} /><KV k="Total" v={money(e.totalCost)} />
          <KV k="Total trip CPK" v={e.totalCpk == null ? '— (unknown)' : `${rp(e.totalCpk)}/km`} />
          <Foot>Toll source: {TOLL_SOURCE[e.tollSource] ?? 'unknown'}{'\n'}Not an invoice; calculated from historical truck CPK.</Foot>
        </> : <P small>No estimate from the admin yet.</P>}
      </Card>
    </Screen>
  );
}
