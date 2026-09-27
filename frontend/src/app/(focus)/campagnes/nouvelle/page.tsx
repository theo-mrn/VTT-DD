import type { Metadata } from 'next';
import { AssistantCampagne } from '@/components/campagnes/assistant-campagne';

export const metadata: Metadata = { title: 'Nouvelle campagne' };

export default function PageNouvelleCampagne() {
  return <AssistantCampagne />;
}
