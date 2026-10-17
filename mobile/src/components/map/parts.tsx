import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../ui';
import { C } from '@/lib/theme';

export type MapSpec = { routes: { coords: [number, number][]; selected: boolean }[]; trail: [number, number][]; points: { at: [number, number]; kind: 'origin' | 'stop' | 'here' }[]; fitKey: string };
export type MapProps = { spec: MapSpec | null; height?: number };

// One color per marker kind, shared by both map renderers and the legend so they cannot drift apart.
export const MARK = { here: { color: C.primary, label: 'You' }, origin: { color: C.success, label: 'Start' }, stop: { color: C.warning, label: 'Stop' } } as const;
export const markerKinds = (spec: MapSpec | null) => (['here', 'origin', 'stop'] as const).filter(k => spec?.points.some(p => p.kind === k));

function MapButton({ icon, label, onPress }: { icon: ComponentProps<typeof Icon>['name']; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4} style={({ pressed }) => [styles.btn, pressed && { backgroundColor: '#E5E7EB' }]}><Icon name={icon} size={22} color={C.text} /></Pressable>;
}

export function MapOverlay({ spec, onZoom, onFit, onHere }: { spec: MapSpec | null; onZoom: (d: 1 | -1) => void; onFit: () => void; onHere: () => void }) {
  const kinds = markerKinds(spec);
  return <>
    <View style={styles.controls}>
      <MapButton icon="add" label="Zoom in" onPress={() => onZoom(1)} />
      <MapButton icon="remove" label="Zoom out" onPress={() => onZoom(-1)} />
      <MapButton icon="zoom-out-map" label="Show the whole route" onPress={onFit} />
      {kinds.includes('here') && <MapButton icon="my-location" label="Go to my location" onPress={onHere} />}
    </View>
    {kinds.length > 0 && <View style={styles.legend} pointerEvents="none">{kinds.map(k => (
      <View key={k} style={styles.legendItem}><View style={[styles.dot, { backgroundColor: MARK[k].color }]} /><Text style={styles.legendText}>{MARK[k].label}</Text></View>
    ))}</View>}
  </>;
}

export const mapStyles = StyleSheet.create({
  box: { borderRadius: 16, overflow: 'hidden', backgroundColor: '#EAF0F5', marginBottom: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
  msg: { color: C.muted, textAlign: 'center', fontSize: 13 },
});
const styles = StyleSheet.create({
  // Elevation separates the controls from busy map tiles; nothing else on the screen floats.
  controls: { position: 'absolute', top: 10, right: 10, gap: 8 },
  btn: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 3, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  legend: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  legendText: { fontSize: 13, fontWeight: '600', color: C.text },
});
