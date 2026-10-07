import { Suspense } from 'react';
import { titleMetadata } from '@/i18n/metadata';
import { AssistantCampagne } from '@/components/campagnes/assistant-campagne';

export const generateMetadata = titleMetadata('newCampaign');

export default function PageNouvelleCampagne() {
  return (
    <Suspense>
      <AssistantCampagne />
    </Suspense>
  );
}
