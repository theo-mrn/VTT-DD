'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ListingPage } from '@/components/marketplace/listing-page';

/** Fiche d'un pack, par son adresse lisible. */
export default function MarketplaceListingPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Suspense>
      <ListingPage slug={slug} />
    </Suspense>
  );
}
