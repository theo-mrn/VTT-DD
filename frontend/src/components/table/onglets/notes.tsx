'use client';

import { Suspense } from 'react';
import { EspaceNotes } from '@/components/notes/espace-notes';
import { SqueletteEspace } from '@/components/notes/etats-notes';
import { useTable } from '../contexte';
import { usePanelVisible } from '../panels/navigation';
import { TABLE_PARAMS } from '../panels/registry';

/** Notes : celles de la campagne seulement ; une nouvelle note y est créée. */
export function OngletNotes() {
  const { campagne, base } = useTable();
  const visible = usePanelVisible();
  return (
    <Suspense fallback={<SqueletteEspace />}>
      <EspaceNotes
        campagne={campagne.id}
        base={`${base}?${TABLE_PARAMS.panel}=notes`}
        raccourcis={visible}
      />
    </Suspense>
  );
}
