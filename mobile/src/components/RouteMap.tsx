import Constants, { ExecutionEnvironment } from 'expo-constants';
import { GoogleMap } from './map/GoogleMap';
import { WebMap } from './map/WebMap';
import type { MapProps } from './map/parts';

export type { MapSpec } from './map/parts';

// Expo Go's built-in Google Maps key is rejected on Android (observed: "Authorization failure … host.exp.exponent"),
// and a build without our key crashes on the first Google map, so both draw OpenStreetMap instead.
const useGoogle = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && Constants.expoConfig?.extra?.googleMapsKey === true;

export function RouteMap(props: MapProps) {
  return useGoogle ? <GoogleMap {...props} /> : <WebMap {...props} />;
}
