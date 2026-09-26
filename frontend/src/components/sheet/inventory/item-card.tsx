'use client';

/**
 * Carte d'un exemplaire de l'inventaire, bouton équiper / ranger et réglage
 * de la quantité (sortes `quantites`).
 */
import { quantiteDe, type Possession, type PossessionEffective } from '@vtt/rules';
import { Minus, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { copyActive, copyNumber, copyTarget } from '../possessions';
import { chip, focus, iconButton, text, textAccent, textMuted } from '../styles';
import { fieldSummary } from './model';
import { useInventory, useSending } from './ui';

export function ItemCard({
  possession: p,
  own,
  onOpen,
}: {
  possession: PossessionEffective;
  /** Exemplaire affiché ; absent : entrée obtenue par un effet, sans possession explicite. */
  own?: Possession;
  onOpen(): void;
}) {
  const { system, state } = useInventory();
  const { entree: entry, sorte: kind } = p;
  const bonusCount = own?.effets.length ?? 0;
  const summary = fieldSummary(system, state.type, entry, kind, own);
  const active = copyActive(p, own);
  const number = copyNumber(p, own);

  return (
    <li
      className={cn(
        'group relative flex min-h-[7.5rem] flex-col rounded-xl border bg-[color:var(--fiche-canevas)] transition-colors',
        active
          ? 'border-[color:color-mix(in_srgb,var(--fiche-accent)_60%,transparent)]'
          : 'border-[color:var(--fiche-bordure)] hover:border-[color:color-mix(in_srgb,var(--fiche-accent)_45%,transparent)]',
        bonusCount > 0 &&
          active &&
          'shadow-[0_0_14px_-4px_color-mix(in_srgb,var(--fiche-accent)_70%,transparent)]',
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className={cn('flex flex-1 flex-col gap-1 rounded-xl p-3 text-left', focus)}
        aria-label={`${entry.nom}${number ? ` (exemplaire ${number})` : ''} : ouvrir la fiche de l'objet`}
      >
        <span className="flex items-start gap-1.5">
          <span
            className={cn(
              'line-clamp-2 flex-1 text-sm font-semibold leading-snug group-hover:underline',
              active ? text : textMuted,
            )}
          >
            {entry.nom}
          </span>
          {kind.quantites && (
            <span
              className={cn(textAccent, 'shrink-0 font-mono text-xs font-bold tabular-nums')}
              title="Quantité"
            >
              ×{own ? quantiteDe(own) : 1}
            </span>
          )}
        </span>
        {number && <span className={cn(textMuted, 'text-[11px]')}>Exemplaire n° {number}</span>}
        {summary.length > 0 && (
          <span className={cn(textAccent, 'font-mono text-[11px] leading-snug')}>
            {summary.join(' · ')}
          </span>
        )}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 pb-3">
        <EquipToggle
          entry={entry.id}
          copy={own?.exemplaire}
          name={entry.nom}
          active={active}
          explicit={!!own}
          compact
        />
        <span className="flex items-center gap-1.5">
          {kind.quantites && own && <QuantityStepper possession={own} name={entry.nom} compact />}
          {bonusCount > 0 && (
            <span
              className={cn(chip, textAccent)}
              title={`${bonusCount} bonus propre${bonusCount > 1 ? 's' : ''} à cet exemplaire`}
            >
              <Sparkles className="h-3 w-3" />
              {bonusCount}
            </span>
          )}
        </span>
      </div>
    </li>
  );
}

/** Interrupteur « Équipé » : pose `actif` sur l'exemplaire. */
export function EquipToggle({
  entry,
  copy,
  name,
  active,
  explicit,
  compact,
}: {
  entry: string;
  /** Identifiant de l'exemplaire (absent : l'exemplaire sans identifiant). */
  copy?: string;
  name: string;
  active: boolean;
  /** Exemplaire présent dans l'état (sinon obtenu par un effet : non modifiable ici). */
  explicit: boolean;
  compact?: boolean;
}) {
  const { readOnly, onUpdateItem } = useInventory();
  const [sending, run] = useSending();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${name} : ${active ? 'équipé' : 'non équipé'}`}
      disabled={readOnly || !explicit || sending}
      onClick={() => void run(() => onUpdateItem({ ...copyTarget(entry, copy), actif: !active }))}
      className={cn(
        chip,
        compact ? 'min-h-7 px-2 text-[11px]' : 'min-h-8 px-2.5 text-xs',
        'gap-1.5 disabled:cursor-not-allowed',
        active &&
          'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_14%,transparent)] text-[color:var(--fiche-texte)]',
        focus,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'h-2 w-2 rounded-full',
          active ? 'bg-[color:var(--fiche-accent)]' : 'bg-[color:var(--fiche-bordure)]',
        )}
      />
      {active ? 'Équipé' : 'Rangé'}
    </button>
  );
}

/**
 * − / + sur la quantité d'un exemplaire (sorte `quantites`). La quantité ne
 * descend pas sous 1 : retirer l'exemplaire se fait depuis sa fiche.
 */
export function QuantityStepper({
  possession: own,
  name,
  compact,
}: {
  possession: Possession;
  name: string;
  /** Sans le nombre (la carte l'affiche déjà en badge). */
  compact?: boolean;
}) {
  const { readOnly, onUpdateItem } = useInventory();
  const [sending, run] = useSending();
  if (readOnly) return null;
  const q = quantiteDe(own);
  const set = (n: number) =>
    void run(() => onUpdateItem({ ...copyTarget(own.entree, own.exemplaire), quantite: n }));
  const size = compact ? 'h-7 w-7' : 'h-8 w-8';
  return (
    <span className="inline-flex items-center gap-1" role="group" aria-label={`Quantité : ${name}`}>
      <button
        type="button"
        className={cn(iconButton, size)}
        aria-label={`${name} : une unité de moins`}
        disabled={sending || q <= 1}
        onClick={() => set(q - 1)}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      {!compact && (
        <span className={cn(text, 'min-w-8 text-center font-mono text-sm font-bold tabular-nums')}>
          {q}
        </span>
      )}
      <button
        type="button"
        className={cn(iconButton, size)}
        aria-label={`${name} : une unité de plus`}
        disabled={sending}
        onClick={() => set(q + 1)}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
