'use client';

/**
 * Valeur affichée à côté d'un curseur, saisissable au clic : plus rapide et plus précis que le
 * curseur pour une valeur exacte. Entrée ou sortie du champ : valeur bornée puis enregistrée ;
 * Échap : rien.
 *
 * `scale` : facteur d'affichage (100 pour une valeur de 0 à 1 montrée en %) ; la saisie est
 * dans l'unité affichée. `max` peut dépasser celui du curseur (saisie au-delà, au cas où).
 */
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** Nombre lu dans une saisie (virgule décimale, unité ou % ignorés) ; null si aucun. */
export function parseTyped(text: string): number | null {
  const m = /-?\d+(\.\d+)?|-?\.\d+/.exec(text.replace(',', '.'));
  const n = m ? Number(m[0]) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}

/** Valeur saisie ramenée dans l'unité de la donnée, bornée, à 4 décimales. */
export function typedValue(
  text: string,
  o: { min: number; max: number; scale?: number },
): number | null {
  const n = parseTyped(text);
  if (n === null) return null;
  const v = n / (o.scale ?? 1);
  return Math.round(Math.min(o.max, Math.max(o.min, v)) * 10_000) / 10_000;
}

export function EditableValue({
  value,
  format,
  onCommit,
  min,
  max,
  scale = 1,
  label,
  disabled,
  className,
}: Readonly<{
  value: number;
  format(v: number): string;
  onCommit(v: number): void;
  min: number;
  max: number;
  scale?: number;
  /** Nom du réglage (lecteurs d'écran). */
  label: string;
  disabled?: boolean;
  className?: string;
}>) {
  const t = useTranslations();
  const [text, setText] = useState<string | null>(null);
  // Échap : le champ disparaît sans que sa sortie n'enregistre
  const cancelled = useRef(false);

  if (text === null)
    return (
      <button
        type="button"
        disabled={disabled}
        aria-label={t('common.editValue', { label, value: format(value) })}
        onClick={() => {
          cancelled.current = false;
          setText(String(Math.round(value * scale * 100) / 100).replace('.', ','));
        }}
        className={cn(
          'cursor-text rounded-sm decoration-dotted underline-offset-2 hover:underline',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'disabled:cursor-default disabled:no-underline',
          className,
        )}
      >
        {format(value)}
      </button>
    );

  const commit = () => {
    if (cancelled.current) return;
    const v = typedValue(text, { min, max, scale });
    setText(null);
    if (v !== null && v !== value) onCommit(v);
  };
  return (
    <input
      autoFocus
      value={text}
      inputMode="decimal"
      aria-label={label}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelled.current = true;
          setText(null);
        }
      }}
      className={cn(
        'w-16 rounded-sm border border-border-strong bg-background px-1 text-right outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring/60',
        className,
      )}
    />
  );
}
