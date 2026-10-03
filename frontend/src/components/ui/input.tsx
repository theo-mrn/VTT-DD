import * as React from 'react';

import { cn } from '@/lib/utils';

/** Classes communes aux champs de saisie (input, textarea, select). */
export const styleChampBase = cn(
  'w-full rounded-lg border border-input bg-surface-2/60 text-sm text-foreground shadow-surface',
  'placeholder:text-subtle transition-[border-color,box-shadow,background-color] duration-150',
  'hover:border-border-strong',
  'focus-visible:border-primary/60 focus-visible:bg-surface-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/10',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-[invalid=true]:border-destructive/60 aria-[invalid=true]:ring-destructive/10',
);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          styleChampBase,
          'flex h-10 px-3 py-2',
          'file:mr-3 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

/** Champ avec icône ou élément à gauche / à droite (recherche, mot de passe…). */
const InputGroup = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'> & { avant?: React.ReactNode; apres?: React.ReactNode }
>(({ className, avant, apres, ...props }, ref) => (
  <div className="relative flex w-full min-w-0 items-center">
    {avant && (
      <span className="pointer-events-none absolute left-3 flex items-center text-subtle [&_svg]:size-4">
        {avant}
      </span>
    )}
    <Input ref={ref} className={cn(avant && 'pl-9', apres && 'pr-10', className)} {...props} />
    {apres && <span className="absolute right-1.5 flex items-center">{apres}</span>}
  </div>
));
InputGroup.displayName = 'InputGroup';

export { Input, InputGroup };
