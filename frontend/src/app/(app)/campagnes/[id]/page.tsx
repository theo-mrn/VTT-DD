'use client';

import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { SalonCampagne } from '@/components/campagnes/salon';

export default function PageCampagne() {
  const { id } = useParams<{ id: string }>();
  return (
    <Suspense>
      <SalonCampagne id={id} />
    </Suspense>
  );
}
