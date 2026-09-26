'use client';

import type { ReactNode } from 'react';
import { Loading } from '@/components/account/elements';
import { AccountNav } from '@/components/account/account-nav';
import { RoomsBackground } from '@/components/campaigns/elements';
import { useRequiredProfile } from '@/lib/session';

/**
 * Campagnes (mes campagnes, créer, rejoindre, salle, personnages, table) :
 * réservées aux joueurs connectés, sur le fond de l'ancienne app.
 */
export default function RoomsLayout({ children }: { children: ReactNode }) {
  const profile = useRequiredProfile();

  return (
    <RoomsBackground>
      <AccountNav />
      {profile ? children : <Loading />}
    </RoomsBackground>
  );
}
