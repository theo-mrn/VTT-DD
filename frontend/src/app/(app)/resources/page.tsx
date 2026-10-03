import type { Metadata } from 'next';
import { Suspense } from 'react';
import { Page } from '@/components/commun/page';
import { ResourcesPage } from '@/components/resources/resources-page';
import { ListSkeleton } from '@/components/resources/parts';

export const metadata: Metadata = { title: 'Ressources' };

/** Ressources d'un système de jeu. Les paramètres d'URL (`?system`, `?onglet`) exigent Suspense. */
export default function PageResources() {
  return (
    <Suspense
      fallback={
        <Page large>
          <ListSkeleton />
        </Page>
      }
    >
      <ResourcesPage />
    </Suspense>
  );
}
