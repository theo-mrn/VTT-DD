'use client';

/**
 * Infobulle minimale, même API que `@/components/ui/tooltip` de l'ancienne app
 * (Radix, absent du nouveau front) : `Tooltip`, `TooltipTrigger asChild`,
 * `TooltipContent side align`. Ouverte au survol, au focus ou au toucher, rendue
 * dans un portail (comme Radix) pour ne pas être rognée par le panneau.
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

export function TooltipProvider({ children }: { children: ReactNode }) {
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
  onMouseEnter?(): void;
  onFocus?(): void;
  onBlur?(): void;
  onClick?(e: unknown): void;
  'aria-expanded'?: boolean;
};

export function TooltipTrigger({ children }: { children: ReactNode; asChild?: boolean }) {
  const ctx = useContext(TooltipContext)!;
  const handlers: TriggerProps = {
    onMouseEnter: () => ctx.set(true),
    onFocus: () => ctx.set(true),
    onBlur: () => ctx.set(false),
    onClick: () => ctx.set(!ctx.open),
    'aria-expanded': ctx.open,
  };
  if (isValidElement(children))
    return cloneElement(children as ReactElement<TriggerProps>, handlers);
  return <span {...handlers}>{children}</span>;
}

export function TooltipContent({
  children,
  className,
  side = 'top',
  align = 'center',
}: {
  children: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
  align?: 'start' | 'center' | 'end';
}) {
  const ctx = useContext(TooltipContext)!;
  if (!ctx.open || typeof document === 'undefined' || !ctx.anchor.current) return null;
  const r = ctx.anchor.current.getBoundingClientRect();
  const gap = 8;
  const style: CSSProperties = {
    position: 'fixed',
    zIndex: 10030,
    ...(side === 'top' ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
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
