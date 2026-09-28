'use client';

import { SoundPanel } from '@/components/audio/sound-panel';
import { useTable } from '../contexte';

/** Son : lecture de la table, mon mixeur ; bibliothèque, playlists et catalogue pour le MJ. */
export function OngletSon() {
  const { campagne, gm } = useTable();
  return <SoundPanel campaignId={campagne.id} systemId={campagne.system} gm={gm} />;
}
