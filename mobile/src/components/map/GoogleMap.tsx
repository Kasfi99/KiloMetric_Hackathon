import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type LatLng } from 'react-native-maps';
import { MARK, MapOverlay, fitPoints, mapStyles, type MapProps } from './parts';

// Native Google Maps (dev build / APK with GOOGLE_MAPS_ANDROID_API_KEY). Route geometry still comes from ORS.
const JAKARTA = { latitude: -6.2088, longitude: 106.8456, latitudeDelta: 0.5, longitudeDelta: 0.5 };
const ll = ([latitude, longitude]: [number, number]): LatLng => ({ latitude, longitude });
const PAD = { top: 56, right: 64, bottom: 24, left: 24 };

export function GoogleMap({ spec, height = 260 }: MapProps) {
  const map = useRef<MapView>(null), ready = useRef(false), fitted = useRef<string | null>(null), specRef = useRef(spec);
  useEffect(() => { specRef.current = spec; }, [spec]);
  const fit = (animated: boolean) => {
    const s = specRef.current;
    if (!s || !ready.current) return;
    const all = fitPoints(s).map(ll);
    if (all.length) map.current?.fitToCoordinates(all, { edgePadding: PAD, animated });
  };
  // Fit once per route set (fitKey), so live GPS updates do not pull the map away from where the driver panned.
  useEffect(() => { if (spec && ready.current && fitted.current !== spec.fitKey) { fitted.current = spec.fitKey; fit(false); } }, [spec]);
  const zoom = async (d: number) => { const cam = await map.current?.getCamera(); if (cam?.zoom != null) map.current?.animateCamera({ zoom: cam.zoom + d }, { duration: 200 }); };
  // Centres on the latest fix the screen passed in; zooms in to street level but never zooms out.
  const here = () => { const h = specRef.current?.points.find(p => p.kind === 'here'); if (h && ready.current) map.current?.getCamera().then(cam => map.current?.animateCamera({ center: ll(h.at), zoom: Math.max(cam.zoom ?? 0, 15) }, { duration: 400 })).catch(() => {}); };
  return (
    <View style={[mapStyles.box, { height }]}>
      <MapView ref={map} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill} initialRegion={JAKARTA} rotateEnabled={false} pitchEnabled={false} toolbarEnabled={false}
        onMapReady={() => { ready.current = true; if (specRef.current) { fitted.current = specRef.current.fitKey; fit(false); } }}>
        {spec?.routes.filter(r => !r.selected && r.coords.length > 1).map((r, i) => <Polyline key={`o${i}`} coordinates={r.coords.map(ll)} strokeColor="#94a3b8" strokeWidth={4} lineCap="round" lineJoin="round" />)}
        {spec?.routes.filter(r => r.selected && r.coords.length > 1).map((r, i) => <Polyline key={`s${i}`} coordinates={r.coords.map(ll)} strokeColor="rgba(11,95,255,0.6)" strokeWidth={6} lineCap="round" lineJoin="round" zIndex={1} />)}
        {spec && spec.trail.length > 1 && <Polyline coordinates={spec.trail.map(ll)} strokeColor="#0E7490" strokeWidth={4} zIndex={2} />}
        {spec?.points.map((p, i) => (
          // tracksViewChanges off: custom marker views otherwise re-render on every frame on Android.
          <Marker key={`${p.kind}${i}`} coordinate={ll(p.at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={p.kind === 'here' ? 4 : 3} accessibilityLabel={MARK[p.kind].label}>
            {p.kind === 'here' ? <View style={styles.halo}><View style={[styles.pin, styles.pinHere]} /></View> : <View style={[styles.pin, { backgroundColor: MARK[p.kind].color }]} />}
          </Marker>
        ))}
      </MapView>
      <MapOverlay spec={spec} onZoom={zoom} onFit={() => fit(true)} onHere={here} />
    </View>
  );
}

const styles = StyleSheet.create({
  pin: { width: 16, height: 16, borderRadius: 8, borderWidth: 3, borderColor: '#fff' },
  pinHere: { width: 18, height: 18, borderRadius: 9, backgroundColor: MARK.here.color },
  halo: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(11,95,255,0.2)', alignItems: 'center', justifyContent: 'center' },
});
