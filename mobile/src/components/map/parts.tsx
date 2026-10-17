import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../ui';
import { C } from '@/lib/theme';

export type MapSpec = { routes: { coords: [number, number][]; selected: boolean }[]; trail: [number, number][]; points: { at: [number, number]; kind: 'origin' | 'stop' | 'here' }[]; fitKey: string };
export type MapProps = { spec: MapSpec | null; height?: number };

// One color per marker kind, shared by both map renderers and the legend so they cannot drift apart.
export const MARK = { here: { color: C.primary, label: 'You' }, origin: { color: C.success, label: 'Start' }, stop: { color: C.warning, label: 'Stop' } } as const;
export const markerKinds = (spec: MapSpec | null) => (['here', 'origin', 'stop'] as const).filter(k => spec?.points.some(p => p.kind === k));
// "Show the whole route" frames route, trail and fixed points; the driver's own dot has its own button,
// and a far-away live fix (e.g. on a history trip) must not shrink the route to a speck.
export const fitPoints = (spec: MapSpec) => [...spec.routes.flatMap(r => r.coords), ...spec.trail, ...spec.points.filter(p => p.kind !== 'here').map(p => p.at)];

const PRESSED = '#F3F4F6';

function MapButton({ icon, label, onPress }: { icon: ComponentProps<typeof Icon>['name']; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={2}
      style={({ pressed }) => [styles.btn, pressed && { backgroundColor: PRESSED }]}>
      <Icon name={icon} size={22} color={C.text} />
    </Pressable>
  );
}

// Google Maps' recenter button: white disc, blue dot in a light-blue ring. Grey empty ring while there is no fix.
function LocateButton({ enabled, onPress }: { enabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={enabled ? 'Go to my location' : 'My location unavailable: no GPS fix yet'}
      accessibilityHint={enabled ? 'Centres the map on your latest GPS position' : undefined} accessibilityState={{ disabled: !enabled }}
      disabled={!enabled} onPress={onPress} style={({ pressed }) => [styles.fab, styles.shadow, pressed && { backgroundColor: PRESSED }]}>
      <View style={[styles.ring, !enabled && styles.ringOff]}>{enabled && <View style={styles.core} />}</View>
    </Pressable>
  );
}

export function MapOverlay({ spec, onZoom, onFit, onHere }: { spec: MapSpec | null; onZoom: (d: 1 | -1) => void; onFit: () => void; onHere: () => void }) {
  const kinds = markerKinds(spec);
  return <>
    {/* Map tools top-right; the location button floats alone bottom-right, as in Google Maps. */}
    <View style={styles.controls}>
      <View style={[styles.group, styles.shadow]}>
        <View style={styles.groupClip}>
          <MapButton icon="add" label="Zoom in" onPress={() => onZoom(1)} />
          <View style={styles.divider} />
          <MapButton icon="remove" label="Zoom out" onPress={() => onZoom(-1)} />
        </View>
      </View>
      <View style={[styles.group, styles.shadow]}><View style={styles.groupClip}><MapButton icon="zoom-out-map" label="Show the whole route" onPress={onFit} /></View></View>
    </View>
    <View style={styles.fabBox}><LocateButton enabled={kinds.includes('here')} onPress={onHere} /></View>
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
  shadow: { elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  controls: { position: 'absolute', top: 10, right: 10, gap: 8 },
  // Outer view casts the shadow, inner view clips the pressed highlight to the rounded corners (iOS drops shadows under overflow: hidden).
  group: { borderRadius: 10, backgroundColor: '#fff' },
  groupClip: { borderRadius: 10, overflow: 'hidden' },
  btn: { width: 44, height: 44, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 8, backgroundColor: C.border },
  // Bottom-right: the Google logo (native) and OSM attribution (web) sit bottom-left.
  fabBox: { position: 'absolute', right: 12, bottom: 12 },
  fab: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  ring: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(11,95,255,0.35)', backgroundColor: 'rgba(11,95,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  ringOff: { borderColor: '#9CA3AF', backgroundColor: 'transparent' },
  core: { width: 12, height: 12, borderRadius: 6, backgroundColor: MARK.here.color },
  legend: { position: 'absolute', left: 10, top: 10, flexDirection: 'row', gap: 10, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#fff' },
  legendText: { fontSize: 13, fontWeight: '600', color: C.text },
});
