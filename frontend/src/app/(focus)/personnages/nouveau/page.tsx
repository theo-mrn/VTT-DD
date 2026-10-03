import type { Metadata } from 'next';
import { Suspense } from 'react';
import { NouveauPersonnage } from '@/components/creation/nouveau-personnage';

export const metadata: Metadata = { title: 'Nouveau personnage' };

export default function PageNouveauPersonnage() {
  return (
    <Suspense>
      <NouveauPersonnage />
    </Suspense>
  );
}
