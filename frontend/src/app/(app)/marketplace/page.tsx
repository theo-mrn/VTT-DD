'use client';

import { Suspense } from 'react';
import { CatalogPage } from '@/components/marketplace/catalog-page';

/** Catalogue de la marketplace (docs/marketplace.md). */
export default function MarketplacePage() {
  return (
    <Suspense>
      <CatalogPage />
    </Suspense>
  );
}
