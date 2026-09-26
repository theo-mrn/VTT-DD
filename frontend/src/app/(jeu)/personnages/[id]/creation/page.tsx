'use client';

import { useParams } from 'next/navigation';
import { AssistantCreation } from '@/components/fiche/creation/assistant';
import { EnTeteFiche } from '@/components/fiche/en-tete';
import { CadreTheme } from '@/components/fiche/fiche';
import { PagePersonnage } from '@/components/fiche/page-personnage';

export default function PageCreation() {
  const { id } = useParams<{ id: string }>();
  return (
    <PagePersonnage id={id}>
      <div className="space-y-6">
        <EnTeteFiche page="creation" />
        <CadreTheme>
          <AssistantCreation />
        </CadreTheme>
      </div>
    </PagePersonnage>
  );
}
