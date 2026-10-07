'use client';

/**
 * Onglet « Capacités » du menu d'attaque (docs/combat.md § 19.1) : les capacités jouables de
 * l'attaquant, rangées comme la vue Capacités de la fiche (actives, à activer, usages limités,
 * autres), avec leurs usages et leur durée ; la capacité choisie déplie son texte, celui que le
 * MJ lira. Choisir une capacité prépare l'acte dans le menu : son action dédiée, sinon l'action
 * générique de sa sorte (activée d'abord pour une capacité à activer).
 */
import { useTranslations } from 'next-intl';
import { DurationChip, timerOf } from '@/components/combat/duration-chip';
import { UsesChip } from '@/components/fiche/blocks/skills/uses';
import { groupeDe, type CapaciteCombat, type GroupeCapacites } from '@/lib/combat/capacities';
import { cn } from '@/lib/utils';
import { FOCUS } from '@/components/des/tactile';

const GROUPES: readonly GroupeCapacites[] = ['actives', 'aActiver', 'limitees', 'autres'];

export function CapacityPicker({
  capacites,
  selected,
  onSelect,
  disabled,
}: Readonly<{
  capacites: readonly CapaciteCombat[];
  /** Capacité choisie (identifiant d'entrée) ; null : aucune. */
  selected: string | null;
  onSelect: (c: CapaciteCombat) => void;
  disabled: boolean;
}>) {
  const t = useTranslations('combat.capacities');
  if (!capacites.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">{t('none')}</p>;
  const groupes = GROUPES.map(
    (g) => [g, capacites.filter((c) => groupeDe(c) === g)] as const,
  ).filter(([, l]) => l.length > 0);
  return (
    <div role="radiogroup" aria-label={t('title')} className="space-y-3">
      {groupes.map(([groupe, liste]) => (
        <section key={groupe} aria-label={t(`groups.${groupe}`)}>
          <h3 className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-subtle">
            {t(`groups.${groupe}`)}
          </h3>
          <ul className="space-y-1.5">
            {liste.map((c) => (
              <Ligne
                key={c.entree.id}
                c={c}
                on={c.entree.id === selected}
                disabled={disabled}
                onSelect={() => onSelect(c)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Ligne({
  c,
  on,
  disabled,
  onSelect,
}: Readonly<{ c: CapaciteCombat; on: boolean; disabled: boolean; onSelect: () => void }>) {
  const t = useTranslations('combat.capacities');
  const minuterie = c.possession.exemplaires.map(timerOf).find((x) => x !== null) ?? null;
  const dediee =
    c.jeu.type === 'actions' ? c.jeu.actions.map((d) => d.action.nom).join(', ') : null;
  return (
    <li
      className={cn(
        'rounded-xl border transition-colors',
        on ? 'border-primary/50 bg-primary/[0.06]' : 'border-border hover:border-primary/30',
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled || c.epuisee}
        onClick={onSelect}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left disabled:opacity-50',
          FOCUS,
        )}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block truncate text-sm font-medium',
              on ? 'text-primary-strong' : 'text-foreground',
            )}
          >
            {c.entree.nom}
          </span>
          {(c.activation || dediee || c.active) && (
            <span className="block truncate text-[11px] text-subtle">
              {[c.active ? t('active') : null, c.activation, dediee].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
        {minuterie && <DurationChip timer={minuterie} />}
        {c.usages && <UsesChip uses={c.usages} />}
      </button>
      {on && c.entree.description && (
        <p className="max-h-48 overflow-y-auto whitespace-pre-line border-t border-border/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
          {c.entree.description}
        </p>
      )}
    </li>
  );
}
