import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ParcoursOnboarding } from '@/components/onboarding/parcours';

export const metadata: Metadata = { title: 'Bienvenue' };

export default function PageBienvenue() {
  return (
    <Suspense>
      <ParcoursOnboarding />
    </Suspense>
  );
}
