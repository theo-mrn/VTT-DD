'use client';

import { useParams } from 'next/navigation';
import { CreatorPage } from '@/components/marketplace/creator-page';

/** Page publique d'un créateur. */
export default function MarketplaceCreatorPage() {
  const { slug } = useParams<{ slug: string }>();
  return <CreatorPage slug={slug} />;
}
