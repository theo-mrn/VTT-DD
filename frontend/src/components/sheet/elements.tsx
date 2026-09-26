'use client';

/** Éléments communs aux blocs de la fiche : cadre de bloc, explication au survol, dialogue. */
import type { LigneExplication } from '@vtt/rules';
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useSheet } from './context';
import { formatValue, OPERATION_LABELS, OPERATION_SYMBOLS } from './format';
import { card, focus, titleFont, text, textAccent, textMuted } from './styles';

// ─── Bloc ────────────────────────────────────────────────────────────────────

export function Block({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn(card, className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className={cn(titleFont, textAccent, 'text-base tracking-wide sm:text-lg')}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SheetEmpty({ children }: { children: ReactNode }) {
  return (
    <p
      className={cn(
        textMuted,
        'rounded-lg border border-dashed border-[color:var(--fiche-bordure)] px-3 py-4 text-center text-sm',
      )}
    >
      {children}
    </p>
  );
}

// ─── Explication d'une valeur ────────────────────────────────────────────────

/**
 * Valeur cliquable dont le détail du calcul s'affiche au survol, au focus
 * clavier ou au toucher (mobile).
 */
export function Explanation({
  title,
  detail,
  children,
  className,
}: {
  title: string;
  detail: LigneExplication[] | undefined;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hover = useRef(false);
  const lines = detail ?? [];
  if (!lines.length) return <div className={className}>{children}</div>;

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => {
        hover.current = true;
        setOpen(true);
      }}
      onMouseLeave={() => {
        hover.current = false;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        aria-label={`${title} : voir le détail du calcul`}
        onClick={() => !hover.current && setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className={cn('w-full text-left', focus, className)}
      >
        {children}
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-64 max-w-[80vw] -translate-x-1/2 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-fond-profond)] p-3 text-left shadow-xl"
        >
          <p className={cn(text, 'mb-2 text-sm font-semibold')}>{title}</p>
          <ul className="space-y-1">
            {lines.map((l, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-baseline justify-between gap-3 text-xs',
                  l.ignore ? 'text-[color:var(--fiche-texte-secondaire)] line-through' : text,
                )}
                title={OPERATION_LABELS[l.operation]}
              >
                <span className="min-w-0 truncate">{l.nom}</span>
                <span className="shrink-0 tabular-nums">
                  <span className={textMuted}>{OPERATION_SYMBOLS[l.operation]}</span>{' '}
                  {formatValue(undefined, l.valeur)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Dialogue aux couleurs de la fiche ───────────────────────────────────────

/** Dialogue rendu hors du cadre (portail) : il repose lui-même les variables du thème. */
export function SheetDialog({
  open,
  onClose,
  title,
  description,
  children,
  large,
}: {
  open: boolean;
  onClose(): void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  large?: boolean;
}) {
  const { variables } = useSheet();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={large ? 'sm:max-w-2xl' : 'sm:max-w-lg'}>
        <div style={variables} className="max-h-[80vh] space-y-4 overflow-y-auto pr-1">
          <DialogHeader>
            <DialogTitle className={cn(titleFont, 'pr-8 text-white')}>{title}</DialogTitle>
            <DialogDescription className={cn(textMuted, !description && 'sr-only')}>
              {description ?? title}
            </DialogDescription>
          </DialogHeader>
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recherche ───────────────────────────────────────────────────────────────

/** Normalise un texte pour la recherche (casse et accents ignorés). */
export function normalize(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
