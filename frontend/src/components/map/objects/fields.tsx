'use client';

/**
 * Petits champs de l'inspecteur des objets : une saisie n'envoie une commande qu'une fois
 * validée (Entrée ou sortie du champ), jamais à chaque frappe ; Échap rétablit la valeur.
 */
import { useEffect, useId, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

/** Libellé au-dessus d'un champ. */
export function FieldLabel({
  htmlFor,
  children,
}: Readonly<{ htmlFor?: string; children: ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

/** Texte validé à la sortie du champ (ou Entrée). */
export function CommitInput({
  id,
  value,
  onCommit,
  placeholder,
  maxLength,
  className,
  'aria-label': ariaLabel,
}: Readonly<{
  id?: string;
  value: string;
  onCommit(value: string): void;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  'aria-label'?: string;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <Input
      id={id}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(value);
          e.stopPropagation();
        }
      }}
      className={cn('h-9', className)}
    />
  );
}

/** Nombre validé à la sortie du champ ; hors bornes ou illisible : la valeur est rétablie. */
export function CommitNumber({
  id,
  value,
  onCommit,
  min,
  max,
  step = 1,
  suffix,
  disabled,
  className,
  'aria-label': ariaLabel,
}: Readonly<{
  id?: string;
  value: number;
  onCommit(value: number): void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}>) {
  const shown = String(Math.round(value * 100) / 100);
  const [draft, setDraft] = useState(shown);
  useEffect(() => setDraft(shown), [shown]);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (!draft.trim() || !Number.isFinite(n)) {
      setDraft(shown);
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
    if (String(clamped) !== shown) onCommit(clamped);
    else setDraft(shown);
  };
  return (
    <div className={cn('relative', className)}>
      <Input
        id={id}
        inputMode="decimal"
        value={draft}
        step={step}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setDraft(shown);
            e.stopPropagation();
          }
        }}
        className={cn('h-9 tabular-nums', suffix && 'pr-9')}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-subtle">
          {suffix}
        </span>
      )}
    </div>
  );
}

/** Texte long validé à la sortie du champ. */
export function CommitTextarea({
  id,
  value,
  onCommit,
  placeholder,
  maxLength,
  rows = 3,
}: Readonly<{
  id?: string;
  value: string;
  onCommit(value: string): void;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}>) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <Textarea
      id={id}
      rows={rows}
      value={draft}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          e.stopPropagation();
        }
      }}
      className="min-h-0 resize-y text-[13px]"
    />
  );
}

/** Interrupteur avec son libellé et une aide facultative. */
export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: Readonly<{
  label: string;
  hint?: ReactNode;
  checked: boolean | 'mixed';
  onChange(checked: boolean): void;
  disabled?: boolean;
}>) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={id} className="text-[13px] text-foreground">
          {label}
        </label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch
        id={id}
        checked={checked === true}
        aria-checked={checked === 'mixed' ? 'mixed' : checked}
        disabled={disabled}
        onCheckedChange={onChange}
        className="mt-0.5"
      />
    </div>
  );
}

/** Choix exclusif en boutons (sorte de l'objet). */
export function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
}: Readonly<{
  label: string;
  value: V | null;
  options: readonly { value: V; label: string }[];
  onChange(value: V): void;
}>) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg border border-border bg-surface-2/60 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-7 rounded-md px-2 text-xs transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            value === o.value
              ? 'bg-primary/15 font-medium text-primary-strong'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
