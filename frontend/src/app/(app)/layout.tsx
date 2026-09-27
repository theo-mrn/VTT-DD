import type { ReactNode } from 'react';
import { CadreApp } from '@/components/shell/cadre-app';

/** Pages connectées : barre latérale, barre haute, palette de commandes. */
export default function LayoutApp({ children }: { children: ReactNode }) {
  return <CadreApp>{children}</CadreApp>;
}
