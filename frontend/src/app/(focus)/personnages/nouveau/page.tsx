import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AssistantPersonnage } from '@/components/creation/assistant-personnage';

export const metadata: Metadata = { title: 'Nouveau personnage' };

export default function PageNouveauPersonnage() {
  return (
    <Suspense>
      <AssistantPersonnage />
    </Suspense>
  );
}
