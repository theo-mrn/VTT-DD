'use client';

/**
 * Options du jet (docs/combat.md § 12.1, 5 et 6) : un jet par cible ou un jet commun (dès deux
 * cibles), visibilité (MJ : cachée aux joueurs par défaut, bascule par attaque), ajustements
 * libres repliés (dés à symboles par sorte, bonus au total : hors règles, marqués « ajusté à
 * la main » dans le rapport), puis l'aperçu du jet de l'attaquant.
 */
import type { AttackRollMode } from '@vtt/contracts';
import type { Action, Presentation, SystemeCharge } from '@vtt/rules';
import { ChevronDown, EyeOff, Minus, Plus, SlidersHorizontal } from 'lucide-react';
import { useId, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { RollPreview } from '@/lib/combat/actions';
import { hasAdjustments, type FreeAdjustments } from '@/lib/combat/attack-flow';
import { cn } from '@/lib/utils';

export function RollOptions({
  systeme,
  presentation,
  action,
  targetCount,
  rollMode,
  actionRollMode,
  onRollMode,
  gm,
  hidden,
  onHidden,
  adjustments,
  onAdjustment,
  onResetAdjustments,
  disabled,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  action: Action;
  targetCount: number;
  rollMode: AttackRollMode;
  actionRollMode: AttackRollMode;
  onRollMode: (mode: AttackRollMode) => void;
  gm: boolean;
  hidden: boolean;
  onHidden: (hidden: boolean) => void;
  adjustments: FreeAdjustments;
  onAdjustment: (die: string | null, value: number) => void;
  onResetAdjustments: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(hasAdjustments(adjustments));
  const symbolDice = action.jet.type === 'symboles' ? (systeme.source.des?.sortes ?? []) : [];

  return (
    <section aria-label="Options du jet" className="space-y-3">
      {targetCount > 1 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
            Plusieurs cibles
          </p>
          <div role="radiogroup" aria-label="Mode de jet" className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['per_target', 'Un jet par cible'],
                ['shared', 'Jet commun'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={rollMode === mode}
                disabled={disabled}
                onClick={() => onRollMode(mode)}
                className={cn(
                  'flex min-h-9 flex-col items-start justify-center rounded-lg border px-3 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  rollMode === mode
                    ? 'border-primary/60 bg-primary/15 text-primary-strong'
                    : 'border-border-strong text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
                {actionRollMode === mode && (
                  <span className="text-[11px] text-subtle">proposé par l’action</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {gm && (
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor={`${id}-cache`} className="flex items-center gap-2 text-[13px]">
            <EyeOff className="size-4 text-subtle" aria-hidden />
            Jet caché aux joueurs
          </Label>
          <Switch
            id={`${id}-cache`}
            checked={hidden}
            disabled={disabled}
            onCheckedChange={onHidden}
          />
        </div>
      )}

      <div className="rounded-xl border border-border">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          <span className="flex-1">Ajustements libres</span>
          {hasAdjustments(adjustments) && <Badge ton="alerte">ajusté à la main</Badge>}
          <ChevronDown
            className={cn('size-4 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
        {open && (
          <div className="space-y-2 border-t border-border px-3 py-2.5">
            <p className="text-[12px] text-subtle">
              Hors règles : appliqués après les effets et signalés au MJ dans le rapport.
            </p>
            {action.jet.type === 'numerique' ? (
              <Stepper
                label="Bonus au total"
                value={adjustments.bonus}
                min={-100}
                max={100}
                onChange={(v) => onAdjustment(null, v)}
                disabled={disabled}
              />
            ) : (
              symbolDice.map((d) => (
                <Stepper
                  key={d.id}
                  label={presentation?.des?.sortes[d.id]?.court ?? d.nom}
                  color={presentation?.des?.sortes[d.id]?.couleur}
                  value={adjustments.dice[d.id] ?? 0}
                  min={-20}
                  max={20}
                  onChange={(v) => onAdjustment(d.id, v)}
                  disabled={disabled}
                />
              ))
            )}
            {hasAdjustments(adjustments) && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={onResetAdjustments}
                disabled={disabled}
              >
                Réinitialiser
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function Stepper({
  label,
  color,
  value,
  min,
  max,
  onChange,
  disabled,
}: {
  label: string;
  /** Couleur de la sorte de dé (présentation du système). */
  color?: string | undefined;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-[13px]">
        {color && (
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
        )}
        {label}
      </span>
      <span className="flex items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          aria-label={`${label} : moins un`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <span
          className={cn(
            'w-8 text-center font-mono text-sm tabular-nums',
            value !== 0 && 'font-semibold text-warning',
          )}
          aria-live="polite"
        >
          {value > 0 ? `+${value}` : value}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon-xs"
          aria-label={`${label} : plus un`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </span>
    </div>
  );
}

/** Aperçu du jet de l'attaquant (§ 5.2) : ce qui dépend de la cible reste « selon la cible ». */
export function RollPreviewLine({
  preview,
  presentation,
}: {
  preview: RollPreview | null;
  presentation: Presentation | null;
}) {
  if (!preview) return null;
  return (
    <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-[13px]" aria-label="Aperçu du jet">
      <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">Aperçu</p>
      {preview.kind === 'numeric' ? (
        <p className="break-words font-mono text-foreground">{preview.formula}</p>
      ) : (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {preview.dice.map((d) => (
            <span key={d.die} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2.5 rounded-sm"
                style={{ background: presentation?.des?.sortes[d.die]?.couleur }}
              />
              <span className="font-mono">{d.count ?? '?'}</span>
              {presentation?.des?.sortes[d.die]?.court ?? d.name}
            </span>
          ))}
          {preview.upgrades.map((u, i) => (
            <span key={`${u.die}-${i}`} className="text-muted-foreground">
              ↑ {u.count ?? '?'} {presentation?.des?.sortes[u.to]?.court ?? u.name}
            </span>
          ))}
          {!preview.dice.length && !preview.upgrades.length && (
            <span className="text-muted-foreground">Aucun dé de l’attaquant</span>
          )}
        </p>
      )}
      {preview.dependsOnTarget && (
        <p className="mt-0.5 text-[12px] text-subtle">Le reste dépend de la cible.</p>
      )}
    </div>
  );
}
