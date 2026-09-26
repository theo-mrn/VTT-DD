'use client';

/**
 * Carte d'une caractéristique (attribut de base) pendant la création :
 * valeur ou modificateur en grand, puis le calcul « Base + effets = Score »
 * lu dans l'explication de la fiche. Le pied reçoit les commandes de l'étape
 * (achat, répartition, affectation d'un tirage).
 */
import type { Attribut } from '@vtt/rules';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { formatNumber, formatSign, formatValue } from '../sheet/format';
import { text, textAccent, textMuted, titleFont } from '../sheet/styles';

export function StatCard({
  attribute,
  footer,
  highlight,
  base: baseOverride,
}: {
  attribute: Attribut;
  footer?: ReactNode;
  highlight?: boolean;
  /** Valeur de base en cours de saisie (pas encore enregistrée). */
  base?: number;
}) {
  const { sheet, json } = useSheet();
  const computed = json.valeurs[attribute.cle];
  const detail = (sheet.valeurs.get(attribute.cle)?.detail ?? []).filter((l) => !l.ignore);
  const baseLine = detail.find((l) => l.operation === 'base');
  const savedBase = typeof baseLine?.valeur === 'number' ? baseLine.valeur : undefined;
  const edited = baseOverride !== undefined && baseOverride !== savedBase;
  const base = baseOverride ?? savedBase;
  // Saisie en cours : les effets restent ceux de la fiche, appliqués à la nouvelle base
  const value =
    edited && typeof computed?.valeur === 'number' && savedBase !== undefined
      ? computed.valeur - savedBase + baseOverride
      : computed?.valeur;
  const modifier = edited ? undefined : computed?.modificateur;
  const effects = detail.filter((l) => l.operation !== 'base' && l.operation !== 'formule');
  const delta = typeof value === 'number' && base !== undefined ? value - base : undefined;
  const effectLabel = effects.length === 1 ? effects[0]!.nom : 'Effets';

  return (
    <div
      className={cn(
        'group relative flex flex-col items-center overflow-hidden rounded-xl border bg-[color:var(--fiche-carte)] p-4 transition-colors duration-300',
        highlight
          ? 'border-[color:var(--fiche-accent)]'
          : 'border-[color:var(--fiche-bordure)] hover:border-[color:color-mix(in_srgb,var(--fiche-accent)_50%,var(--fiche-bordure))]',
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-md bg-[color:var(--fiche-bordure)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--fiche-accent)]">
          {attribute.abrege ?? attribute.nom.slice(0, 3)}
        </span>
        <span className={cn(titleFont, text, 'truncate font-bold tracking-wide')}>
          {attribute.nom}
        </span>
      </div>

      <div className="mb-4 flex flex-col items-center">
        <span className={cn(text, 'text-4xl font-bold tabular-nums tracking-tight')}>
          {modifier !== undefined ? formatSign(modifier) : formatValue(attribute, value)}
        </span>
        <span className={cn(textAccent, 'text-[10px] uppercase tracking-widest')}>
          {modifier !== undefined ? 'Modificateur' : 'Valeur'}
        </span>
      </div>

      {base !== undefined && typeof value === 'number' && (
        <div
          className="flex w-full items-center justify-between border-t border-[color:var(--fiche-bordure)] pt-3 text-xs"
          title={effects.map((l) => `${l.nom} : ${formatValue(undefined, l.valeur)}`).join('\n')}
        >
          <span className="flex flex-col items-center">
            <span className={textMuted}>Base</span>
            <span className={cn(text, 'font-mono')}>{formatNumber(base)}</span>
          </span>
          <span className={textMuted}>+</span>
          <span className="flex min-w-0 flex-col items-center">
            <span className={cn(textMuted, 'max-w-[5.5rem] truncate')}>{effectLabel}</span>
            <span className={cn('font-mono', delta ? textAccent : textMuted)}>
              {formatSign(delta ?? 0)}
            </span>
          </span>
          <span className={textMuted}>=</span>
          <span className="flex flex-col items-center rounded bg-[color:var(--fiche-bordure)] px-2 py-0.5">
            <span className={cn(textMuted, 'text-[10px]')}>Score</span>
            <span className={cn(text, 'font-mono font-bold')}>{formatNumber(value)}</span>
          </span>
        </div>
      )}

      {footer && (
        <div className="mt-3 flex w-full items-center justify-between gap-2 border-t border-[color:var(--fiche-bordure)] pt-3">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Petit bouton rond du pied de carte (−, +). */
export const cardButton =
  'flex h-7 w-7 items-center justify-center rounded-lg border border-[color:var(--fiche-bordure)] text-[color:var(--fiche-texte-secondaire)] transition-colors hover:border-[color:color-mix(in_srgb,var(--fiche-accent)_50%,var(--fiche-bordure))] hover:text-[color:var(--fiche-texte)] disabled:cursor-not-allowed disabled:opacity-25 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--fiche-accent)]';

/** Grille des cartes de caractéristiques. */
export const statGrid = 'grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6';
