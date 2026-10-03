import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default: [
          'bg-primary text-primary-foreground',
          'shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25),0_1px_2px_0_hsl(0_0%_0%/0.4)]',
          'hover:bg-primary-strong',
        ],
        secondary: [
          'border border-border-strong bg-surface-2 text-foreground shadow-surface',
          'hover:border-white/15 hover:bg-surface-3',
        ],
        outline: 'border border-border-strong bg-transparent text-foreground hover:bg-surface-2',
        ghost: 'text-muted-foreground hover:bg-surface-3 hover:text-foreground',
        destructive: [
          'border border-destructive/30 bg-destructive/10 text-destructive',
          'hover:border-destructive/50 hover:bg-destructive/20',
        ],
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline active:scale-100',
      },
      size: {
        xs: 'h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5',
        sm: 'h-8 rounded-lg px-3 text-[13px]',
        default: 'h-9 rounded-lg px-4 text-sm',
        lg: 'h-11 rounded-xl px-5 text-[15px]',
        xl: 'h-12 rounded-xl px-6 text-base',
        icon: 'size-9 rounded-lg',
        'icon-sm': 'size-8 rounded-lg',
        'icon-xs': 'size-7 rounded-md [&_svg]:size-3.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Affiche un indicateur et désactive le bouton (ignoré avec asChild). */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, disabled, children, ...props },
    ref,
  ) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <Loader2 className="animate-spin" />}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
