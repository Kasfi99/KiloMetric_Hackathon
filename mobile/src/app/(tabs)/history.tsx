import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Card, Empty, Foot, H1, Loading, P, Screen, StatusBadge, s } from '@/components/ui';
import { useApp } from '@/lib/app';
import { dayTime, num, rp } from '@/lib/format';

export default function History() {
  const { data, refresh } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  if (!data) return <Screen><Loading /></Screen>;
  const done = data.trips.filter(t => t.status === 'completed').sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)));
  return (
    <Screen onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false); }} refreshing={refreshing}>
      <H1 sub="Your completed journeys, in one place.">Trip history</H1>
      {done.length ? done.map(h => (
        <Card key={h.id} onPress={() => router.push(`/trips/${h.id}`)}>
          <View style={[s.row, { justifyContent: 'space-between' }]}><Text style={s.small}>{dayTime(h.endedAt)}</Text><StatusBadge status="completed" /></View>
          <Text style={[s.h2, { marginTop: 6 }]}>{h.plate} → {h.destination}</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', marginTop: 8 }}>{num(h.odometerDistanceKm)} <Text style={s.small}>km · odometer</Text></Text>
          <P small>GPS {num(h.gpsDistanceKm)} km (approx.)</P>
          <P small>Estimated maintenance {rp(h.estimatedMaintenanceCost)}{h.estimatedMaintenanceCost == null ? ' (unknown)' : ''}</P>
          {h.orderReference && <Foot>Order {h.orderReference}</Foot>}
        </Card>
      )) : <Empty title="No completed trips yet." />}
    </Screen>
  );
}
