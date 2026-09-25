'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useSession } from '@/lib/session';

export default function Accueil() {
  const { statut } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (statut === 'connecte') router.replace('/profil');
    if (statut === 'anonyme') router.replace('/connexion');
  }, [statut, router]);

  return <p className="p-8 text-texte-doux">Chargement…</p>;
}
