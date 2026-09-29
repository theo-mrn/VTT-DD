'use client';

/**
 * Briques des barres contextuelles et des inspecteurs des outils de visibilité (obstacles,
 * brouillard, lumières) : bouton d'option, séparateur, ligne de réglage, curseur avec sa valeur,
 * nuancier des couleurs de données (murs, lumières).
 */
import { Check, Pipette } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { cn } from '@/lib/utils';

/** Remet le focus sur la carte (ses raccourcis restent actifs). */
export const focusMap = (engine: MapEngine) =>
  engine.canvas?.parentElement?.focus({ preventScroll: true });

export function OptionSeparator() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-border" />;
}

export function OptionButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick?(): void;
  children: ReactNode;
}) {
  return (
    <Info
      texte={
        <span className="flex items-center gap-2">
          {label}
          {shortcut && <Kbd>{shortcut}</Kbd>}
        </span>
      }
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-pressed={active}
        aria-keyshortcuts={shortcut}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          active && 'bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary',
        )}
      >
        {children}
      </Button>
    </Info>
  );
}

/** Ligne d'inspecteur : libellé à gauche, réglage à droite. */
export function FieldRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[13px] text-foreground">
          {label}
        </label>
        {children}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Curseur avec sa valeur. La valeur suit le doigt localement ; la modification (une commande)
 * part au lâcher (`onCommit`), jamais à chaque mouvement.
 */
export function RangeField({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format(v: number): string;
  onCommit(v: number): void;
  disabled?: boolean;
}) {
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-foreground">{label}</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {format(shown)}
        </span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={[shown]}
        onValueChange={([v]) => v !== undefined && setLocal(v)}
        onValueCommit={([v]) => {
          setLocal(null);
          if (v !== undefined && v !== value) onCommit(v);
        }}
      />
    </div>
  );
}

/**
 * Nuancier d'une couleur de donnée (murs, lumières) : teintes proposées, « par défaut » (null,
 * couleur du thème) si permis, et couleur personnalisée prise à la fermeture du sélecteur.
 */
export function Swatches({
  value,
  options,
  onChange,
  allowDefault,
  label = 'Couleur',
}: {
  value: string | null;
  options: readonly { value: string; label: string }[];
  onChange(value: string | null): void;
  allowDefault?: boolean;
  label?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const commit = () => latest.current(el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  const lower = value?.toLowerCase() ?? null;
  // Chaîne vide : valeurs différentes dans la sélection, rien n'est coché
  const custom = !!lower && !options.some((o) => o.value.toLowerCase() === lower);
  const ring = 'ring-2 ring-primary ring-offset-2 ring-offset-background';
  const swatch =
    'grid size-7 cursor-pointer place-items-center rounded-full border border-border-strong transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background';
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {allowDefault && (
        <Info texte="Couleur par défaut">
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label="Couleur par défaut"
            onClick={() => onChange(null)}
            className={cn(swatch, 'bg-foreground', value === null && ring)}
          >
            {value === null && <Check className="size-3.5 text-background" />}
          </button>
        </Info>
      )}
      {options.map((o) => {
        const selected = o.value.toLowerCase() === lower;
        return (
          <Info key={o.value} texte={o.label}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={o.label}
              onClick={() => onChange(o.value)}
              className={cn(swatch, selected && ring)}
              style={{ backgroundColor: o.value }}
            >
              {selected && <Check className="size-3.5 text-foreground mix-blend-difference" />}
            </button>
          </Info>
        );
      })}
      <Info texte="Couleur personnalisée">
        <label
          htmlFor={id}
          className={cn(
            swatch,
            'relative border-dashed text-muted-foreground hover:text-foreground',
            custom && cn('border-solid', ring),
          )}
          style={custom && value ? { backgroundColor: value } : undefined}
        >
          <Pipette className={cn('size-3.5', custom && 'text-foreground mix-blend-difference')} />
          <input
            ref={input}
            id={id}
            type="color"
            defaultValue={custom && value?.startsWith('#') ? value.slice(0, 7) : undefined}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Couleur personnalisée"
          />
        </label>
      </Info>
    </div>
  );
}
