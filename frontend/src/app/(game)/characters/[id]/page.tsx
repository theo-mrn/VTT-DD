'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loading } from '@/components/account/elements';
import { CharacterPage } from '@/components/sheet/character-page';
import { CharacterSheet } from '@/components/sheet/sheet';
import { useResource } from '@/lib/resource';
import { getCampaign } from '@/lib/campaigns';

export default function SheetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Sheet />
    </Suspense>
  );
}

/**
 * Fiche d'un personnage. Ouverte depuis une campagne (`?campaign=`), elle sait si
 * l'utilisateur en est le MJ : il saisit alors les attributs réservés au MJ.
 */
function Sheet() {
  const { id } = useParams<{ id: string }>();
  const campaignId = useSearchParams().get('campaign');
  const campaign = useResource(campaignId ? `campagne:${campaignId}` : null, () =>
    getCampaign(campaignId!),
  );

  return (
    <CharacterPage id={id} gm={campaign.data?.role === 'gm'}>
      {campaignId && campaign.data && (
        <Link
          href={`/campaigns/${encodeURIComponent(campaignId)}/play`}
          className="mb-4 inline-flex items-center gap-1 rounded text-sm text-zinc-400 hover:text-[#c9a965] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c9a965]"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour à la table · {campaign.data.name}
        </Link>
      )}
      <CharacterSheet />
    </CharacterPage>
  );
}
