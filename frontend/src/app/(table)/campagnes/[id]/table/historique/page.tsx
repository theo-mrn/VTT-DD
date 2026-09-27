'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletHistorique = dynamic(
  () => import('@/components/table/onglets/historique').then((m) => m.OngletHistorique),
  {
    loading: () => <ChargementOnglet />,
  },
);

export default function PageOngletHistorique() {
  return <OngletHistorique />;
}
