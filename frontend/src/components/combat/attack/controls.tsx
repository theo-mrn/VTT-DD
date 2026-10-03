'use client';

/**
 * Commandes du menu d'attaque, au format du design system : titre de section, compteur ±,
 * option à bascule, choix segmenté, puce de situation. Cibles tactiles de 44 px au moins sur
 * mobile, état porté par `aria-*`, jamais par la couleur seule.
 */
import { Check, Info as InfoIcon, Minus, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import type { SituationChip, SituationTone } from '@/lib/combat/attack-flow-situation';
import { cn } from '@/lib/utils';

export function SectionTitle({
  icon,
  children,
  action,
  hint,
}: Readonly<{
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  hint?: string | null;
}>) {
  return (
    <div className="mb-2.5 flex min-h-7 items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
        {icon && <span className="text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
        {children}
        {hint && <HintIcon text={hint} />}
      </h3>
      {action}
    </div>
  );
}

/** Petite icône « i » avec son info-bulle (description d'un paramètre). */
export function HintIcon({ text }: Readonly<{ text: string }>) {
  return (
    <Info texte={text}>
      <button
        type="button"
        aria-label={text}
        className="inline-grid size-5 place-items-center rounded-full text-subtle transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <InfoIcon className="size-3.5" aria-hidden />
      </button>
    </Info>
  );
}

/** Compteur ± (dés du pool, bonus, paramètre nombre). */
export function Stepper({
  label,
  name: accessibleName,
  value,
  display,
  min = -99,
  max = 99,
  onChange,
  disabled,
  swatch,
  marked,
  hint,
  className,
}: Readonly<{
  label: ReactNode;
  /** Nom accessible, quand le libellé n'est pas un simple texte. */
  name?: string;
  value: number;
  /** Valeur affichée (sinon `value`). */
  display?: ReactNode;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  /** Couleur de la sorte de dé (présentation du système). */
  swatch?: string;
  /** Valeur forcée à la main : un point le signale. */
  marked?: boolean;
  hint?: string | null;
  className?: string;
}>) {
  const name = accessibleName ?? (typeof label === 'string' ? label : 'Valeur');
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border border-border bg-surface/70 px-3 py-2',
        marked && 'border-warning/40',
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-[13px]">
        {swatch && (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-[4px] ring-1 ring-inset ring-white/15"
            style={{ background: swatch }}
          />
        )}
        <span className="min-w-0 leading-snug">{label}</span>
        {marked && (
          <span
            className="size-1.5 shrink-0 rounded-full bg-warning"
            role="img"
            aria-label="Valeur forcée à la main"
          />
        )}
        {hint && <HintIcon text={hint} />}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label={`${name} : moins un`}
          disabled={disabled || value <= min}
          onClick={() => onChange(value - 1)}
        >
          <Minus />
        </Button>
        <span
          className="w-9 text-center font-mono text-base font-semibold tabular-nums"
          aria-live="polite"
        >
          {display ?? value}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="icon-sm"
          className="max-sm:size-10"
          aria-label={`${name} : plus un`}
          disabled={disabled || value >= max}
          onClick={() => onChange(value + 1)}
        >
          <Plus />
        </Button>
      </span>
    </div>
  );
}

/** Option à bascule (paramètre booléen) : une tuile qu'on allume. */
export function ToggleTile({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: Readonly<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string | null;
}>) {
  return (
    <div className="relative">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex min-h-11 w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left text-[13px] leading-snug transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
          hint && 'pr-9',
          checked
            ? 'border-primary/50 bg-primary/10 text-foreground'
            : 'border-border bg-surface/70 text-muted-foreground hover:border-border-strong hover:text-foreground',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
            checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
          )}
        >
          {checked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span>{label}</span>
      </button>
      {hint && (
        <span className="absolute right-2 top-2.5">
          <HintIcon text={hint} />
        </span>
      )}
    </div>
  );
}

/** Bascule en puce (paramètre de situation booléen) : compacte, icône facultative. */
export function TogglePill({
  label,
  checked,
  onChange,
  disabled,
  hint,
  icon,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string | null;
  icon?: ReactNode;
}) {
  const hintId = useId();
  const pill = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-[13px] leading-snug transition-colors max-sm:min-h-11',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
        '[&_svg]:size-3.5 [&_svg]:shrink-0',
        checked
          ? 'border-primary/60 bg-primary/15 text-primary-strong'
          : 'border-border-strong text-muted-foreground hover:border-primary/30 hover:text-foreground',
      )}
    >
      {checked ? <Check strokeWidth={3} aria-hidden /> : icon}
      {label}
    </button>
  );
  if (!hint) return pill;
  return (
    <>
      <Info texte={hint}>{pill}</Info>
      {/* Description lue par les lecteurs d'écran (aria-description n'est pas permis sur un switch) */}
      <span id={hintId} hidden>
        {hint}
      </span>
    </>
  );
}

export interface SegmentOption {
  value: string;
  label: ReactNode;
  /** Précision (info-bulle), texte accessible. */
  hint?: string;
  /** Détail en petit (modificateur, rang). */
  meta?: ReactNode;
}

/** Choix exclusif en boutons (paramètre `choix`, `attribut`, petite liste d'entrées). */
export function Segmented({
  label,
  options,
  value,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  options: readonly SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.value === value;
        const button = (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors max-sm:min-h-11',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50',
              on
                ? 'border-primary/60 bg-primary/15 font-medium text-primary-strong'
                : 'border-border-strong text-muted-foreground hover:border-primary/30 hover:text-foreground',
            )}
          >
            {o.label}
            {o.meta !== undefined && (
              <span className="font-mono text-[11px] tabular-nums opacity-80">{o.meta}</span>
            )}
          </button>
        );
        return o.hint ? (
          <Info key={o.value} texte={o.hint}>
            {button}
          </Info>
        ) : (
          button
        );
      })}
    </div>
  );
}

const TONES: Record<SituationTone, string> = {
  positive: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  info: 'border-info/30 bg-info/10 text-info',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  neutral: 'border-border-strong bg-surface-2 text-muted-foreground',
};

/** Puce de situation (§ 5.7) : texte lisible, précision au survol. */
export function SituationPill({ chip }: { chip: SituationChip }) {
  const pill = (
    <span
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium',
        TONES[chip.tone],
      )}
    >
      {chip.label}
    </span>
  );
  return chip.hint ? (
    <Info texte={chip.hint}>
      <span
        tabIndex={0}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {pill}
      </span>
    </Info>
  ) : (
    pill
  );
}
