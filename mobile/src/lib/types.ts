// API shapes from design.md §4 (the binding contract). Unlisted server fields are ignored.
export type LocationPoint = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type Hazmat = 'none' | 'flammable' | 'explosive' | 'other';
// Truck master data set by admin or workshop; null until set.
export type TruckSpecs = { heightM: number; widthM: number; lengthM: number; axles: number; tareKg: number; maxGrossKg: number };
// The server reads only these from the driver and fills dimensions and weights from the truck master.
export type CargoSpecs = { loadKg: number; hazmat: Hazmat };
export type TripSpecs = { [K in keyof TruckSpecs]: number | null } & CargoSpecs & { grossKg: number | null };
export type User = { id: string; name: string; email: string; role: 'admin' | 'manager' | 'workshop' | 'driver'; active: boolean; assignedTruckIds: string[] };
export type Truck = { id: string; plate: string; model: string; duty: string; odometer: number; specifications?: TruckSpecs | null };
export type OrderStop = { recipient: string; address: string; contact: string; notes: string };
export type OrderEstimate = { distanceKm: number | null; maintenanceCost: number | null; fuelCost: number | null; tollCost: number | null; totalCost: number | null; totalCpk: number | null; tollSource: string };
export type Order = {
  id: string; reference: string; customer: string; deliveryDate: string; pickupAddress: string; stops: OrderStop[];
  items: { description: string; quantity: number | null; unit: string }[]; cargoWeightKg: number | null; notes: string;
  status: 'assigned' | 'in_transit' | 'completed'; driverId: string; truckId: string; tripId?: string; estimate: OrderEstimate | null;
};
export type Restrictions = { checked: string[]; unknown: string[] };
// tollCost: Google e-toll estimate (0 = no toll roads, null = unknown); tollIncluded: whether totalCost contains it.
export type RouteCost = { maintenanceCost: number | null; fuelCost: number | null; tollCost: number | null; tollIncluded?: boolean; totalCost: number | null; tripCpk: number | null; roughRoadFactor: number | null; factorApplied: boolean };
export type RoadCondition = { pavedKm: number; roughKm: number; unknownKm: number; steepKm: number; ferryKm: number };
export type Provider = 'ors' | 'google' | 'fixture';
export const providerLabel = (p?: Provider | null) => p === 'fixture' ? 'sample routes' : p === 'google' ? 'Google Maps (car roads)' : 'OpenRouteService';
export type RoutePlan = { cost?: RouteCost; roadCondition?: RoadCondition | null; routeId: string; provider: Provider; distanceKm: number; durationMin: number; polyline: [number, number][]; restrictions: Restrictions; explanation: { recommendedRouteId: string | null; headline: string } | null; wasRecommended: boolean; chosenAt: string;
  stops?: { address: string; latitude: number; longitude: number }[]; stopOrder?: number[] | null };
export type Trip = {
  id: string; plate: string; truckId: string; origin: LocationPoint; destination: string; specs: TripSpecs; specsSource?: 'truck' | 'missing'; startOdometer: number; startedAt: string;
  status: 'active' | 'completed'; routing: { status: string; plan?: RoutePlan }; lastLocation?: LocationPoint; pointCount?: number; points?: LocationPoint[];
  gpsDistanceKm: number; maintenanceCpkAtStart: number | null; orderId?: string; orderReference?: string; deliveryStops?: OrderStop[];
  endedAt?: string; endOdometer?: number; odometerDistanceKm?: number; estimatedMaintenanceCost?: number | null;
};
export type AppState = { sampleData: boolean; currentUser: User; trucks: Truck[]; orders: Order[]; trips: Trip[]; analytics: { trucks: { id: string; cpk: number | null }[] } };
export type PreviewStop = { address: string; latitude: number | null; longitude: number | null; geocodeLabel: string | null; geocodePrecision: 'exact' | 'approximate' | null; geocodeSource?: 'google' };
export type RouteCandidate = { cost: RouteCost; roadCondition: RoadCondition | null; id: string; rank: number; distanceKm: number; durationMin: number; polyline: [number, number][]; ascendM: number | null; descendM: number | null; tollIdr: number | null; trafficDurationMin?: number | null; restrictions: Restrictions; warnings: string[]; recommended: boolean };
export type Explanation = { status: 'ok' | 'unavailable' | 'not_configured'; model: string | null; recommendedRouteId: string | null; summary: string; perRoute: { routeId: string; headline: string; pros: string[]; cons: string[] }[]; caveats: string[] };
export type Preview = { recommendation: { routeId: string | null; basis: 'cost' | 'time' | 'only' }; routing: { provider: Provider; status: string; computedAt: string }; origin: { latitude: number; longitude: number }; stops: PreviewStop[]; routes: RouteCandidate[]; explanation: Explanation; stopOrder?: StopOrder };
// Indices into order.stops (or entered destinations) as entered; Preview.stops is already in visiting order.
export type StopOrder = { applied: number[]; suggestion: null | { order: number[]; basis: 'fastest' | 'notes' | 'as_entered'; reason: string; source: 'gemini' | 'google'; minutes: { fastest?: number | null; applied: number | null; suggested: number | null } } };
