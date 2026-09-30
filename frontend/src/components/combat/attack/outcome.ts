/**
 * Issue d'un jet d'attaque à l'écran (docs/combat.md § 12.1) : couleur et icône de Touché, Raté,
 * Critique, Échec critique (jamais la couleur seule : l'icône et le mot la doublent), et les
 * dés d'un jet au format du lanceur de dés (`DesDuJet`).
 */
import type { NumericRoll } from '@vtt/contracts';
import { Check, Crown, Dices, Skull, X, type LucideIcon } from 'lucide-react';
import type { Critique, GroupeDes } from '@/lib/jets';
import type { OutcomeTone } from '@/lib/combat/view';

export const OUTCOME_STYLE: Record<
  OutcomeTone,
  {
    /** Couleur du mot (dégradé doré du lanceur pour un critique). */
    text: string;
    /** Couleur de l'icône et des filets. */
    tint: string;
    icon: LucideIcon;
    /** Variable HSL du halo de l'écran. */
    glow: string;
    /** Critique au sens du lanceur de dés (couleur du total). */
    critique: Critique;
  }
> = {
  success: {
    text: 'text-success',
    tint: 'text-success',
    icon: Check,
    glow: '--success',
    critique: null,
  },
  critical: {
    text: 'text-gradient-primary',
    tint: 'text-primary',
    icon: Crown,
    glow: '--primary',
    critique: 'success',
  },
  fumble: {
    text: 'text-destructive',
    tint: 'text-destructive',
    icon: Skull,
    glow: '--destructive',
    critique: 'failure',
  },
  failure: {
    text: 'text-destructive',
    tint: 'text-destructive',
    icon: X,
    glow: '--destructive',
    critique: null,
  },
  neutral: {
    text: 'text-muted-foreground',
    tint: 'text-muted-foreground',
    icon: Dices,
    glow: '--primary',
    critique: null,
  },
};

/** Dés d'un jet numérique, groupés comme le lanceur les affiche. */
export const rollGroups = (roll: NumericRoll): GroupeDes[] =>
  roll.dice.map((g) => ({
    faces: g.faces,
    total: g.values.filter((v) => v.kept).reduce((s, v) => s + v.value, 0),
    dice: g.values.map((v) => ({ value: v.value, kept: v.kept, exploded: v.exploded })),
  }));
