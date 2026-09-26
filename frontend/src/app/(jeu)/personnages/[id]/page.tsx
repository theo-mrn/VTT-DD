'use client';

import { useParams } from 'next/navigation';
import { EnTeteFiche } from '@/components/fiche/en-tete';
import { CadreTheme, FicheGeneree } from '@/components/fiche/fiche';
import { PagePersonnage } from '@/components/fiche/page-personnage';

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
