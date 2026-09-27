'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletDes = dynamic(() => import('@/components/table/onglets/des').then((m) => m.OngletDes), {
  loading: () => <ChargementOnglet />,
});

export default function PageOngletDes() {
  return <OngletDes />;
}
