'use client';

import { useParams } from 'next/navigation';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';

export default function PagePersonnage() {
  const { id } = useParams<{ id: string }>();
  return <FichePersonnage id={id} />;
}
