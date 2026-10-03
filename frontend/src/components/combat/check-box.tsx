'use client';

/**
 * Case à cocher du design system pour les listes du combat (participants au démarrage, revue
 * groupée) : un vrai `role="checkbox"`, focus visible, état lisible sans la couleur (coche).
 */
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CheckBox({
  checked,
  onChange,
  label,
  disabled,
  className,
}: Readonly<{
  /** `mixed` : une partie seulement (case « tout cocher »). */
  checked: boolean | 'mixed';
  onChange(checked: boolean): void;
  label: string;
  disabled?: boolean;
  className?: string;
}>) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(checked !== true)}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-45',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border-strong bg-surface-2 hover:border-primary/60',
        className,
      )}
    >
      {checked === 'mixed' && <Minus className="size-3.5" aria-hidden />}
      {checked === true && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}
