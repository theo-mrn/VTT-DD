import { Suspense } from 'react';
import { titleMetadata } from '@/i18n/metadata';
import { ParcoursOnboarding } from '@/components/onboarding/parcours';

export const generateMetadata = titleMetadata('welcome');

export default function PageBienvenue() {
  return (
    <Suspense>
      <ParcoursOnboarding />
    </Suspense>
  );
}
