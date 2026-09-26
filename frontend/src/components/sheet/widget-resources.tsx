'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { BedDouble, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { Block, Explanation, SheetEmpty } from './elements';
import { formatNumber } from './format';
import { iconButton, secondaryButton, valueBox, field, text, textMuted } from './styles';

type ResourcesWidget = Extract<Widget, { type: 'ressources' }>;
type Resource = Extract<Attribut, { nature: 'ressource' }>;
export type Direction = 'descendant' | 'montant';

/**
 * Sens d'une jauge : celui de la présentation, sinon déduit de la récupération
 * (une ressource qui se récupère vers son maximum part pleine et descend).
 */
export function resourceDirection(
  presentationDirection: Direction | undefined,
  a: Resource,
): Direction {
  return presentationDirection ?? (a.recuperation === 'max' ? 'descendant' : 'montant');
}

export function ResourcesWidget({ widget }: { widget: ResourcesWidget }) {
  const { sheet, readOnly, rest } = useSheet();
  const [resting, setResting] = useState(false);
  const resources = widget.attributs
    .map((c) => sheet.entite.attributs.get(c))
    .filter((a): a is Resource => a?.nature === 'ressource');

  return (
    <Block
      title={widget.titre}
      action={
        !readOnly && resources.length ? (
          <button
            type="button"
            className={cn(secondaryButton, 'min-h-8 px-2.5 text-xs')}
            disabled={resting}
            onClick={async () => {
              setResting(true);
              await rest(resources.map((a) => a.cle));
              setResting(false);
            }}
            title="Ramène chaque ressource de ce bloc à sa valeur de repos"
          >
            <BedDouble />
            Repos
          </button>
        ) : undefined
      }
    >
      {resources.length ? (
        <div className="space-y-3">
          {resources.map((a) => (
            <ResourceRow key={a.cle} attribute={a} />
          ))}
        </div>
      ) : (
        <SheetEmpty>Aucune ressource.</SheetEmpty>
      )}
    </Block>
  );
}

function ResourceRow({ attribute: a }: { attribute: Resource }) {
  const { json, presentation, readOnly, setValues } = useSheet();
  const v = json.valeurs[a.cle];
  const value = typeof v?.valeur === 'number' ? v.valeur : 0;
  const min = v?.min ?? 0;
  const max = v?.max ?? 0;
  const appearance = presentation.ressources[a.cle];
  const direction = resourceDirection(appearance?.sens, a);
  const color = appearance?.couleur ?? 'var(--fiche-accent)';
  const range = max - min;
  const part = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  // Alerte : jauge descendante presque vide, ou jauge montante au seuil (ou au-delà)
  const alert = direction === 'descendant' ? part <= 0.25 : value >= max && max > min;
  const exceeded = value > max;
  const [draft, setDraft] = useState(String(value));
  const id = `ressource-${a.cle}`;

  useEffect(() => setDraft(String(value)), [value]);

  const clamp = (n: number) => Math.max(min, a.plafonnee ? Math.min(max, n) : n);
  const fixer = (n: number) => {
    const b = clamp(Math.round(n));
    setDraft(String(b));
    if (b !== value) void setValues({ [a.cle]: b });
  };

  return (
    <div className={cn(valueBox, 'p-3')}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label
          htmlFor={readOnly ? undefined : id}
          className={cn(text, 'text-sm font-medium')}
          title={a.description}
        >
          {a.nom}
        </label>
        <Explanation title={a.nom} detail={v?.detail} className="w-auto rounded">
          <span className={cn(text, 'text-sm tabular-nums')}>
            <span className="text-base font-semibold">{formatNumber(value)}</span>
            <span className={textMuted}> / {formatNumber(max)}</span>
          </span>
        </Explanation>
      </div>
      <div
        role="meter"
        aria-label={`${a.nom}${direction === 'montant' ? ' (se remplit)' : ''}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatNumber(value)} sur ${formatNumber(max)}${exceeded ? ', seuil dépassé' : ''}`}
        className="h-3 overflow-hidden rounded-full bg-[color:var(--fiche-carte)] ring-1 ring-[color:var(--fiche-bordure)]"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            exceeded && 'animate-pulse',
          )}
          style={{
            width: `${part * 100}%`,
            background: alert ? '#ef4444' : color,
          }}
        />
      </div>
      {!readOnly && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className={iconButton}
            aria-label={`${a.nom} : retirer 1`}
            disabled={value <= min}
            onClick={() => fixer(value - 1)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            value={draft}
            min={min}
            max={a.plafonnee ? max : undefined}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              const n = Number(draft);
              if (draft.trim() === '' || !Number.isFinite(n)) setDraft(String(value));
              else fixer(n);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={cn(field, 'w-20 text-center tabular-nums')}
          />
          <button
            type="button"
            className={iconButton}
            aria-label={`${a.nom} : ajouter 1`}
            disabled={a.plafonnee && value >= max}
            onClick={() => fixer(value + 1)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className={cn(textMuted, 'ml-auto text-xs')}>
            {direction === 'montant' ? 'se remplit' : 'se vide'}
            {exceeded ? ' · seuil dépassé' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
