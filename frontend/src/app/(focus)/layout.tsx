import type { ReactNode } from 'react';
import { CadreFocus } from '@/components/shell/cadre-focus';

/** Pages plein écran : onboarding, assistants de création, choix du héros. */
export default function LayoutFocus({ children }: Readonly<{ children: ReactNode }>) {
  return <CadreFocus>{children}</CadreFocus>;
}
