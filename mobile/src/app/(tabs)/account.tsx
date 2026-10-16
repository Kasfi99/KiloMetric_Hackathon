import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Badge, Button, Card, Foot, H1, H2, KV, P, Screen, Sheet, Stat } from '@/components/ui';
import { useApp } from '@/lib/app';
import { num, rp } from '@/lib/format';
import { isExpoGo } from '@/lib/tracking';

export default function Account() {
  const app = useApp(), u = app.user;
  const [perm, setPerm] = useState('checking…'), [confirm, setConfirm] = useState(false);
  useEffect(() => { (async () => {
    const fg = await Location.getForegroundPermissionsAsync(), bg = isExpoGo ? null : await Location.getBackgroundPermissionsAsync().catch(() => null);
    setPerm(`${fg.granted ? 'while using' : fg.status}${bg ? (bg.granted ? ' · always' : ' · background off') : ''}`);
  })(); }, []);
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
      <Card>
        <H2>App</H2>
        <KV k="Mode" v={isExpoGo ? 'Expo Go (preview)' : 'Installed app'} />
        <KV k="Version" v={Constants.expoConfig?.version ?? '—'} />
        <KV k="Server" v={app.apiUrl} />
        <KV k="Location permission" v={perm} />
        <KV k="Background GPS" v={isExpoGo ? 'not available in Expo Go' : 'available'} />
        <Button kind="flat" title="Open location settings" onPress={() => Linking.openSettings()} />
        <Foot>For background tracking, set location to “Allow all the time” for KiloMetric.</Foot>
      </Card>
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
