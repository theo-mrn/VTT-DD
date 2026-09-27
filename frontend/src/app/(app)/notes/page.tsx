import type { Metadata } from 'next';
import { Suspense } from 'react';
import { EspaceNotes } from '@/components/notes/espace-notes';
import { SqueletteEspace } from '@/components/notes/etats-notes';

export const metadata: Metadata = { title: 'Notes' };

/** Espace Notes. Les paramètres d'URL (`?note`, `?nouvelle`) exigent une frontière Suspense. */
export default function PageNotes() {
  return (
    <Suspense fallback={<SqueletteEspace />}>
      <EspaceNotes />
    </Suspense>
  );
}
