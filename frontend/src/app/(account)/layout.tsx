'use client';

import type { ReactNode } from 'react';
import { Loading } from '@/components/account/elements';
import { AccountNav } from '@/components/account/account-nav';
import { useRequiredProfile } from '@/lib/session';

/**
 * Pages de compte (profil, sécurité, amis, clés d'API, profils de joueurs) :
 * réservées aux joueurs connectés, avec une navigation commune.
 */
export default function AccountLayout({ children }: { children: ReactNode }) {
  const profile = useRequiredProfile();

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-zinc-200">
      <AccountNav />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        {profile ? children : <Loading />}
      </main>
    </div>
  );
}
