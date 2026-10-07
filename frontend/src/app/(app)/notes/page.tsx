import { Suspense } from 'react';
import { titleMetadata } from '@/i18n/metadata';
import { EspaceNotes } from '@/components/notes/espace-notes';
import { SqueletteEspace } from '@/components/notes/etats-notes';

export const generateMetadata = titleMetadata('notes');

/** Espace Notes. Les paramètres d'URL (`?note`, `?nouvelle`) exigent une frontière Suspense. */
export default function PageNotes() {
  return (
    <Suspense fallback={<SqueletteEspace />}>
      <EspaceNotes />
    </Suspense>
  );
}
