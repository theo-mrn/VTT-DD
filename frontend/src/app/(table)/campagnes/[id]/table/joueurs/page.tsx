'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletJoueurs = dynamic(
  () => import('@/components/table/onglets/joueurs').then((m) => m.OngletJoueurs),
  {
    loading: () => <ChargementOnglet />,
  },
);

export default function PageOngletJoueurs() {
  return <OngletJoueurs />;
}
