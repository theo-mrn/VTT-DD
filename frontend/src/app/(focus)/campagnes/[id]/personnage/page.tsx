'use client';

import { useParams } from 'next/navigation';
import { ChoixHeros } from '@/components/personnages/choix-heros';

export default function PageChoixHeros() {
  const { id } = useParams<{ id: string }>();
  return <ChoixHeros campagneId={id} />;
}
