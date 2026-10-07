'use client';

import { Suspense } from 'react';
import { StudioPage } from '@/components/marketplace/studio-page';

/** Espace du créateur (retour de l'onboarding Stripe : `?connect=return`). */
export default function MarketplaceStudioPage() {
  return (
    <Suspense>
      <StudioPage />
    </Suspense>
  );
}
