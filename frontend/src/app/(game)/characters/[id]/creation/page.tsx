'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { Loading } from '@/components/account/elements';
import { CreationWizard } from '@/components/creation/wizard';
import { CharacterPage } from '@/components/sheet/character-page';
import { SheetHeader } from '@/components/sheet/header';
import { ThemeFrame } from '@/components/sheet/sheet';

export default function CreationPage() {
  const { id } = useParams<{ id: string }>();
  return (
    // L'assistant lit `?campaign=` (retour vers la campagne à la fin)
    <Suspense fallback={<Loading />}>
      <CharacterPage id={id}>
        <div className="space-y-6">
          <SheetHeader page="creation" />
          {/* Plus large que la page (grille des entrées et aperçu côte à côte), comme l'ancienne création */}
          <ThemeFrame className="p-3 sm:p-6 lg:mx-[calc(50%_-_min(47.5vw,50rem))]">
            <CreationWizard />
          </ThemeFrame>
        </div>
      </CharacterPage>
    </Suspense>
  );
}
