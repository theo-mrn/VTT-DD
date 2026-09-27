'use client';

/**
 * Infobulle minimale, même API que `@/components/ui/tooltip` de l'ancienne app
 * (Radix, absent du nouveau front) : `TooltipProvider`, `Tooltip`,
 * `TooltipTrigger asChild`, `TooltipContent side align`. Ouverte au survol ou
 * au focus, rendue dans un portail (comme Radix) pour ne pas être rognée.
 * Reprise de components/dice-roller/tooltip.tsx ; les gestionnaires du
 * déclencheur (clic d'un bouton d'outil…) sont conservés.
 */
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface TooltipState {
  open: boolean;
  set(open: boolean): void;
  anchor: RefObject<HTMLSpanElement | null>;
}

const TooltipContext = createContext<TooltipState | null>(null);

export function TooltipProvider({ children }: { children: ReactNode; delayDuration?: number }) {
  return <>{children}</>;
}

export function Tooltip({
  children,
  delayDuration = 0,
}: {
  children: ReactNode;
  delayDuration?: number;
}) {
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const set = (next: boolean) => {
    if (timer.current) window.clearTimeout(timer.current);
    if (next && delayDuration > 0)
      timer.current = window.setTimeout(() => setOpen(true), delayDuration);
    else setOpen(next);
  };
  return (
    <TooltipContext.Provider value={{ open, set, anchor }}>
      <span ref={anchor} className="relative inline-flex" onMouseLeave={() => set(false)}>
        {children}
      </span>
    </TooltipContext.Provider>
  );
}

type TriggerProps = {
  onMouseEnter?(e: unknown): void;
  onFocus?(e: unknown): void;
  onBlur?(e: unknown): void;
  onPointerDown?(e: unknown): void;
};

export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const ctx = useContext(TooltipContext)!;
  if (isValidElement(children)) {
    const own = (children as ReactElement<TriggerProps>).props;
    return cloneElement(children as ReactElement<TriggerProps>, {
      onMouseEnter: (e: unknown) => {
        own.onMouseEnter?.(e);
        ctx.set(true);
      },
      onFocus: (e: unknown) => {
        own.onFocus?.(e);
        ctx.set(true);
      },
      onBlur: (e: unknown) => {
        own.onBlur?.(e);
        ctx.set(false);
      },
      onPointerDown: (e: unknown) => {
        own.onPointerDown?.(e);
        ctx.set(false);
      },
    });
  }
  return (
    <span
      onMouseEnter={() => ctx.set(true)}
      onFocus={() => ctx.set(true)}
      onBlur={() => ctx.set(false)}
    >
      {children}
    </span>
  );
}

export function TooltipContent({
  children,
  className,
  side = 'top',
  align = 'center',
}: {
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
}) {
  const ctx = useContext(TooltipContext)!;
  if (!ctx.open || typeof document === 'undefined' || !ctx.anchor.current) return null;
  const r = ctx.anchor.current.getBoundingClientRect();
  const gap = 8;
  const horizontal = side === 'left' || side === 'right';
  const style: CSSProperties = horizontal
    ? {
        position: 'fixed',
        zIndex: 10030,
        top: r.top + r.height / 2,
        transform: 'translateY(-50%)',
        ...(side === 'right'
          ? { left: r.right + gap }
          : { right: window.innerWidth - r.left + gap }),
      }
    : {
        position: 'fixed',
        zIndex: 10030,
        ...(side === 'top'
          ? { bottom: window.innerHeight - r.top + gap }
          : { top: r.bottom + gap }),
        ...(align === 'start'
          ? { left: Math.max(8, r.left) }
          : align === 'end'
            ? { right: Math.max(8, window.innerWidth - r.right) }
            : { left: r.left + r.width / 2, transform: 'translateX(-50%)' }),
      };
  return createPortal(
    <div
      role="tooltip"
      style={style}
      className={cn('max-w-[calc(100vw-1rem)] rounded-lg', className)}
    >
      {children}
    </div>,
    document.body,
  );
}
