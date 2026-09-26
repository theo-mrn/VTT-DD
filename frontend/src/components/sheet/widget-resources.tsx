'use client';

/**
 * Jauges (PV, blessures, stress…), reprises du bloc « Vitalité » de l'ancienne
 * fiche : une carte par ressource avec sa valeur sur son maximum, une jauge
 * dans le sens déclaré par la présentation, le détail au survol et le tiroir
 * d'ajustement au clic.
 */
import type { Attribut, Widget } from '@vtt/rules';
import { BedDouble, Heart } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AdjustDrawer } from './adjust-drawer';
import { useSheet } from './context';
import { DetailPopover } from './detail-popover';
import { SheetEmpty } from './elements';
import { formatNumber } from './format';
import { WidgetCard } from './frame';
import { panel, secondaryButton, text, textMuted } from './styles';

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
  const { sheet, readOnly, canSetValue, rest } = useSheet();
  const [resting, setResting] = useState(false);
  const [adjusting, setAdjusting] = useState<Resource | null>(null);
  const resources = widget.attributs
    .map((c) => sheet.entite.attributs.get(c))
    .filter((a): a is Resource => a?.nature === 'ressource');

  return (
    <WidgetCard
      title={widget.titre}
      bare
      action={
        !readOnly && resources.length > 1 ? (
          <button
            type="button"
            className={cn(secondaryButton, 'min-h-7 px-2 py-0.5 text-[11px]')}
            disabled={resting}
            onClick={async () => {
              setResting(true);
              await rest(resources.map((a) => a.cle));
              setResting(false);
            }}
            title="Ramène chaque jauge de ce bloc à sa valeur de repos"
          >
            <BedDouble />
            Repos
          </button>
        ) : undefined
      }
    >
      {resources.length ? (
        <div
          className="grid gap-1"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 11rem), 1fr))` }}
        >
          {resources.map((a) => (
            <ResourceCard
              key={a.cle}
              attribute={a}
              onAdjust={canSetValue(a) ? () => setAdjusting(a) : undefined}
            />
          ))}
        </div>
      ) : (
        <SheetEmpty>Aucune ressource.</SheetEmpty>
      )}
      {adjusting && <AdjustDrawer attribute={adjusting} onClose={() => setAdjusting(null)} />}
    </WidgetCard>
  );
}

function ResourceCard({ attribute: a, onAdjust }: { attribute: Resource; onAdjust?: () => void }) {
  const { json, presentation } = useSheet();
  const v = json.valeurs[a.cle];
  const value = typeof v?.valeur === 'number' ? v.valeur : 0;
  const min = v?.min ?? 0;
  const max = v?.max ?? 0;
  const appearance = presentation.ressources[a.cle];
  const direction = resourceDirection(appearance?.sens, a);
  const color = appearance?.couleur ?? '#ef4444';
  const range = max - min;
  const part = range > 0 ? Math.min(1, Math.max(0, (value - min) / range)) : 0;
  // Alerte : jauge descendante presque vide, ou jauge montante au seuil (ou au-delà)
  const alert = direction === 'descendant' ? part <= 0.25 : value >= max && max > min;
  const exceeded = value > max;

  return (
    <DetailPopover
      title={a.nom}
      detail={v?.detail}
      footer={onAdjust ? 'Cliquer pour ajuster' : undefined}
      onClick={onAdjust}
      label={
        onAdjust ? `Ajuster ${a.nom} (${formatNumber(value)} sur ${formatNumber(max)})` : undefined
      }
      className="rounded-lg"
    >
      <span
        className={cn(
          panel,
          'flex h-full min-h-[50px] flex-col justify-center gap-1.5 px-4 py-1.5',
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Heart className="shrink-0" size={16} style={{ color }} aria-hidden />
          <span className="flex min-w-0 flex-col leading-tight">
            <span
              className={cn(textMuted, 'truncate text-[10px] uppercase tracking-wide sm:text-xs')}
              title={a.description ?? a.nom}
            >
              {a.nom}
            </span>
            <span
              className={cn(
                text,
                'truncate text-sm font-bold tabular-nums sm:text-base md:text-xl',
              )}
            >
              {formatNumber(value)} / {formatNumber(max)}
            </span>
          </span>
        </span>
        <span
          role="meter"
          aria-label={`${a.nom}${direction === 'montant' ? ' (se remplit)' : ''}`}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${formatNumber(value)} sur ${formatNumber(max)}${exceeded ? ', seuil dépassé' : ''}`}
          className="block h-1.5 overflow-hidden rounded-full bg-[color:var(--fiche-canevas)]"
        >
          <span
            className={cn(
              'block h-full rounded-full transition-[width] duration-300',
              exceeded && 'animate-pulse',
            )}
            style={{ width: `${part * 100}%`, background: alert ? '#ef4444' : color }}
          />
        </span>
      </span>
    </DetailPopover>
  );
}
