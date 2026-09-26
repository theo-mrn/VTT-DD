'use client';

/**
 * Case de valeur dont le détail du calcul s'ouvre au survol (comme les
 * popovers de l'ancienne fiche), au focus clavier ou au toucher. Le clic peut
 * être réservé à une autre action (tiroir d'ajustement d'une jauge) : le
 * détail reste alors accessible au survol et au focus.
 */
import type { LigneExplication } from '@vtt/rules';
import { useId, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatValue, OPERATION_LABELS, OPERATION_SYMBOLS } from './format';
import { focus, text, textMuted } from './styles';

export function DetailLines({ lines }: { lines: LigneExplication[] }) {
  return (
    <ul className="space-y-0.5">
      {lines.map((l, i) => (
        <li
          key={i}
          className={cn(
            'flex items-baseline justify-between gap-3',
            l.ignore ? cn(textMuted, 'line-through') : text,
          )}
          title={OPERATION_LABELS[l.operation]}
        >
          <span className="min-w-0 truncate">{l.nom}</span>
          <span className="shrink-0 font-mono tabular-nums">
            <span className={textMuted}>{OPERATION_SYMBOLS[l.operation]}</span>{' '}
            {formatValue(undefined, l.valeur)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function DetailPopover({
  title,
  detail,
  footer,
  onClick,
  label,
  children,
  className,
}: {
  title: string;
  detail: LigneExplication[] | undefined;
  /** Ligne ajoutée sous le détail (« Cliquer pour ajuster »). */
  footer?: ReactNode;
  /** Action du clic ; sans elle, le clic ouvre ou ferme le détail. */
  onClick?: () => void;
  /** Nom accessible du bouton. */
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const hover = useRef(false);
  const lines = detail ?? [];
  const hasDetail = lines.length > 0 || !!footer;

  if (!hasDetail && !onClick) return <div className={className}>{children}</div>;

  return (
    <div
      className="relative h-full"
      onMouseEnter={() => {
        hover.current = true;
        if (hasDetail) setOpen(true);
      }}
      onMouseLeave={() => {
        hover.current = false;
        setOpen(false);
      }}
    >
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        aria-label={label ?? (onClick ? title : `${title} : voir le détail du calcul`)}
        onClick={() => {
          if (onClick) {
            setOpen(false);
            onClick();
          } else if (!hover.current) setOpen((o) => !o);
        }}
        onFocus={() => hasDetail && setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        className={cn(
          'block h-full w-full text-left',
          onClick ? 'cursor-pointer transition-all hover:brightness-110' : 'cursor-help',
          focus,
          className,
        )}
      >
        {children}
      </button>
      {open && (
        <div
          id={id}
          role="tooltip"
          className="absolute left-1/2 top-full z-40 mt-1 w-64 max-w-[80vw] -translate-x-1/2 rounded-md border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-fond-profond)] p-3 text-left text-xs shadow-xl"
        >
          <p
            className={cn(
              text,
              'mb-1.5 border-b border-[color:var(--fiche-bordure)] pb-1.5 font-semibold',
            )}
          >
            {title}
          </p>
          {lines.length > 0 && <DetailLines lines={lines} />}
          {footer && <p className={cn(textMuted, 'mt-1.5 text-[11px]')}>{footer}</p>}
        </div>
      )}
    </div>
  );
}
