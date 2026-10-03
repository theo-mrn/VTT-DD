import type { ReactNode } from 'react';
import { Page } from '@/components/commun/page';

/** Pages de compte (profil, sécurité, amis, clés d'API, profils de joueurs). */
export default function LayoutCompte({ children }: Readonly<{ children: ReactNode }>) {
  return <Page>{children}</Page>;
}
