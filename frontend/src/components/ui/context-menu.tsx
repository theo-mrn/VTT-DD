'use client';

/**
 * Menu contextuel, même API que `@/components/ui/context-menu` de l'ancienne
 * app (Radix, absent du nouveau front) pour ce qu'en fait la carte :
 * `ContextMenu`, `ContextMenuTrigger asChild disabled`, `ContextMenuContent`,
 * `ContextMenuItem`, `ContextMenuSeparator`. Comme Radix, le menu s'ouvre au
 * clic droit sur le déclencheur, sauf si son propre gestionnaire a déjà
 * appelé `preventDefault()` (clic droit sur un token : son menu à lui).
 */
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface MenuState {
  open: boolean;
  position: { x: number; y: number };
  openAt(x: number, y: number): void;
  close(): void;
}

const MenuContext = React.createContext<MenuState | null>(null);

function ContextMenu({
  children,
  onOpenChange,
}: {
  children: React.ReactNode;
  modal?: boolean;
  onOpenChange?(open: boolean): void;
}) {
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const value = React.useMemo<MenuState>(
    () => ({
      open,
      position,
      openAt: (x, y) => {
        setPosition({ x, y });
        setOpen(true);
        onOpenChange?.(true);
      },
      close: () => {
        setOpen(false);
        onOpenChange?.(false);
      },
    }),
    [open, position, onOpenChange],
  );
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

type TriggerChildProps = { onContextMenu?(e: React.MouseEvent): void };

function ContextMenuTrigger({
  children,
  disabled,
}: {
  children: React.ReactElement<TriggerChildProps>;
  asChild?: boolean;
  disabled?: boolean;
}) {
  const ctx = React.useContext(MenuContext)!;
  const own = children.props;
  return React.cloneElement(children, {
    onContextMenu: (e: React.MouseEvent) => {
      own.onContextMenu?.(e);
      if (disabled || e.defaultPrevented) return;
      e.preventDefault();
      ctx.openAt(e.clientX, e.clientY);
    },
  });
}

function ContextMenuContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(MenuContext)!;
  const ref = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });

  React.useLayoutEffect(() => {
    if (ctx.open && ref.current)
      setSize({ w: ref.current.offsetWidth, h: ref.current.offsetHeight });
  }, [ctx.open, ctx.position]);

  React.useEffect(() => {
    if (!ctx.open) return;
    const outside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) ctx.close();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') ctx.close();
    };
    const close = () => ctx.close();
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', key);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', key);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
    };
  }, [ctx]);

  if (!ctx.open || typeof document === 'undefined') return null;
  const x = Math.max(4, Math.min(ctx.position.x, window.innerWidth - size.w - 4));
  const y = Math.max(4, Math.min(ctx.position.y, window.innerHeight - size.h - 4));
  return createPortal(
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        'fixed z-[10030] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border p-1 shadow-md',
        className,
      )}
      style={{ left: x, top: y, maxHeight: window.innerHeight - 8 }}
    >
      {children}
    </div>,
    document.body,
  );
}

function ContextMenuItem({
  className,
  onClick,
  onSelect,
  disabled,
  inset,
  children,
}: {
  className?: string;
  onClick?(e: React.MouseEvent): void;
  onSelect?(e: Event): void;
  disabled?: boolean;
  inset?: boolean;
  children: React.ReactNode;
}) {
  const ctx = React.useContext(MenuContext)!;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled}
      onClick={(e) => {
        if (disabled) return;
        onClick?.(e);
        onSelect?.(e.nativeEvent);
        ctx.close();
      }}
      className={cn(
        'relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-white/10 aria-disabled:pointer-events-none aria-disabled:opacity-50',
        inset && 'pl-8',
        className,
      )}
    >
      {children}
    </div>
  );
}

function ContextMenuSeparator({ className }: { className?: string }) {
  return <div role="separator" className={cn('-mx-1 my-1 h-px bg-white/10', className)} />;
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
};
