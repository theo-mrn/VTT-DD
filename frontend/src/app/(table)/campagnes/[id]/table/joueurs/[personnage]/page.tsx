'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { ChargementOnglet } from '@/components/table/frontiere';

const FicheJoueur = dynamic(
  () => import('@/components/table/onglets/joueurs').then((m) => m.FicheJoueur),
  { loading: () => <ChargementOnglet /> },
);

/** Fiche d'un personnage de la table (lecture, ou modification selon les droits). */
export default function PageFicheJoueur() {
  const { personnage } = useParams<{ personnage: string }>();
  return <FicheJoueur id={personnage} />;
}
