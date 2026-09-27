'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { X } from 'lucide-react';
import { Suspense, useEffect, useRef, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { ChargementOnglet, FrontiereTable } from '../frontiere';
import { PanelVisibleProvider } from './navigation';
import type { PanelId, PanelWidth, TablePanel } from './registry';
import { usePanelStore } from './store';

/** Largeur sur grand écran ; sur mobile, tout panneau occupe l'écran au-dessus du dock. */
const WIDTH: Record<PanelWidth, string> = {
  compact: 'lg:w-[min(34rem,calc(100vw-7rem))]',
  narrow: 'lg:w-[26rem]',
  medium: 'lg:w-[min(40rem,calc(100vw-6rem))]',
  wide: 'lg:w-[min(60rem,calc(100vw-6rem))]',
  full: 'lg:w-[min(72rem,calc(100vw-6rem))]',
};

const VARIANTS: Record<TablePanel['mode'], Variants> = {
  side: {
    open: { opacity: 1, x: 0, visibility: 'visible' },
    closed: { opacity: 0, x: -16, transitionEnd: { visibility: 'hidden' } },
  },
  floating: {
    open: { opacity: 1, x: 0, visibility: 'visible' },
    closed: { opacity: 0, x: -12, transitionEnd: { visibility: 'hidden' } },
  },
  centered: {
    open: { opacity: 1, scale: 1, y: 0, visibility: 'visible' },
    closed: { opacity: 0, scale: 0.98, y: 8, transitionEnd: { visibility: 'hidden' } },
  },
};

export const panelDomId = (id: PanelId) => `table-panel-${id}`;

/**
 * Hôte des panneaux : chacun est monté à sa première ouverture, puis gardé (masqué, inerte)
 * pour conserver son état. Un seul est visible à la fois.
 */
export function PanelHost({ panels }: { panels: TablePanel[] }) {
  const active = usePanelStore((s) => s.active);
  const mounted = usePanelStore((s) => s.mounted);
  return (
    <>
      {mounted.map((id) => {
        const panel = panels.find((p) => p.id === id);
        return panel ? <PanelFrame key={id} panel={panel} visible={active === id} /> : null;
      })}
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

function PanelFrame({ panel, visible }: { panel: TablePanel; visible: boolean }) {
  const close = usePanelStore((s) => s.close);
  const reduit = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const retour = useRef<HTMLElement | null>(null);
  const centered = panel.mode === 'centered';
  const titreId = `${panelDomId(panel.id)}-titre`;

  // Ouverture : le focus entre dans le panneau ; fermeture : il revient d'où il venait
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visible) {
      const avant = document.activeElement;
      retour.current = avant instanceof HTMLElement && !el.contains(avant) ? avant : null;
      if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
      return;
    }
    if (el.contains(document.activeElement)) {
      const cible = retour.current;
      if (cible?.isConnected) cible.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur();
    }
  }, [visible]);

  // Fenêtre centrée : Tab tourne dans le panneau
  const pieger = (e: KeyboardEvent<HTMLElement>) => {
    if (!centered || e.key !== 'Tab' || !ref.current) return;
    const focusables = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.offsetParent !== null,
    );
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];
    if (!premier || !dernier) {
      e.preventDefault();
      return;
    }
    if (
      e.shiftKey &&
      (document.activeElement === premier || document.activeElement === ref.current)
    ) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  const Icone = panel.icon;
  const cadre = (
    <motion.section
      ref={ref}
      id={panelDomId(panel.id)}
      data-table-panel={panel.id}
      role={centered ? 'dialog' : 'region'}
      aria-modal={centered || undefined}
      aria-labelledby={titreId}
      tabIndex={-1}
      inert={!visible}
      onKeyDown={pieger}
      variants={VARIANTS[panel.mode]}
      initial="closed"
      animate={visible ? 'open' : 'closed'}
      transition={reduit ? { duration: 0 } : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'flex flex-col bg-background text-foreground shadow-elevated outline-none',
        centered
          ? 'pointer-events-auto relative size-full lg:h-auto lg:max-h-full lg:rounded-2xl lg:border lg:border-border-strong'
          : panel.mode === 'floating'
            ? 'fixed inset-x-0 top-0 bottom-[var(--table-dock-h)] z-40 lg:inset-x-auto lg:bottom-auto lg:left-[5.75rem] lg:top-3 lg:max-h-[calc(100dvh-1.5rem)] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border-strong'
            : 'fixed inset-x-0 top-0 bottom-[var(--table-dock-h)] z-40 lg:inset-x-auto lg:bottom-0 lg:left-20 lg:border-x lg:border-border',
        WIDTH[panel.width],
      )}
    >
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Icone className="size-4" aria-hidden />
          </span>
          <h2 id={titreId} className="min-w-0 flex-1 truncate text-[15px] font-semibold">
            {panel.label}
          </h2>
          <Kbd className="hidden lg:inline-flex" aria-hidden>
            {panel.shortcut.label}
          </Kbd>
          <Info
            texte={
              <span className="flex items-center gap-2">
                Fermer <Kbd>Échap</Kbd>
              </span>
            }
          >
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={close}
              aria-label={`Fermer ${panel.label}`}
              aria-keyshortcuts="Escape"
            >
              <X />
            </Button>
          </Info>
        </header>
        <PanelVisibleProvider value={visible}>
          <FrontiereTable nom={panel.label}>
            <Suspense fallback={<ChargementOnglet />}>
              <panel.component />
            </Suspense>
          </FrontiereTable>
        </PanelVisibleProvider>
      </div>
    </motion.section>
  );

  if (!centered) return cadre;
  return (
    <div
      className={cn(
        'fixed inset-x-0 top-0 bottom-[var(--table-dock-h)] z-50 flex items-center justify-center lg:bottom-0 lg:p-8',
        !visible && 'pointer-events-none',
      )}
    >
      <motion.div
        aria-hidden
        onClick={close}
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: reduit ? 0 : 0.2 }}
        className={cn(
          'absolute inset-0 bg-background/70 backdrop-blur-sm',
          !visible && 'pointer-events-none',
        )}
      />
      {cadre}
    </div>
  );
}
