'use client';

/**
 * Éléments communs aux onglets de la création : cadre à deux panneaux
 * (navigateur + aperçu), fil des sous-étapes, pied Précédent / Suivant,
 * pastilles et texte enrichi des descriptions.
 */
import { Check, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { accentButton, focus, secondaryButton, text, textMuted, titleFont } from '../sheet/styles';

/** Navigation d'un onglet : chaque onglet pilote ses sous-étapes, puis rend la main. */
export interface TabNav {
  /** Retour à l'onglet précédent (absent sur le premier). */
  onPrev?(): void;
  /** Passage à l'onglet suivant. */
  onNext(): void;
  /**
   * Sous-étape d'arrivée : la première (« Suivant »), la dernière (« Précédent »)
   * ou celle où l'on s'était arrêté (clic sur l'onglet, rechargement).
   */
  enterAt: 'start' | 'end' | 'resume';
}

/** Panneau principal d'un onglet, aux couleurs de la fiche. */
export const panel =
  'rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-fond-profond)]';

/** Carte sélectionnée / non sélectionnée (grilles d'entrées, options). */
export const selectedCard =
  'border-[color:var(--fiche-accent)] ring-1 ring-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,var(--fiche-carte))]';
export const idleCard =
  'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] hover:border-[color:color-mix(in_srgb,var(--fiche-accent)_50%,var(--fiche-bordure))]';

/** Pastille d'un modificateur (« AGI +2 »), aux couleurs de l'accent. */
export const accentChip =
  'inline-flex items-center rounded border border-[color:color-mix(in_srgb,var(--fiche-accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--fiche-accent)]';

/** Pastille neutre (marque, champ). */
export const mutedChip =
  'inline-flex items-center rounded border border-[color:var(--fiche-bordure)] bg-[color:color-mix(in_srgb,var(--fiche-texte)_6%,transparent)] px-1.5 py-0.5 text-[10px] leading-none text-[color:var(--fiche-texte-secondaire)]';

/** Titre d'un onglet (h2), dans la police des titres du système. */
export function TabTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <h2 className={cn(titleFont, text, 'text-xl font-bold tracking-wide sm:text-2xl')}>
        {children}
      </h2>
      {aside}
    </div>
  );
}

/** Fil des sous-étapes d'un onglet (« Carrière → Rangs gratuits »), cliquable en arrière. */
export function SubStepTrail({
  labels,
  current,
  onGo,
}: {
  labels: string[];
  current: number;
  onGo(i: number): void;
}) {
  if (labels.length < 2) return null;
  return (
    <ol aria-label="Sous-étapes" className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs">
      {labels.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <li aria-hidden className={textMuted}>
              →
            </li>
          )}
          <li>
            <button
              type="button"
              disabled={i > current}
              onClick={() => onGo(i)}
              aria-current={i === current ? 'step' : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors disabled:cursor-default',
                i === current
                  ? 'font-bold text-[color:var(--fiche-accent)]'
                  : i < current
                    ? 'text-[color:var(--fiche-texte)] hover:text-[color:var(--fiche-accent)]'
                    : textMuted,
                focus,
              )}
            >
              {i < current && <Check className="h-3 w-3" />}
              {l}
            </button>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

/** Pied d'onglet : Précédent / Suivant (qui peut enregistrer avant d'avancer). */
export function StepFooter({
  onPrev,
  onNext,
  nextLabel = 'Suivant',
  nextDisabled,
  busy,
  hint,
  className,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: ReactNode;
  nextDisabled?: boolean;
  busy?: boolean;
  /** Ce qui manque pour avancer, affiché au-dessus des boutons. */
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-2', className)}>
      {hint && <p className={cn(textMuted, 'text-xs')}>{hint}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onPrev}
          disabled={!onPrev || busy}
          className={secondaryButton}
        >
          <ChevronLeft />
          Précédent
        </button>
        {onNext && (
          <button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || busy}
            className={cn(accentButton, 'flex-1')}
          >
            {busy && <Loader2 className="animate-spin" />}
            {nextLabel}
            {!busy && <ChevronRight />}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Description d'une entrée : paragraphes, listes à puces (« - ») et gras
 * (« **texte** »), le reste en texte brut.
 */
export function RichText({ source, className }: { source: string; className?: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={blocks.length} className="list-disc space-y-1 pl-4">
        {list.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of source.split('\n')) {
    const t = line.trim();
    if (/^[-*] /.test(t)) {
      list.push(t.slice(2));
      continue;
    }
    flush();
    if (t) blocks.push(<p key={blocks.length}>{inline(t)}</p>);
  }
  flush();
  return <div className={cn('space-y-2', className)}>{blocks}</div>;
}

function inline(s: string): ReactNode {
  const parts = s.split(/\*\*(.+?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 ? (
      <strong key={i} className="font-semibold text-[color:var(--fiche-accent)]">
        {p}
      </strong>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/** Première ligne d'une description, sans mise en forme (cartes de la grille). */
export function plainSummary(source: string | undefined): string {
  if (!source) return '';
  const first = source.split('\n').find((l) => l.trim()) ?? '';
  return first.replace(/\*\*/g, '').trim();
}
