'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletMj = dynamic(() => import('@/components/table/onglets/mj').then((m) => m.OngletMj), {
  loading: () => <ChargementOnglet />,
});

export default function PageOngletMj() {
  return <OngletMj />;
}
