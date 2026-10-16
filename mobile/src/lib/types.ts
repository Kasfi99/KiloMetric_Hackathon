// API shapes from design.md §4 (the binding contract). Unlisted server fields are ignored.
export type LocationPoint = { latitude: number; longitude: number; accuracy: number; timestamp: number };
export type Hazmat = 'none' | 'flammable' | 'explosive' | 'other';
export type TruckSpecs = { heightM: number; widthM: number; lengthM: number; axles: number; tareKg: number; maxGrossKg: number; loadKg: number; hazmat: Hazmat; grossKg?: number };
export type User = { id: string; name: string; email: string; role: 'admin' | 'manager' | 'workshop' | 'driver'; active: boolean; assignedTruckIds: string[] };
export type Truck = { id: string; plate: string; model: string; duty: string; odometer: number; specifications?: TruckSpecs };
export type OrderStop = { recipient: string; address: string; contact: string; notes: string };
export type OrderEstimate = { distanceKm: number | null; maintenanceCost: number | null; fuelCost: number | null; tollCost: number | null; totalCost: number | null; totalCpk: number | null; tollSource: string };
export type Order = {
  id: string; reference: string; customer: string; deliveryDate: string; pickupAddress: string; stops: OrderStop[];
  items: { description: string; quantity: number | null; unit: string }[]; cargoWeightKg: number | null; notes: string;
  status: 'assigned' | 'in_transit' | 'completed'; driverId: string; truckId: string; tripId?: string; estimate: OrderEstimate | null;
};
export type Restrictions = { checked: string[]; unknown: string[] };
export type RouteCost = { maintenanceCost: number | null; fuelCost: number | null; tollCost: null; totalCost: number | null; tripCpk: number | null; roughRoadFactor: number | null; factorApplied: boolean };
export type RoadCondition = { pavedKm: number; roughKm: number; unknownKm: number; steepKm: number; ferryKm: number };
export type RoutePlan = { cost?: RouteCost; roadCondition?: RoadCondition | null; routeId: string; provider: 'ors' | 'fixture'; distanceKm: number; durationMin: number; polyline: [number, number][]; restrictions: Restrictions; explanation: { recommendedRouteId: string | null; headline: string } | null; wasRecommended: boolean; chosenAt: string };
export type Trip = {
  id: string; plate: string; truckId: string; origin: LocationPoint; destination: string; specs: TruckSpecs; startOdometer: number; startedAt: string;
  status: 'active' | 'completed'; routing: { status: string; plan?: RoutePlan }; lastLocation?: LocationPoint; pointCount?: number; points?: LocationPoint[];
  gpsDistanceKm: number; maintenanceCpkAtStart: number | null; orderId?: string; orderReference?: string; deliveryStops?: OrderStop[];
  endedAt?: string; endOdometer?: number; odometerDistanceKm?: number; estimatedMaintenanceCost?: number | null;
};
export type AppState = { sampleData: boolean; currentUser: User; trucks: Truck[]; orders: Order[]; trips: Trip[]; analytics: { trucks: { id: string; cpk: number | null }[] } };
export type PreviewStop = { address: string; latitude: number | null; longitude: number | null; geocodeLabel: string | null; geocodePrecision: 'exact' | 'approximate' | null };
export type RouteCandidate = { cost: RouteCost; roadCondition: RoadCondition | null; id: string; rank: number; distanceKm: number; durationMin: number; polyline: [number, number][]; ascendM: number | null; descendM: number | null; tollIdr: null; restrictions: Restrictions; warnings: string[]; recommended: boolean };
export type Explanation = { status: 'ok' | 'unavailable' | 'not_configured'; model: string | null; recommendedRouteId: string | null; summary: string; perRoute: { routeId: string; headline: string; pros: string[]; cons: string[] }[]; caveats: string[] };
export type Preview = { recommendation: { routeId: string | null; basis: 'cost' | 'time' | 'only' }; routing: { provider: 'ors' | 'fixture'; status: string; computedAt: string }; origin: { latitude: number; longitude: number }; stops: PreviewStop[]; routes: RouteCandidate[]; explanation: Explanation };
