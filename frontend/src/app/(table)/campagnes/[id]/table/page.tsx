'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ChargementOnglet } from '@/components/table/frontiere';
import { useTable } from '@/components/table/contexte';

/** Arrivée à la table : ma fiche, ou la vue MJ, ou les joueurs pour un spectateur. */
export default function PageTable() {
  const { herosId, gm, base } = useTable();
  const router = useRouter();
  useEffect(() => {
    router.replace(`${base}/${herosId ? 'fiche' : gm ? 'mj' : 'joueurs'}`);
  }, [router, base, herosId, gm]);
  return <ChargementOnglet />;
}
