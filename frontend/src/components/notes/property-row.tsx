'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Ligne de propriété façon base de données : libellé à gauche, valeur éditable à droite. */
export function Ligne({
  icone: Icone,
  label,
  children,
}: Readonly<{
  icone: LucideIcon;
  label: string;
  children: ReactNode;
}>) {
  return (
    <div className="flex min-h-9 items-start gap-2">
      <div className="flex h-9 w-[104px] shrink-0 items-center gap-2 text-[13px] text-subtle sm:w-32">
        <Icone className="size-3.5 shrink-0" aria-hidden />
        {label}
      </div>
      <div className="flex min-h-9 min-w-0 flex-1 items-center">{children}</div>
    </div>
  );
}

/** Déclencheur d'une valeur à choisir (menu). */
export const styleDeclencheur = cn(
  '-ml-2 inline-flex h-8 max-w-full items-center gap-2 rounded-md px-2 text-[13px] text-foreground outline-none transition-colors',
  'hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-surface-2',
  'disabled:pointer-events-none disabled:opacity-60',
);

/** Champ texte en ligne, discret jusqu'au survol. */
export const styleChampLigne = cn(
  '-ml-2 h-8 w-full min-w-0 rounded-md bg-transparent px-2 text-[13px] text-foreground outline-none transition-colors',
  'placeholder:text-subtle/70 hover:bg-surface-2 focus:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50',
  'read-only:hover:bg-transparent read-only:focus:bg-transparent',
);
