import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { OrderCard } from '@/components/domain';
import { Button, Card, Empty, Foot, H1, Icon, Loading, P, s, Screen, Segmented } from '@/components/ui';
import { useApp } from '@/lib/app';
import { startDraft } from '@/lib/draft';
import { num } from '@/lib/format';
import { C } from '@/lib/theme';

const RANK = { in_transit: 0, assigned: 1, completed: 2 } as const;
type Filter = 'all' | 'assigned' | 'in_transit' | 'completed';

export default function Orders() {
  const app = useApp(), { data, user, activeTrip, refresh, truck } = app;
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false); };
  if (!data) return <Screen><Loading /></Screen>;
  const list = data.orders.filter(o => filter === 'all' || o.status === filter).sort((a, b) => RANK[a.status] - RANK[b.status] || a.deliveryDate.localeCompare(b.deliveryDate));
  return (
    <Screen onRefresh={onRefresh} refreshing={refreshing}>
      <P muted small>Hi, {user?.name.split(' ')[0]} · {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</P>
      <H1 sub={`${data.orders.filter(o => o.status === 'assigned').length} deliveries ready for departure. Pull down to refresh.`}>My orders</H1>
      {activeTrip ? (
        <Pressable onPress={() => router.navigate('/trip')} style={[s.card, { backgroundColor: C.primary, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
          <Icon name="local-shipping" color="#fff" size={28} />
          <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontWeight: '800' }}>Trip in progress</Text><Text style={{ color: '#DBE6FF' }}>{activeTrip.plate} → {activeTrip.destination}</Text></View>
          <Icon name="arrow-forward" color="#fff" />
        </Pressable>
      ) : <>
        {/* Trucks this driver may use; which one to take is set per order (shown on each order card). */}
        <Text style={[s.label, { marginBottom: 6 }]}>Your trucks</Text>
        {data.trucks.map(t => (
          <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icon name="local-shipping" color={C.primary} size={26} />
            <View style={{ flex: 1 }}><Text style={{ fontWeight: '800' }}>{t.plate}</Text><Text style={s.small}>{t.model} · {num(t.odometer, 0)} km</Text></View>
          </Card>
        ))}
      </>}
      <Segmented value={filter} onChange={setFilter} options={[['all', 'All'], ['assigned', 'Assigned'], ['in_transit', 'In transit'], ['completed', 'Completed']]} />
      {list.length ? list.map(o => <OrderCard key={o.id} o={o} truck={truck(o.truckId)?.plate ?? null} onPress={() => router.push(`/orders/${o.id}`)} action={
        o.status === 'assigned' ? <>
          <Button title="Prepare delivery" icon="local-shipping" disabled={!!activeTrip} onPress={() => { startDraft(app, o.id); router.push('/pretrip'); }} />
          {activeTrip && <P small>Complete your active trip first.</P>}
        </> : o.status === 'in_transit' ? <Button title="Open active trip" onPress={() => router.navigate('/trip')} /> : null
      } />) : <Empty title="No orders assigned yet." sub="Contact your dispatcher." />}
      <Foot>Check your truck and cargo before departure.</Foot>
    </Screen>
  );
}
