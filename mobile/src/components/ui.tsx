import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { ActivityIndicator, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardReveal, useKeyboardAware, useRevealOnFocus } from './keyboard';
import { useApp } from '@/lib/app';
import { C } from '@/lib/theme';

export type IconName = ComponentProps<typeof MaterialIcons>['name'];
export const Icon = ({ name, size = 20, color = C.text }: { name: IconName; size?: number; color?: ComponentProps<typeof MaterialIcons>['color'] }) => <MaterialIcons name={name} size={size} color={color} />;

// Screen with app header, offline strip, pending-GPS and sample-data badges, optional sticky footer.
export function Screen({ children, footer, onRefresh, refreshing = false, header = true }: { children: ReactNode; footer?: ReactNode; onRefresh?: () => void; refreshing?: boolean; header?: boolean }) {
  const { online, pending, data, loadError, refresh } = useApp();
  const { scrollRef, onScroll, bottomInset, reveal } = useKeyboardAware();
  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {!online && <Text style={s.offline}>You are offline. Showing the last loaded data.</Text>}
      {header && <View style={s.topbar}><View style={s.brand}><View style={s.brandmark}><Icon name="alt-route" color="#fff" size={18} /></View><View><Text style={s.brandName}>KiloMetric</Text><Text style={s.brandSub}>DRIVER APP</Text></View></View><View style={s.row}>{pending > 0 && <Badge tone="orange" label={`${pending} GPS pending`} />}{data?.sampleData && <Badge tone="gray" label="Sample data" />}</View></View>}
      <KeyboardReveal value={reveal}>
        <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={16} contentContainerStyle={[s.content, { paddingBottom: 32 + bottomInset }]} keyboardShouldPersistTaps="handled" refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined}>
          {loadError && <Banner tone="error">{loadError} <Text style={s.link} onPress={refresh}>Try again</Text></Banner>}
          {children}
        </ScrollView>
      </KeyboardReveal>
      {/* Always rendered: Android can report a collapsed IME as open (hardware keyboard), which would hide it for good. */}
      {footer && <View style={s.footer}>{footer}</View>}
    </SafeAreaView>
  );
}
export const H1 = ({ children, sub }: { children: ReactNode; sub?: ReactNode }) => <View style={{ marginBottom: 18 }}><Text style={s.h1}>{children}</Text>{sub ? <Text style={s.muted}>{sub}</Text> : null}</View>;
export const H2 = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[s.h2, style]}>{children}</Text>;
export const P = ({ children, muted, small, style }: { children: ReactNode; muted?: boolean; small?: boolean; style?: object }) => <Text style={[s.p, muted && s.muted, small && s.small, style]}>{children}</Text>;
export const Foot = ({ children }: { children: ReactNode }) => <Text style={s.foot}>{children}</Text>;
export const Card = ({ children, style, selected, onPress }: { children: ReactNode; style?: ViewStyle; selected?: boolean; onPress?: () => void }) => onPress
  ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.card, selected && s.cardSelected, pressed && { opacity: 0.85 }, style]}>{children}</Pressable>
  : <View style={[s.card, selected && s.cardSelected, style]}>{children}</View>;
export const Divider = () => <View style={s.divider} />;
// Headline number (CPK, trip cost): the figures the product is about, so they read first.
export const Stat = ({ label, value, unit, hint, unknown }: { label: string; value: string; unit?: string; hint?: string; unknown?: boolean }) => (
  <View style={{ flex: 1, paddingVertical: 6 }}>
    <Text style={[s.small, { fontWeight: '700', letterSpacing: 0.5, fontSize: 11 }]}>{label.toUpperCase()}</Text>
    {/* Unit is a sibling: a nested small Text forces its lineHeight on the value and clips descenders. */}
    <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
      <Text style={{ fontSize: 26, lineHeight: 34, fontWeight: '800', color: unknown ? C.muted : C.primary }}>{value}</Text>
      {unit && !unknown ? <Text style={[s.small, { fontWeight: '600' }]}> {unit}</Text> : null}
    </View>
    {unknown ? <Text style={s.small}>unknown</Text> : hint ? <Text style={s.small}>{hint}</Text> : null}
  </View>
);
export const KV = ({ k, v }: { k: ReactNode; v: ReactNode }) => <View style={s.kv}><Text style={s.muted}>{k}</Text><Text style={s.kvValue}>{v}</Text></View>;
export const Unknown = ({ when }: { when: boolean }) => (when ? <Text style={s.small}> unknown</Text> : null);

const TONES = { blue: [C.infoBg, C.info], green: [C.successBg, C.success], orange: [C.warningBg, C.warningText], red: [C.dangerBg, C.danger], gray: ['#EEF0F4', '#4B5563'] } as const; // C.muted on this gray is 4.2:1, below WCAG AA
export const Badge = ({ label, tone = 'blue' }: { label: string; tone?: keyof typeof TONES }) => <View style={[s.badge, { backgroundColor: TONES[tone][0] }]}><Text style={[s.badgeText, { color: TONES[tone][1] }]}>{label}</Text></View>;
export const STATUS: Record<string, [string, keyof typeof TONES]> = { assigned: ['Assigned', 'blue'], in_transit: ['In transit', 'orange'], completed: ['Completed', 'green'], active: ['In progress', 'orange'] };
export const StatusBadge = ({ status }: { status: string }) => { const [label, tone] = STATUS[status] ?? [status, 'blue']; return <Badge label={label} tone={tone} />; };

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' }) {
  const [bg, fg] = tone === 'warning' ? [C.warningBg, C.warningText] : tone === 'error' ? [C.dangerBg, C.danger] : [C.infoBg, C.info];
  return <View style={[s.banner, { backgroundColor: bg }]}><Text style={[s.bannerText, { color: fg }]}>{children}</Text></View>;
}

export function Button({ title, onPress, kind = 'primary', disabled, loading, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'flat' | 'danger'; disabled?: boolean; loading?: boolean; icon?: IconName }) {
  const off = disabled || loading, fg = kind === 'primary' || kind === 'danger' ? '#fff' : kind === 'flat' ? C.primary : C.text;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }} disabled={off} onPress={onPress}
      style={({ pressed }) => [s.btn, kind === 'primary' && { backgroundColor: pressed ? C.dark : C.primary }, kind === 'danger' && { backgroundColor: C.danger }, kind === 'secondary' && s.btnSecondary, kind === 'flat' && s.btnFlat, off && { opacity: 0.42 }]}>
      {loading ? <ActivityIndicator color={fg} /> : <View style={s.row}>{icon && <Icon name={icon} color={fg} />}<Text style={[s.btnText, { color: fg }]}>{title}</Text></View>}
    </Pressable>
  );
}

export function Field({ label, hint, error, inputRef, ...input }: TextInputProps & { label: string; hint?: string; error?: string; inputRef?: Ref<TextInput> }) {
  const reveal = useRevealOnFocus();
  return <View style={{ marginBottom: 14, flex: 1 }}><Text style={s.label}>{label}</Text><TextInput ref={inputRef} placeholderTextColor="#9CA3AF" {...input} onFocus={e => { input.onFocus?.(e); reveal(); }} style={[s.input, error && { borderColor: C.danger }, input.style]} /><Text style={[s.small, error && { color: C.danger }]}>{error || hint || ' '}</Text></View>;
}
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={s.check}><Icon name={checked ? 'check-box' : 'check-box-outline-blank'} color={checked ? C.primary : C.muted} size={26} /><Text style={[s.p, { flex: 1 }]}>{children}</Text></Pressable>;
}
export function Segmented<T extends string>({ value, options, onChange, disabled }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; disabled?: boolean }) {
  return <View style={s.seg}>{options.map(([v, l]) => <Pressable key={v} disabled={disabled} onPress={() => onChange(v)} style={[s.segItem, value === v && s.segOn]}><Text style={[s.small, { color: value === v ? '#fff' : C.text, fontWeight: '600' }]}>{l}</Text></Pressable>)}</View>;
}
export const Empty = ({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) => <Card style={{ alignItems: 'center', paddingVertical: 32 }}><Icon name="inventory-2" size={36} color={C.muted} /><H2 style={{ marginTop: 8 }}>{title}</H2>{sub ? <P muted small>{sub}</P> : null}{action ? <View style={{ marginTop: 16, alignSelf: 'stretch' }}>{action}</View> : null}</Card>;
export const Loading = ({ label = 'Loading…' }: { label?: string }) => <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator color={C.primary} size="large" /><P muted style={{ marginTop: 12, textAlign: 'center' }}>{label}</P></View>;
export const Back = ({ onPress }: { onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress} style={s.back}><Icon name="arrow-back" color={C.primary} /><Text style={[s.btnText, { color: C.primary }]}>Back</Text></Pressable>;
export const Stepbar = ({ step }: { step: 1 | 2 | 3 }) => <View style={s.stepbar}>{['01 Prepare', '02 Route', '03 Start'].map((t, i) => <Text key={t} style={[s.small, i + 1 === step && { color: C.primary, fontWeight: '700' }]}>{t}</Text>)}</View>;

export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.overlay} onPress={onClose}>
        <Pressable style={s.sheet} onPress={() => {}}>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={s.sheetClose}><Icon name="close" /></Pressable>
          <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  offline: { backgroundColor: C.danger, color: '#fff', textAlign: 'center', fontSize: 12, paddingVertical: 6 },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderColor: C.border },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandmark: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  brandName: { fontWeight: '800', fontSize: 16, color: C.text }, brandSub: { fontSize: 9, letterSpacing: 1.2, color: C.muted, fontWeight: '700' },
  content: { padding: 16, paddingBottom: 32 },
  footer: { padding: 16, paddingBottom: 24, backgroundColor: C.surface, borderTopWidth: 1, borderColor: C.border, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  h1: { fontSize: 24, fontWeight: '800', color: C.text }, h2: { fontSize: 18, fontWeight: '700', color: C.text },
  p: { fontSize: 15, color: C.text, lineHeight: 22 }, muted: { color: C.muted }, small: { fontSize: 13, color: C.muted, lineHeight: 19 },
  foot: { fontSize: 12, color: C.muted, lineHeight: 19, marginTop: 10 }, link: { color: C.primary, fontWeight: '700' },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  cardSelected: { borderColor: C.primary, borderWidth: 2, backgroundColor: '#FAFCFF' },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 14 },
  kv: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 }, kvValue: { fontWeight: '700', color: C.text, flexShrink: 1, textAlign: 'right' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' }, badgeText: { fontSize: 11, fontWeight: '700' },
  banner: { borderRadius: 12, padding: 14, marginBottom: 14 }, bannerText: { fontSize: 13, lineHeight: 20 },
  btn: { minHeight: 56, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSecondary: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }, btnFlat: { minHeight: 44, backgroundColor: 'transparent' },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', color: C.text, marginBottom: 6 },
  input: { minHeight: 52, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, fontSize: 16, color: C.text, backgroundColor: '#fff' },
  check: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 10, marginBottom: 8 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }, segItem: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: '#fff' }, segOn: { backgroundColor: C.primary, borderColor: C.primary },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, minHeight: 44 },
  stepbar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 },
  overlay: { flex: 1, backgroundColor: '#0008', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, maxHeight: '88%' },
  sheetClose: { alignSelf: 'flex-end', padding: 6 },
});
