import { Redirect, Tabs } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ColorValue } from 'react-native';
import { Button, H1, Icon, Loading, s, type IconName } from '@/components/ui';
import { useApp } from '@/lib/app';
import { C } from '@/lib/theme';

function TabIcon({ name, color }: { name: IconName; color: ColorValue }) { return <Icon name={name} color={(color ?? C.muted) as string} size={24} />; }
const tabIcon = (name: IconName) => function TabBarIcon({ color }: { color: ColorValue }) { return <TabIcon name={name} color={color} />; };

export default function TabLayout() {
  const { status, user, data, signOut } = useApp();
  if (status === 'loading') return <SafeAreaView style={s.safe}><Loading /></SafeAreaView>;
  if (status === 'signedOut') return <Redirect href="/login" />;
  if (user && user.role !== 'driver') return (
    <SafeAreaView style={[s.safe, { padding: 24, justifyContent: 'center' }]}>
      <H1 sub="This app is for drivers. Admins, managers and workshop staff use the web dashboard.">Driver accounts only</H1>
      <Button title="Sign out" kind="secondary" onPress={signOut} />
    </SafeAreaView>
  );
  const open = data?.orders.filter(o => o.status !== 'completed').length ?? 0;
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: C.muted, tabBarStyle: { height: 64, paddingBottom: 8 } }}>
      <Tabs.Screen name="index" options={{ title: 'Orders', tabBarBadge: open || undefined, tabBarIcon: tabIcon('inventory-2') }} />
      <Tabs.Screen name="trip" options={{ title: 'Trip', tabBarIcon: tabIcon('alt-route') }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: tabIcon('history') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: tabIcon('person') }} />
    </Tabs>
  );
}
