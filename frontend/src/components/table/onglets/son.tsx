'use client';

import { SoundPanel } from '@/components/audio/sound-panel';
import { useTable } from '../contexte';

/** Son (MJ) : lecture de la table, bibliothèque, playlists, effets et son volume. */
export function OngletSon() {
  const { campagne } = useTable();
  return <SoundPanel campaignId={campagne.id} systemId={campagne.system} />;
}
