'use client';

/**
 * Onglets, même API que `@/components/ui/tabs` de l'ancienne app (Radix,
 * absent du nouveau front) : `Tabs defaultValue|value onValueChange`,
 * `TabsList`, `TabsTrigger value`, `TabsContent value`.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

interface TabsState {
  value: string;
  setValue(v: string): void;
}

const TabsContext = React.createContext<TabsState | null>(null);

function Tabs({
  value,
  defaultValue,
  onValueChange,
  className,
  children,
  ...props
}: Omit<React.HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> & {
  value?: string;
  defaultValue?: string;
  onValueChange?(value: string): void;
}) {
  const [inner, setInner] = React.useState(defaultValue ?? '');
  const current = value ?? inner;
  return (
    <TabsContext.Provider
      value={{
        value: current,
        setValue: (v) => {
          setInner(v);
          onValueChange?.(v);
        },
      }}
    >
      <div className={className} {...props}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="tablist"
      className={cn(
        'inline-flex h-9 items-center justify-center rounded-lg bg-[var(--bg-dark)] p-1 text-[var(--text-secondary)]',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({
  value,
  className,
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const ctx = React.useContext(TabsContext)!;
  const active = ctx.value === value;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      onClick={(e) => {
        onClick?.(e);
        ctx.setValue(value);
      }}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-[var(--bg-card)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const ctx = React.useContext(TabsContext)!;
  if (ctx.value !== value) return null;
  return <div role="tabpanel" data-state="active" className={className} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
