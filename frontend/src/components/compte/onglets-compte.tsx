'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { estActif, LIENS_COMPTE } from '@/components/shell/navigation';
import { cn } from '@/lib/utils';

/** Onglets des réglages du compte (soulignement sous l'onglet actif). */
export function OngletsCompte() {
  const chemin = usePathname();
  return (
    <nav
      aria-label="Réglages du compte"
      className="-mx-4 mb-8 flex gap-6 overflow-x-auto border-b border-border px-4 no-scrollbar sm:mx-0 sm:px-0"
    >
      {LIENS_COMPTE.map((l) => {
        const actif = estActif(l, chemin);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'relative flex h-10 shrink-0 items-center gap-2 text-[13px] font-medium transition-colors',
              actif ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <l.icone className={cn('size-4', actif ? 'text-primary' : 'text-subtle')} />
            {l.label}
            {actif && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
