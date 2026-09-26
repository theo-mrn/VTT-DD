'use client';

/** Carte d'un objet de l'inventaire et bouton équiper / déséquiper. */
import type { Entree, Sorte } from '@vtt/rules';
import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { chip, focus, text, textAccent, textMuted } from '../styles';
import { fieldSummary } from './model';
import { useInventory, useSending } from './ui';

export function ItemCard({ entry, kind, onOpen }: { entry: Entree; kind: Sorte; onOpen(): void }) {
  const { system, sheet, state } = useInventory();
  const p = sheet.possessions.get(entry.id);
  const own = state.possessions.find((x) => x.entree === entry.id);
  const bonusCount = own?.effets.length ?? 0;
  const summary = fieldSummary(system, state.type, state, entry, kind);
  const active = !!p?.actif;

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
        aria-label={`${entry.nom} : ouvrir la fiche de l'objet`}
      >
        <span
          className={cn(
            'line-clamp-2 text-sm font-semibold leading-snug group-hover:underline',
            active ? text : textMuted,
          )}
        >
          {entry.nom}
        </span>
        {summary.length > 0 && (
          <span className={cn(textAccent, 'font-mono text-[11px] leading-snug')}>
            {summary.join(' · ')}
          </span>
        )}
      </button>
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <EquipToggle entry={entry.id} name={entry.nom} active={active} explicit={!!own} compact />
        {bonusCount > 0 && (
          <span
            className={cn(chip, textAccent)}
            title={`${bonusCount} bonus propre${bonusCount > 1 ? 's' : ''} à cet exemplaire`}
          >
            <Sparkles className="h-3 w-3" />
            {bonusCount}
          </span>
        )}
      </div>
    </li>
  );
}

/** Interrupteur « Équipé » : pose `actif` sur la possession. */
export function EquipToggle({
  entry,
  name,
  active,
  explicit,
  compact,
}: {
  entry: string;
  name: string;
  active: boolean;
  /** Possession présente dans l'état (sinon obtenue par un effet : non modifiable ici). */
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
      onClick={() => void run(() => onUpdateItem({ entree: entry, actif: !active }))}
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
