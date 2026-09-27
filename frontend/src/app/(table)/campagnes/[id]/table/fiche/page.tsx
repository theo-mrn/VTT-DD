'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletFiche = dynamic(
  () => import('@/components/table/onglets/fiche').then((m) => m.OngletFiche),
  {
    loading: () => <ChargementOnglet />,
  },
);

export default function PageOngletFiche() {
  return <OngletFiche />;
}
