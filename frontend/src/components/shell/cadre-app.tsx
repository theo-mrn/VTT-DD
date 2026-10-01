'use client';

import { ChevronsRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { DiceThrowerHost } from '@/components/dice/thrower-host';
import { Dialog, SheetContent, DialogTitle } from '@/components/ui/dialog';
import { Info } from '@/components/ui/tooltip';
import { onboardingTermine } from '@/lib/onboarding';
import { usePreferenceLocale } from '@/lib/preference-locale';
import { useProfilRequis } from '@/lib/session';
import { cn } from '@/lib/utils';
import { BarreHaute } from './barre-haute';
import { BarreLaterale } from './barre-laterale';
import { estActif, NAV_PRINCIPALE } from './navigation';
import { PaletteCommandes } from './palette-commandes';
import { EcranChargement } from './ecran-chargement';

/**
 * Cadre des pages connectées : barre latérale (repliable), barre haute,
 * navigation mobile en bas, palette ⌘K. Un nouveau compte passe d'abord par
 * l'onboarding.
 */
export function CadreApp({ children }: { children: ReactNode }) {
  const profil = useProfilRequis();
  const router = useRouter();
  const chemin = usePathname();
  const [repliee, setRepliee] = usePreferenceLocale('barre-repliee', false);
  const [menuMobile, setMenuMobile] = useState(false);
  const [palette, setPalette] = useState(false);
  const aOnboarder = profil !== null && !onboardingTermine(profil);

  useEffect(() => {
    if (aOnboarder) router.replace(`/bienvenue?${new URLSearchParams({ suite: chemin })}`);
  }, [aOnboarder, router, chemin]);

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', clavier);
    return () => window.removeEventListener('keydown', clavier);
  }, []);

  if (!profil || aOnboarder) return <EcranChargement />;

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Barre latérale fixe (grand écran) */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-surface/60 transition-[width] duration-200 ease-out lg:block',
          repliee ? 'w-[68px]' : 'w-[248px]',
        )}
      >
        <BarreLaterale
          repliee={repliee}
          onReplier={() => setRepliee(true)}
          onRecherche={() => setPalette(true)}
        />
        {repliee && (
          <Info texte="Déplier le menu" cote="right">
            <button
              type="button"
              onClick={() => setRepliee(false)}
              className="absolute -right-3 top-[18px] z-10 flex size-6 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-subtle shadow-surface transition-colors hover:text-foreground"
            >
              <ChevronsRight className="size-3.5" />
              <span className="sr-only">Déplier le menu</span>
            </button>
          </Info>
        )}
      </aside>

      {/* Menu mobile */}
      <Dialog open={menuMobile} onOpenChange={setMenuMobile}>
        <SheetContent cote="left" className="w-[280px] bg-surface p-0">
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <BarreLaterale
            onRecherche={() => {
              setMenuMobile(false);
              setPalette(true);
            }}
            onNavigue={() => setMenuMobile(false)}
          />
        </SheetContent>
      </Dialog>

      <div className="flex min-w-0 flex-1 flex-col">
        <BarreHaute onMenu={() => setMenuMobile(true)} onRecherche={() => setPalette(true)} />
        <main className="flex-1 pb-24 lg:pb-0">{children}</main>
      </div>

      <NavMobile chemin={chemin} />
      <PaletteCommandes ouverte={palette} onOuverte={setPalette} />
      {/* Dés 3D de toute l'app (table, lanceur rapide, boutique), chargés au premier lancer */}
      <DiceThrowerHost />
    </div>
  );
}

function NavMobile({ chemin }: { chemin: string }) {
  return (
    <nav
      aria-label="Navigation"
      className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-border-strong bg-popover/95 px-1 py-1.5 shadow-elevated lg:hidden"
    >
      {NAV_PRINCIPALE.map((l) => {
        const actif = estActif(l, chemin);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={actif ? 'page' : undefined}
            className={cn(
              'flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-colors',
              actif ? 'text-primary' : 'text-subtle',
            )}
          >
            <l.icone className="size-5" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
