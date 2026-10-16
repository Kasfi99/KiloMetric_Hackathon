import { useEffect, useState } from 'react';
import { api } from './api';
import type { Trip } from './types';

// Trip with its full GPS trail; polled while the screen is open (pollMs 0 = load once).
export function useTripDetail(id: string | null | undefined, pollMs = 30000) {
  const [trip, setTrip] = useState<Trip | null>(null);
  useEffect(() => {
    if (!id) return;
    let alive = true;
    const load = async () => { try { const r = await api<{ trip: Trip }>(`/api/trips/${encodeURIComponent(id)}`); if (alive) setTrip(r.trip); } catch {} };
    load();
    const t = pollMs ? setInterval(load, pollMs) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, [id, pollMs]);
  // A trip loaded for a previous id is never shown for the current one.
  return { trip: trip?.id === id ? trip : null };
}
