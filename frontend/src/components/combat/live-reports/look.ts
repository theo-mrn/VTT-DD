/**
 * Langage visuel de la barre de combat du MJ et de ses rapports en direct, repris du lanceur de
 * dés (`components/des/lanceur.tsx` : carte, trame de points, halo selon le critique, bouton
 * « Lancer ») et du bandeau de la fiche (`fiche/banner.tsx` : libellés discrets, chiffres en
 * mono, filets). Un seul endroit pour que la barre et la pile restent un même ensemble.
 */
import type { Transition } from 'motion/react';
import type { OutcomeTone } from '@/lib/combat/view';

/**
 * Verre des pièces du HUD (campagne, héros) : la barre et les lignes compactes. Fond presque
 * opaque, sans backdrop-filter : posé sur le canvas de la carte, le flou serait recalculé à
 * chaque image.
 */
export const GLASS = 'rounded-2xl border border-border-strong bg-popover/95 shadow-elevated';

/**
 * Pièce du HUD de la table (campagne, barre de combat, barre du groupe) : une seule géométrie
 * pour qu'elles s'alignent. Arrondis concentriques : pièce 20 px, marge 6 px, commandes de 40 px
 * arrondies à 14 px (`HUD_CONTROL`) : 52 px de haut partout.
 */
export const HUD_BAR = `${GLASS} pointer-events-auto flex items-center gap-1 rounded-[20px] p-1.5`;

/** Commande ou vignette d'une pièce du HUD : 40 px, arrondie à 14 px. */
export const HUD_CONTROL = 'size-10 rounded-[14px]';

/** Carte d'un rapport : la carte du lanceur, posée sur la carte de jeu (verre dense, sans flou). */
export const CARD =
  'relative isolate overflow-hidden rounded-2xl border border-border-strong bg-card/95 shadow-elevated';

/** Libellé discret au-dessus d'un chiffre (bandeau de la fiche). */
export const LABEL = 'text-[11px] font-medium uppercase tracking-wider text-subtle';

/** Bouton principal, celui du lanceur (« Lancer ») : une seule action forte par carte. */
export const CTA =
  'rounded-xl text-xs font-bold uppercase tracking-wide shadow-glow hover:bg-primary-strong active:scale-95 disabled:shadow-none motion-reduce:active:scale-100 [@media(pointer:coarse)]:h-11';

/** Bouton secondaire du lanceur (« Vider ») : même casse, sans poids. */
export const QUIET =
  'rounded-lg border border-border bg-background/40 text-[11px] font-bold uppercase tracking-wide text-muted-foreground shadow-none hover:bg-surface-3 hover:text-foreground [@media(pointer:coarse)]:h-11';

/** Cible tactile : 44 px au doigt (lanceur). */
export const TOUCH = '[@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:min-w-11';

/** Ressort court et sobre : une carte sort de la barre et se pose, sans rebond appuyé. */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 };

/** Apparition d'un chiffre, celle du total du lanceur (`TotalJet`). */
export const NUMBER_SPRING: Transition = { type: 'spring', stiffness: 320, damping: 22 };

/** Sortie : plus courte que l'entrée. */
export const EXIT: Transition = { duration: 0.16, ease: [0.4, 0, 1, 1] };

/** Liseré de gauche (ancienne app) : l'issue d'un coup d'œil. */
export const RAIL: Record<OutcomeTone | 'progress', string> = {
  success: 'bg-success',
  critical: 'bg-primary',
  failure: 'bg-border-strong',
  fumble: 'bg-destructive',
  neutral: 'bg-primary/60',
  progress: 'bg-warning',
};

/** Halo du coin haut gauche, dosé comme celui du lanceur selon le critique. */
export function washOf(tone: OutcomeTone | 'progress'): string | undefined {
  const glow = (token: string, alpha: number) =>
    `radial-gradient(90% 110% at 0% 0%, hsl(var(--${token}) / ${alpha}), transparent 70%)`;
  switch (tone) {
    case 'critical':
      return glow('primary', 0.2);
    case 'fumble':
      return glow('destructive', 0.14);
    case 'success':
      return glow('success', 0.1);
    case 'progress':
      return glow('warning', 0.08);
    case 'neutral':
      return glow('primary', 0.08);
    default:
      return undefined;
  }
}
