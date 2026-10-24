'use client';

/**
 * Filtre exclusif en menu déroulant (catégories, sortes, collections, sections) : préféré aux
 * pastilles, qui débordent dès qu'il y a des choix. Le bouton montre le choix et son nombre ;
 * sur la valeur « tout » (`allValue`), le nom du filtre, et il se colore dès qu'on filtre.
 */
import { Check, ChevronDown, ListFilter, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: string;
  label: ReactNode;
  count?: number;
}

export function FilterMenu({
  options,
  value,
  onChange,
  label,
  allValue,
  icon: Icon = ListFilter,
  className,
}: Readonly<{
  options: readonly FilterOption[];
  value: string;
  onChange(value: string): void;
  /** Nom du filtre : titre du menu, nom accessible, et texte du bouton sur `allValue`. */
  label: string;
  /** Valeur qui ne filtre rien (« Toutes ») : le bouton montre alors le nom du filtre. */
  allValue?: string;
  icon?: LucideIcon;
  className?: string;
}>) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const filtering = allValue !== undefined && value !== allValue;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label={label}
          className={cn(
            'min-w-0 max-w-[16rem] justify-start gap-1.5',
            filtering && 'text-primary',
            className,
          )}
        >
          <Icon />
          <span className="truncate">
            {allValue !== undefined && value === allValue ? label : current?.label}
          </span>
          {filtering && current?.count !== undefined && (
            <span className="text-[11px] tabular-nums opacity-70">{current.count}</span>
          )}
          <ChevronDown className="ml-auto opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChange(o.value)}
            className={cn(o.value === value && 'text-foreground')}
          >
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
            {o.count !== undefined && (
              <span className="text-[11px] tabular-nums text-subtle">{o.count}</span>
            )}
            <Check className={cn(o.value !== value && 'invisible')} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
