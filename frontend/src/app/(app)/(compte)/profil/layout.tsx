import type { ReactNode } from 'react';
import { OngletsCompte } from '@/components/compte/onglets-compte';

/** Réglages du compte : onglets communs au profil, à la sécurité et aux clés d'API. */
export default function LayoutReglages({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <OngletsCompte />
      {children}
    </>
  );
}
