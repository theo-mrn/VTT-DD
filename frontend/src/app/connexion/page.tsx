'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FormulaireConnexion } from '@/components/auth/formulaire-connexion';
import { useSession } from '@/lib/session';

export default function Connexion() {
  const { statut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (statut === 'connecte') router.replace('/profil');
  }, [statut, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0c0c0e] p-4">
      <FormulaireConnexion onConnecte={() => router.replace('/profil')} />
    </main>
  );
}
