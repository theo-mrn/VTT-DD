'use client';

import { useNotesSync } from '@/lib/notes';

/** Campagnes suivies en direct au plus (le service temps réel en accepte 20 par connexion). */
const MAX_CAMPAGNES = 15;

function SynchroUne({ campaignId }: { campaignId: string | null }) {
  useNotesSync(campaignId);
  return null;
}

/**
 * Notes tenues à jour en direct : événements de mes campagnes, la plus
 * récemment active d'abord (la campagne de la note ouverte toujours suivie),
 * et mes événements personnels (épingles posées dans un autre onglet).
 */
export function SynchroNotes({
  campagnes,
  prioritaire,
}: Readonly<{
  campagnes: string[];
  prioritaire: string | null;
}>) {
  const suivies = [...new Set([...(prioritaire ? [prioritaire] : []), ...campagnes])].slice(
    0,
    MAX_CAMPAGNES,
  );
  return (
    <>
      <SynchroUne campaignId={null} />
      {suivies.map((id) => (
        <SynchroUne key={id} campaignId={id} />
      ))}
    </>
  );
}
