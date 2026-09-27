'use client';

import { Suspense } from 'react';
import { EspaceNotes } from '@/components/notes/espace-notes';
import { SqueletteEspace } from '@/components/notes/etats-notes';
import { useTable } from '../contexte';

/** Notes : celles de la campagne seulement ; une nouvelle note y est créée. */
export function OngletNotes() {
  const { campagne, base } = useTable();
  return (
    <Suspense fallback={<SqueletteEspace />}>
      <EspaceNotes campagne={campagne.id} base={`${base}/notes`} />
    </Suspense>
  );
}
