'use client';

import type { ReactNode } from 'react';
import { Loading } from '@/components/account/elements';
import { AccountNav } from '@/components/account/account-nav';
import { CampaignsBackground } from '@/components/campaigns/elements';
import { useRequiredProfile } from '@/lib/session';

/**
 * Campagnes (mes campagnes, créer, rejoindre, campagne, personnages, table) :
 * réservées aux joueurs connectés, sur le fond de l'ancienne app.
 */
export default function CampaignsLayout({ children }: { children: ReactNode }) {
  const profile = useRequiredProfile();

  return (
    <CampaignsBackground>
      <AccountNav />
      {profile ? children : <Loading />}
    </CampaignsBackground>
  );
}
