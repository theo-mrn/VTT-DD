'use client';

/** Petits éléments partagés : recherche, onglets, confirmation, bouton d'écriture. */
import { RefreshCw, Search, X } from 'lucide-react';
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { dangerButton, field, ghostButton, tab, tabOff, tabOn, text, textMuted } from './styles';

export function SearchField({
  value,
  onChange,
  className,
  label = 'Rechercher',
}: {
  value: string;
  onChange(v: string): void;
  className?: string;
  label?: string;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Search
        className={cn(
          textMuted,
          'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
        )}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Rechercher…"
        aria-label={label}
        className={cn(field, 'pl-8 pr-8')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          className={cn(
            textMuted,
            'absolute right-2.5 top-1/2 -translate-y-1/2 hover:text-[color:var(--fiche-texte)]',
          )}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Onglets « Toutes » + un par groupe. `value` vaut null pour « Toutes ». */
export function GroupTabs({
  groups,
  value,
  onChange,
  label,
  allLabel = 'Toutes',
}: {
  groups: string[];
  value: string | null;
  onChange(v: string | null): void;
  label: string;
  allLabel?: string;
}) {
  if (!groups.length) return null;
  const items: [string | null, string][] = [
    [null, allLabel],
    ...groups.map((g): [string, string] => [g, g]),
  ];
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex h-9 max-w-full gap-0.5 overflow-x-auto rounded-lg border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-0.5 [scrollbar-width:thin]"
    >
      {items.map(([id, name]) => (
        <button
          key={id ?? ''}
          type="button"
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(tab, value === id ? tabOn : tabOff)}
        >
          {name}
        </button>
      ))}
    </div>
  );
}

/** Confirmation d'une action destructrice (réinitialisation). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onClose,
  themeVariables,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm(): Promise<unknown> | void;
  onClose(): void;
  themeVariables?: CSSProperties;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <div style={themeVariables} className={cn(text, 'space-y-3')}>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold text-red-400">
            <RefreshCw className="h-5 w-5" />
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className={cn(textMuted, 'text-sm')}>{children}</div>
          </DialogDescription>
          <div className="flex justify-end gap-3 pt-3">
            <button type="button" className={ghostButton} onClick={onClose}>
              Annuler
            </button>
            <button
              type="button"
              disabled={busy}
              className={cn(dangerButton, 'border border-red-500/50 bg-red-500/10 font-bold')}
              onClick={async () => {
                setBusy(true);
                await onConfirm();
                setBusy(false);
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton qui lance une écriture et reste désactivé pendant l'envoi. */
export function WriteButton({
  onClick,
  disabled,
  className,
  title,
  children,
  label,
}: {
  onClick(): Promise<unknown>;
  disabled?: boolean;
  className: string;
  title?: string;
  label?: string;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={disabled || busy}
      title={title}
      aria-label={label}
      aria-busy={busy || undefined}
      onClick={async (e) => {
        e.stopPropagation();
        setBusy(true);
        try {
          await onClick();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </button>
  );
}
