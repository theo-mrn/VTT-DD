'use client';

import { useParams } from 'next/navigation';
import { StudioListingPage } from '@/components/marketplace/studio-listing-page';

/** Éditeur d'un pack du créateur. */
export default function MarketplaceStudioListingPage() {
  const { id } = useParams<{ id: string }>();
  return <StudioListingPage id={id} />;
}
