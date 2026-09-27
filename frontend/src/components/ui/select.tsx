'use client';

/**
 * Liste déroulante du design system (Radix Select), à la place du `<select>` natif :
 * même apparence que les champs (`styleChampBase`) et que les menus, clavier complet,
 * options groupées. `SelectField` couvre le cas courant (valeur, options, groupes) ;
 * les primitives restent exportées pour les cas particuliers.
 */
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { styleChampBase } from './input';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      styleChampBase,
      'flex h-10 items-center justify-between gap-2 px-3 text-left data-[placeholder]:text-subtle [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      className={cn(
        'relative z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-xl border border-border-strong bg-popover text-popover-foreground shadow-elevated',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
        position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="max-h-[inherit] overflow-y-auto p-1.5 [scrollbar-width:thin]">
        {children}
      </SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn(
      'px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wider text-subtle',
      className,
    )}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-default select-none items-center rounded-lg py-2 pl-2.5 pr-8 text-[13px] text-muted-foreground outline-none transition-colors',
      'focus:bg-surface-3 focus:text-foreground data-[state=checked]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    <span className="absolute right-2.5 flex size-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="size-4 text-primary" aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </span>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn('-mx-1.5 my-1.5 h-px bg-border', className)}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export interface SelectOption {
  valeur: string;
  nom: React.ReactNode;
  disabled?: boolean;
}
export interface SelectOptionGroup {
  groupe: string;
  options: SelectOption[];
}

/** Radix réserve la chaîne vide : on la remplace par une sentinelle, invisible pour l'appelant. */
const VIDE = '__vide__';
const versRadix = (v: string) => (v === '' ? VIDE : v);
const depuisRadix = (v: string) => (v === VIDE ? '' : v);

/**
 * Liste déroulante prête à l'emploi : `options` accepte des options simples et des groupes
 * (titre de groupe puis ses options), dans l'ordre donné.
 */
function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  invalid,
  className,
  contentClassName,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
}: {
  id?: string;
  value: string;
  onValueChange(value: string): void;
  options: (SelectOption | SelectOptionGroup)[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  contentClassName?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}) {
  return (
    <Select
      value={versRadix(value)}
      onValueChange={(v) => onValueChange(depuisRadix(v))}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={invalid ? true : undefined}
        className={className}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {options.map((o, i) =>
          'groupe' in o ? (
            <SelectGroup key={`g:${o.groupe}`}>
              {i > 0 && <SelectSeparator />}
              <SelectLabel>{o.groupe}</SelectLabel>
              {o.options.map((x) => (
                <SelectItem key={x.valeur} value={versRadix(x.valeur)} disabled={x.disabled}>
                  {x.nom}
                </SelectItem>
              ))}
            </SelectGroup>
          ) : (
            <SelectItem key={o.valeur} value={versRadix(o.valeur)} disabled={o.disabled}>
              {o.nom}
            </SelectItem>
          ),
        )}
      </SelectContent>
    </Select>
  );
}

export {
  Select,
  SelectContent,
  SelectField,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
};
