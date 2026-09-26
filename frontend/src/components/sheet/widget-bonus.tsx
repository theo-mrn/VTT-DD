'use client';

/**
 * Bonus actifs de toute provenance, repris du bloc « Effets actifs » de
 * l'ancienne fiche. Trois sources, une seule mécanique (voir docs/regles.md) :
 *   - bonus libres de l'état (potion, MJ) : activer, désactiver, supprimer, ajouter ;
 *   - effets propres à un exemplaire possédé (épée +1) : activer si la sorte
 *     s'équipe, retirer ;
 *   - effets du catalogue des entrées possédées (espèce, talents) : lecture.
 * Chaque effet sur un attribut affiche la valeur réellement appliquée, lue
 * dans le détail du calcul de la fiche.
 */
import { estExemplaire, sourceExemplaire, type Effet, type Widget } from '@vtt/rules';
import { Check, ChevronDown, Clock, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { appliedOn, describeEffect, namesFor, type Names } from './bonus-effects';
import { BonusForm } from './bonus-form';
import { useSheet } from './context';
import { formatValue } from './format';
import { WidgetCard } from './frame';
import { copyName, copyTarget } from './possessions';
import { focus, secondaryButton, text, textMuted, widgetLabel } from './styles';

type BonusWidgetProps = Extract<Widget, { type: 'bonus' }>;

/** Effets affichés : les marques (compétences de carrière…) ne sont pas des bonus. */
const shown = (effects: readonly Effet[]) => effects.filter((e) => e.sur !== 'marque');

export function BonusWidget({ widget }: { widget: BonusWidgetProps }) {
  const { system, state, sheet, readOnly } = useSheet();
  const [adding, setAdding] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const names = useMemo(() => namesFor(system, state.type), [system, state.type]);

  const free = state.bonus ?? [];
  const copies = state.possessions.filter((p) => (p.effets ?? []).length > 0);
  const catalogue = sheet.sources.filter((s) => s.genre === 'entree' && shown(s.effets).length);

  return (
    <WidgetCard
      title={widget.titre}
      icon={<Sparkles size={12} aria-hidden />}
      action={
        !readOnly ? (
          <button
            type="button"
            className={cn(secondaryButton, 'min-h-7 px-2 py-0.5 text-[11px]')}
            onClick={() => setAdding(true)}
          >
            <Plus />
            Ajouter
          </button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {free.length === 0 && copies.length === 0 && catalogue.length === 0 && (
          <p className={cn(textMuted, 'py-3 text-center text-[11px] italic opacity-60')}>
            Aucun bonus pour l&apos;instant.
          </p>
        )}

        {free.map((b) => (
          <FreeBonusCard key={b.id} id={b.id} names={names} />
        ))}

        {copies.length > 0 && (
          <Section title="Exemplaires">
            {copies.map((p) => (
              <CopyCard
                key={sourceExemplaire(p)}
                entry={p.entree}
                copy={p.exemplaire}
                names={names}
              />
            ))}
          </Section>
        )}

        {catalogue.length > 0 && (
          <div>
            <button
              type="button"
              aria-expanded={catalogueOpen}
              onClick={() => setCatalogueOpen((o) => !o)}
              className={cn(
                widgetLabel,
                'w-full rounded py-1 hover:text-[color:var(--fiche-texte)]',
                focus,
              )}
            >
              <ChevronDown
                className={cn('h-3.5 w-3.5 transition-transform', catalogueOpen && 'rotate-180')}
                aria-hidden
              />
              Effets du catalogue ({catalogue.length})
            </button>
            {catalogueOpen && (
              <ul className="mt-1 space-y-1.5">
                {catalogue.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:color-mix(in_srgb,var(--fiche-carte)_40%,transparent)] p-2"
                  >
                    <p
                      className={cn(text, 'truncate text-[11px] font-bold uppercase tracking-wide')}
                    >
                      {s.nom}
                    </p>
                    <EffectLines effects={shown(s.effets)} source={s.id} names={names} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {adding && <BonusForm onClose={() => setAdding(false)} />}
    </WidgetCard>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className={cn(widgetLabel, 'pt-1 opacity-70')}>{title}</p>
      {children}
    </div>
  );
}

/** Lignes d'effets d'une source, avec la valeur appliquée quand l'effet vise un attribut. */
function EffectLines({
  effects,
  source,
  names,
  active = true,
}: {
  effects: readonly Effet[];
  source: string;
  names: Names;
  active?: boolean;
}) {
  const { json } = useSheet();
  return (
    <ul className={cn('font-mono text-xs font-semibold', active ? textMuted : 'opacity-70')}>
      {effects.map((e, i) => {
        const applied =
          active && e.sur === 'attribut' ? appliedOn(json, source, e.attribut) : undefined;
        return (
          <li
            key={i}
            className={cn(applied?.ignore && 'line-through')}
            title={applied?.ignore ? 'Effet écarté (non cumulable ou sans effet)' : undefined}
          >
            {describeEffect(e, names)}
            {applied && !applied.ignore && String(applied.valeur) !== effectValue(e) && (
              <span className={text}> → {formatValue(undefined, applied.valeur)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const effectValue = (e: Effet) => ('valeur' in e ? String(e.valeur).trim() : '');

/** Pastille d'état cliquable : vert si actif, rouge sombre sinon (comme l'ancienne fiche). */
function StatusToggle({
  active,
  label,
  onToggle,
  disabled,
}: {
  active: boolean;
  label: string;
  onToggle?: () => void;
  disabled?: boolean;
}) {
  const dot = (
    <span
      aria-hidden
      className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        active ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : 'bg-red-900/60',
      )}
    />
  );
  if (!onToggle) return dot;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${label} : ${active ? 'désactiver' : 'activer'}`}
      title={active ? 'Actif : cliquer pour désactiver' : 'Inactif : cliquer pour activer'}
      onClick={onToggle}
      disabled={disabled}
      className={cn('-m-1.5 inline-flex rounded-full p-1.5 disabled:cursor-not-allowed', focus)}
    >
      {dot}
    </button>
  );
}

/** Bouton de suppression en deux temps (poubelle, puis confirmation). */
function RemoveButton({ label, onRemove }: { label: string; onRemove(): void }) {
  const [confirm, setConfirm] = useState(false);
  if (confirm)
    return (
      <span className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            setConfirm(false);
            onRemove();
          }}
          className={cn('rounded p-1 text-red-400 hover:bg-red-500/20', focus)}
          aria-label={`Confirmer : ${label}`}
          title="Confirmer"
          autoFocus
        >
          <Check className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className={cn(textMuted, 'rounded p-1 hover:text-[color:var(--fiche-texte)]', focus)}
          aria-label="Annuler"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    );
  return (
    <button
      type="button"
      onClick={() => setConfirm(true)}
      className={cn(textMuted, 'rounded p-1 hover:text-red-400', focus)}
      aria-label={label}
      title={label}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function Card({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'select-none rounded-lg border p-2 transition-all',
        active
          ? 'border-[color:color-mix(in_srgb,var(--fiche-texte-secondaire)_60%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-texte-secondaire)_16%,transparent)] shadow-sm'
          : 'border-[color:var(--fiche-bordure)] bg-[color:color-mix(in_srgb,var(--fiche-carte)_40%,transparent)] opacity-60 hover:opacity-100',
      )}
    >
      {children}
    </div>
  );
}

function FreeBonusCard({ id, names }: { id: string; names: Names }) {
  const { state, readOnly, pending, setBonusActive, removeBonus } = useSheet();
  const b = state.bonus.find((x) => x.id === id);
  if (!b) return null;
  return (
    <Card active={b.actif}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <StatusToggle
            active={b.actif}
            label={b.nom}
            onToggle={readOnly ? undefined : () => void setBonusActive(b.id, !b.actif)}
            disabled={pending > 0}
          />
          <span className={cn(text, 'truncate text-[11px] font-bold uppercase tracking-wide')}>
            {b.nom}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {b.duree !== undefined && (
            <span
              className={cn(textMuted, 'inline-flex items-center gap-0.5 text-[10px] tabular-nums')}
              title="Rounds restants"
            >
              <Clock className="h-3 w-3" aria-hidden />
              {b.duree} round{b.duree > 1 ? 's' : ''}
            </span>
          )}
          {!readOnly && (
            <RemoveButton
              label={`Supprimer le bonus ${b.nom}`}
              onRemove={() => void removeBonus(b.id)}
            />
          )}
        </span>
      </div>
      <EffectLines effects={b.effets} source={`bonus:${b.id}`} names={names} active={b.actif} />
      {b.source && <p className={cn(textMuted, 'mt-1 text-[10px] italic')}>{b.source}</p>}
    </Card>
  );
}

/** Effets propres à un exemplaire possédé (épée +1, bonus saisi sur un objet). */
function CopyCard({ entry, copy, names }: { entry: string; copy?: string; names: Names }) {
  const { system, state, sheet, json, readOnly, pending, updatePossession } = useSheet();
  const p = state.possessions.find((x) => estExemplaire(x, entry, copy));
  const e = system.entrees.get(entry);
  if (!p || !e) return null;
  const kind = system.sortes.get(e.sorte);
  const effective = json.possessions.find((x) => x.entree === entry)?.effective ?? true;
  const active = (!kind?.activable || p.actif) && effective;
  const owned = sheet.possessions.get(entry);
  const name = owned ? copyName(owned, p) : e.nom;
  const target = copyTarget(entry, copy);
  return (
    <Card active={active}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <StatusToggle
            active={active}
            label={name}
            onToggle={
              !readOnly && kind?.activable
                ? () => void updatePossession({ ...target, actif: !p.actif })
                : undefined
            }
            disabled={pending > 0}
          />
          <span className={cn(text, 'truncate text-[11px] font-bold uppercase tracking-wide')}>
            {name}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {kind && <span className={cn(textMuted, 'text-[10px]')}>{kind.nom}</span>}
          {!readOnly && (
            <RemoveButton
              label={`Retirer les effets propres à ${name}`}
              onRemove={() => void updatePossession({ ...target, effets: [] })}
            />
          )}
        </span>
      </div>
      <EffectLines
        effects={shown(p.effets)}
        source={sourceExemplaire(p)}
        names={names}
        active={active}
      />
    </Card>
  );
}
