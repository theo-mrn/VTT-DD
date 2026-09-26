'use client';

import { useParams } from 'next/navigation';
import { AssistantCreation } from '@/components/sheet/creation/assistant';
import { EnTeteFiche } from '@/components/sheet/header';
import { CadreTheme } from '@/components/sheet/sheet';
import { PagePersonnage } from '@/components/sheet/character-page';

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
