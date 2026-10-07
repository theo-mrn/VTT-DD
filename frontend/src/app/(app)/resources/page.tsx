import { Suspense } from 'react';
import { titleMetadata } from '@/i18n/metadata';
import { Page } from '@/components/commun/page';
import { ResourcesPage } from '@/components/resources/resources-page';
import { ListSkeleton } from '@/components/resources/parts';

export const generateMetadata = titleMetadata('resources');

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
