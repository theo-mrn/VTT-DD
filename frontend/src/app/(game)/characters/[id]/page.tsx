'use client';

import { useParams } from 'next/navigation';
import { EnTeteFiche } from '@/components/sheet/header';
import { CadreTheme, FicheGeneree } from '@/components/sheet/sheet';
import { PagePersonnage } from '@/components/sheet/character-page';

export default function PageFiche() {
  const { id } = useParams<{ id: string }>();
  return (
    <PagePersonnage id={id}>
      <div className="space-y-6">
        <EnTeteFiche page="fiche" />
        <CadreTheme>
          <FicheGeneree />
        </CadreTheme>
      </div>
    </PagePersonnage>
  );
}
