import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AssistantCampagne } from '@/components/campagnes/assistant-campagne';

export const metadata: Metadata = { title: 'Nouvelle campagne' };

export default function PageNouvelleCampagne() {
  return (
    <Suspense>
      <AssistantCampagne />
    </Suspense>
  );
}
