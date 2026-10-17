import { useEffect, useState } from 'react';
import { KEYS, readJson } from './storage';
import type { LocationPoint } from './types';

// Latest GPS fix stored by getFreshPoint, the trip watcher and the background task. Read-only: starts no tracking.
// Read on mount, then polled, because the background task writes storage without telling the UI.
export function useLastFix(pollMs = 5000) {
  const [fix, setFix] = useState<LocationPoint | null>(null);
  useEffect(() => {
    let live = true;
    const read = async () => { const p = await readJson<LocationPoint | null>(KEYS.lastFix, null); if (live) setFix(prev => (prev?.timestamp === p?.timestamp ? prev : p)); };
    read();
    const t = setInterval(read, pollMs);
    return () => { live = false; clearInterval(t); };
  }, [pollMs]);
  return fix;
}
