import { Suspense } from 'react';
import { titleMetadata } from '@/i18n/metadata';
import { NouveauPersonnage } from '@/components/creation/nouveau-personnage';

export const generateMetadata = titleMetadata('newCharacter');

export default function PageNouveauPersonnage() {
  return (
    <Suspense>
      <NouveauPersonnage />
    </Suspense>
  );
}
