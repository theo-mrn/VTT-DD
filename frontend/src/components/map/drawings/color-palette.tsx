'use client';

/**
 * Palette des couleurs de dessin et de texte : les teintes viennent de la palette du module
 * (données, `lib/map/modules/drawings/palette.ts`), plus une couleur personnalisée, prise à la
 * fermeture du sélecteur du navigateur (une seule modification, pas une par mouvement).
 */
import { Check, Pipette } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { Info } from '@/components/ui/tooltip';
import { DRAWING_COLORS, parseColor } from '@/lib/map/modules/drawings/palette';
import { cn } from '@/lib/utils';

export function ColorPalette({
  value,
  onChange,
  label = 'Couleur',
}: Readonly<{
  /** `#rrggbb`. */
  value: string;
  onChange(hex: string): void;
  label?: string;
}>) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef(onChange);
  useEffect(() => {
    latest.current = onChange;
  });
  // Événement natif `change` : à la fermeture du sélecteur (React n'expose que `input`)
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const commit = () => latest.current(el.value);
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, []);
  const current = parseColor(value)?.hex ?? value;
  const hex = parseColor(current)?.hex ?? DRAWING_COLORS[0]!.value;
  // Champ non contrôlé : sa valeur suit la couleur courante
  useEffect(() => {
    if (input.current && input.current.value !== hex) input.current.value = hex;
  }, [hex]);
  const custom = !DRAWING_COLORS.some((c) => c.value === current);
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-7 gap-1.5">
      {DRAWING_COLORS.map((c) => {
        const selected = c.value === current;
        return (
          <Info key={c.id} texte={c.label}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={c.label}
              onClick={() => onChange(c.value)}
              className={cn(
                'grid size-7 cursor-pointer place-items-center rounded-full border border-border-strong transition-transform duration-150 hover:scale-110',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              )}
              style={{ backgroundColor: c.value }}
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
            'relative grid size-7 cursor-pointer place-items-center rounded-full border border-dashed border-border-strong text-muted-foreground transition-transform duration-150 hover:scale-110 hover:text-foreground',
            'focus-within:ring-2 focus-within:ring-ring/60 focus-within:ring-offset-2 focus-within:ring-offset-background',
            custom && 'border-solid ring-2 ring-primary ring-offset-2 ring-offset-background',
          )}
          style={custom ? { backgroundColor: current } : undefined}
        >
          <Pipette className={cn('size-3.5', custom && 'text-foreground mix-blend-difference')} />
          <input
            ref={input}
            id={id}
            type="color"
            aria-label="Couleur personnalisée"
            defaultValue={hex}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
      </Info>
    </div>
  );
}

/** Pastille de la couleur courante (bouton d'une barre). */
export function ColorDot({ color, className }: Readonly<{ color: string; className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn('block size-4 rounded-full border border-border-strong', className)}
      style={{ backgroundColor: color }}
    />
  );
}
