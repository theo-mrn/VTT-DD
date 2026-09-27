'use client';

import { useParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { CadreTable } from '@/components/table/cadre-table';

/** Table de jeu d'une campagne : son propre cadre (en-tête, onglets), hors du cadre de l'app. */
export default function LayoutTable({ children }: { children: ReactNode }) {
  const { id } = useParams<{ id: string }>();
  return <CadreTable id={id}>{children}</CadreTable>;
}
