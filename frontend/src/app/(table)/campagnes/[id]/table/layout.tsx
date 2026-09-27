'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { EcranChargement } from '@/components/shell/ecran-chargement';
import { TableScene } from '@/components/table/table-scene';
import { useProfilRequis } from '@/lib/session';

/**
 * Table de jeu d'une campagne : la scène plein écran (carte au centre, panneaux par-dessus),
 * hors du cadre de l'app. Page protégée : rien
 * n'est rendu avant la session (sinon les hooks qui lisent le profil échouent), et un visiteur
 * non connecté est renvoyé vers la connexion.
 */
export default function LayoutTable({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const profil = useProfilRequis();
  if (!profil) return <EcranChargement />;
  return <TableScene id={id}>{children}</TableScene>;
}
