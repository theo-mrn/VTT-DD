'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChargementOnglet } from '@/components/table/frontiere';
import { useTable } from '@/components/table/contexte';

/** Arrivée à la table : ma fiche, ou la vue MJ, ou les joueurs pour un spectateur. */
export default function PageTable() {
  const { heros, gm, base } = useTable();
  const router = useRouter();
  useEffect(() => {
    router.replace(`${base}/${heros ? 'fiche' : gm ? 'mj' : 'joueurs'}`);
  }, [router, base, heros, gm]);
  return <ChargementOnglet />;
}
