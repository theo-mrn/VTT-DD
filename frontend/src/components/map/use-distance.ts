'use client';

/** Distance par case de la scène affichée (docs/carte.md § 4), suivie dans le magasin. */
import { useMemo } from 'react';
import type { DistanceScale } from '@/lib/map/engine/distance';
import { scaleOf } from '@/lib/map/store/map-store';
import { useMapState } from './engine-context';

export function useDistanceScale(): DistanceScale {
  const unitsPerCell = useMapState((s) => scaleOf(s).unitsPerCell);
  const unitName = useMapState((s) => scaleOf(s).unitName);
  return useMemo(() => ({ unitsPerCell, unitName }), [unitsPerCell, unitName]);
}
