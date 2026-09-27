'use client';

import dynamic from 'next/dynamic';
import { ChargementOnglet } from '@/components/table/frontiere';

const OngletNotes = dynamic(
  () => import('@/components/table/onglets/notes').then((m) => m.OngletNotes),
  {
    loading: () => <ChargementOnglet />,
  },
);

export default function PageOngletNotes() {
  return <OngletNotes />;
}
