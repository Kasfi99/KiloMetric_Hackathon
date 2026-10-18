import { useState } from 'react';
import { View } from 'react-native';
import { useTour } from '@/components/Tour';
import { Badge, Button, Card, H1, H2, KV, P, Screen, Sheet, Stat } from '@/components/ui';
import { useApp } from '@/lib/app';
import { num, rp } from '@/lib/format';

export default function Account() {
  const app = useApp(), u = app.user, tour = useTour();
  const [confirm, setConfirm] = useState(false);
  return (
    <Screen>
      <H1 sub="Profile and app settings.">Account</H1>
      <Card><H2>{u?.name}</H2><P small>{u?.email}</P><Badge label="Driver" /></Card>
      <Card>
        <H2>Your trucks</H2>
        {app.data?.trucks.length ? app.data.trucks.map(t => (
          <View key={t.id} style={{ borderTopWidth: 1, borderColor: '#E5E7EB', paddingTop: 10, marginTop: 10 }}>
            <KV k={t.plate} v={`${t.model} · ${num(t.odometer, 0)} km`} />
            <Stat label="Maintenance CPK" value={rp(app.cpk(t.id))} unit="/km" unknown={app.cpk(t.id) == null} />
          </View>
        )) : <P small>No trucks assigned.</P>}
      </Card>
      <Button kind="secondary" icon="help-outline" title="Show app guide" onPress={tour.start} />
      <Button kind="danger" icon="logout" title="Sign out" onPress={() => setConfirm(true)} />
      <Sheet visible={confirm} onClose={() => setConfirm(false)}>
        <H2>Sign out?</H2>
        <P small>{app.activeTrip ? 'Your active trip stays open on the server. GPS stops until you sign in again.' : 'You can sign in again at any time.'}</P>
        <Button kind="danger" title="Yes, sign out" onPress={() => { setConfirm(false); app.signOut(); }} />
        <Button kind="flat" title="Cancel" onPress={() => setConfirm(false)} />
      </Sheet>
    </Screen>
  );
}
