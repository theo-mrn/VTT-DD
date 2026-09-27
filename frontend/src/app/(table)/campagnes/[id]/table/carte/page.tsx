'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletCarte = dynamic(
  () => import('@/components/table/onglets/carte').then((m) => m.OngletCarte),
  {
    loading: () => <ChargementOnglet />,
  },
);

export default function PageOngletCarte() {
  return <OngletCarte />;
}
