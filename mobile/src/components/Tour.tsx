import { router } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { readJson, writeJson } from '@/lib/storage';
import { C } from '@/lib/theme';

// Bump the version when the copy changes so every phone sees the guide again.
const SEEN_KEY = 'kilometric_tour_v1_driver';
const TAB_BAR = 64; // tabBarStyle.height in app/(tabs)/_layout.tsx
const TABS = 4;

type Href = '/' | '/trip' | '/history' | '/account';
type Step = { tab: number | null; href: Href; title: string; body: string };
const STEPS: Step[] = [
  { tab: null, href: '/', title: 'Welcome to KiloMetric', body: 'This app runs your delivery trips: the orders assigned to you, the route, GPS and the odometer. This short guide shows what each tab is for.' },
  { tab: 0, href: '/', title: 'Orders', body: 'Orders the admin assigned to you. Tap an order to see its stops, then Prepare delivery to start the trip.' },
  { tab: 1, href: '/trip', title: 'Trip', body: 'Declare the cargo, pick a route and photograph the odometer before you leave. GPS runs while you drive. On arrival, enter and photograph the odometer again.' },
  { tab: 2, href: '/history', title: 'History', body: 'Your finished trips. Tap one to see its route and distance.' },
  { tab: 3, href: '/account', title: 'Account', body: 'Your trucks and their maintenance cost per km, and sign out. Open this guide again with Show app guide.' },
];

const TourContext = createContext<{ start: () => void }>({ start: () => {} });
export const useTour = () => useContext(TourContext);

/** Wraps the tab navigator: starts the guide once per phone, and lets any tab replay it. */
export function TourProvider({ ready, children }: { ready: boolean; children: ReactNode }) {
  const [step, setStep] = useState<number | null>(null);
  useEffect(() => {
    if (!ready) return;
    let live = true;
    readJson<boolean>(SEEN_KEY, false).then(seen => { if (live && !seen) setStep(0); });
    return () => { live = false; };
  }, [ready]);
  const show = useCallback((i: number) => { router.navigate(STEPS[i].href); setStep(i); }, []);
  const close = useCallback(() => { setStep(null); writeJson(SEEN_KEY, true); }, []);
  const value = useMemo(() => ({ start: () => show(0) }), [show]);
  return (
    <TourContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
        {step != null && <TourCard i={step} onBack={() => show(step - 1)} onNext={() => (step === STEPS.length - 1 ? close() : show(step + 1))} onSkip={close} />}
      </View>
    </TourContext.Provider>
  );
}

function TourCard({ i, onBack, onNext, onSkip }: { i: number; onBack: () => void; onNext: () => void; onSkip: () => void }) {
  const { width } = useWindowDimensions(), insets = useSafeAreaInsets();
  const st = STEPS[i], last = i === STEPS.length - 1, bar = TAB_BAR + insets.bottom;
  // Android back closes the guide instead of leaving the screen.
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { onSkip(); return true; }); return () => sub.remove(); }, [onSkip]);
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <View style={[styles.dim, { bottom: st.tab == null ? 0 : bar }]} />
      {/* Transparent shield keeps the tab bar visible but not tappable during the guide. */}
      {st.tab != null && <View style={[styles.shield, { height: bar }]} />}
      <View style={[styles.card, st.tab == null ? { top: '30%' } : { bottom: bar + 14 }]}>
        <View style={styles.head}>
          <Text style={styles.title} accessibilityRole="header">{st.title}</Text>
          <Text style={styles.count}>{i + 1} / {STEPS.length}</Text>
        </View>
        <Text style={styles.body} accessibilityLiveRegion="polite">{st.body}</Text>
        <View style={styles.actions}>
          {!last && <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={8} style={styles.skip}><Text style={styles.skipText}>Skip guide</Text></Pressable>}
          <View style={{ flex: 1 }} />
          {i > 0 && <Pressable accessibilityRole="button" onPress={onBack} style={[styles.btn, styles.btnSecondary]}><Text style={styles.btnSecondaryText}>Back</Text></Pressable>}
          <Pressable accessibilityRole="button" onPress={onNext} style={[styles.btn, styles.btnPrimary]}><Text style={styles.btnPrimaryText}>{last ? 'Done' : 'Next'}</Text></Pressable>
        </View>
        {st.tab != null && <View style={[styles.arrow, { left: (st.tab + 0.5) * (width / TABS) - 16 - 8 }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(17,24,39,0.55)' },
  shield: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  card: { position: 'absolute', left: 16, right: 16, backgroundColor: C.surface, borderRadius: 14, padding: 18, paddingBottom: 14, elevation: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
  head: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', color: C.text, flexShrink: 1 },
  count: { fontSize: 13, color: C.muted },
  body: { fontSize: 15, lineHeight: 22, color: C.text, marginTop: 8, marginBottom: 16 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skip: { minHeight: 44, justifyContent: 'center' },
  skipText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  btn: { minHeight: 44, minWidth: 72, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.primary },
  btnPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnSecondary: { borderWidth: 1, borderColor: C.border },
  btnSecondaryText: { color: C.text, fontSize: 15, fontWeight: '600' },
  arrow: { position: 'absolute', bottom: -8, width: 16, height: 16, backgroundColor: C.surface, transform: [{ rotate: '45deg' }] },
});
