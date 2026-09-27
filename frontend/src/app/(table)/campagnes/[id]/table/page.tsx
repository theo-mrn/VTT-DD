'use client';

import { useTable } from '@/components/table/contexte';
import { MapStage } from '@/components/table/map-stage';

/** La table : la carte au centre, les panneaux s'ouvrent par-dessus (cadre de la table). */
export default function PageTable() {
  const { campagne } = useTable();
  return <MapStage backdropUrl={campagne.coverUrl} seed={campagne.name} />;
}
