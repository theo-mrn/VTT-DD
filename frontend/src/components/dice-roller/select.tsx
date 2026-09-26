'use client';

/**
 * Liste déroulante minimale, même API que `@/components/ui/select` de
 * l'ancienne app (Radix, absent du nouveau front) : `Select value
 * onValueChange onOpenChange`, `SelectTrigger`, `SelectValue placeholder`,
 * `SelectContent`, `SelectItem value`. Le menu est rendu dans un portail sous
 * le déclencheur (comme Radix), pour ne pas être rogné par le panneau.
 */
import { Check, ChevronDown } from 'lucide-react';
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface SelectState {
  value: string;
  open: boolean;
  setOpen(open: boolean): void;
  choose(value: string): void;
  label: ReactNode;
  trigger: RefObject<HTMLButtonElement | null>;
  content: RefObject<HTMLDivElement | null>;
}

const SelectContext = createContext<SelectState | null>(null);

/** Libellé de l'élément choisi, cherché dans l'arbre des enfants. */
function findLabel(children: ReactNode, value: string): ReactNode {
  let found: ReactNode = null;
  Children.forEach(children, (child) => {
    if (found !== null || !isValidElement(child)) return;
    const props = child.props as { value?: string; children?: ReactNode };
    if (child.type === SelectItem && props.value === value) found = props.children ?? null;
    else if (props.children) found = findLabel(props.children, value);
  });
  return found;
}

export function Select({
  value,
  onValueChange,
  onOpenChange,
  children,
}: {
  value: string;
  onValueChange(value: string): void;
  onOpenChange?(open: boolean): void;
  children: ReactNode;
}) {
  const [open, setOpenState] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    onOpenChange?.(next);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current && !ref.current.contains(target) && !content.current?.contains(target)) {
        setOpenState(false);
        onOpenChange?.(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenState(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open, onOpenChange]);

  return (
    <SelectContext.Provider
      value={{
        value,
        open,
        setOpen,
        choose: (v) => {
          onValueChange(v);
          setOpen(false);
        },
        label: value ? findLabel(children, value) : null,
        trigger,
        content,
      }}
    >
      <div ref={ref} className="relative w-full">
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ctx = useContext(SelectContext)!;
  return (
    <button
      ref={ctx.trigger}
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      className={cn('flex items-center justify-between gap-2 px-3 text-left', className)}
      style={style}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 opacity-60 transition-transform', ctx.open && 'rotate-180')}
      />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = useContext(SelectContext)!;
  return <>{ctx.label ?? <span className="opacity-70">{placeholder}</span>}</>;
}

export function SelectContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(SelectContext)!;
  const [, relayout] = useState(0);
  useEffect(() => {
    if (!ctx.open) return;
    const update = () => relayout((n) => n + 1);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [ctx.open]);
  if (!ctx.open || typeof document === 'undefined' || !ctx.trigger.current) return null;
  const r = ctx.trigger.current.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const up = below < 220 && r.top > below;
  return createPortal(
    <div
      ref={ctx.content}
      role="listbox"
      className={cn('overflow-y-auto rounded-lg border p-1 shadow-2xl', className)}
      style={{
        position: 'fixed',
        zIndex: 10030,
        left: r.left,
        width: r.width,
        ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
        maxHeight: Math.max(160, (up ? r.top : below) - 12),
        background: 'var(--bg-darker)',
        borderColor: 'var(--border-color)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(SelectContext)!;
  const selected = ctx.value === value;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => ctx.choose(value)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white/10"
    >
      <span className="min-w-0">{children}</span>
      {selected && <Check className="h-3.5 w-3.5 shrink-0" />}
    </button>
  );
}
