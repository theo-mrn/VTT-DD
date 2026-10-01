import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium leading-none [&_svg]:size-3 [&_svg]:shrink-0',
  {
    variants: {
      ton: {
        neutre: 'border-border-strong bg-surface-2 text-muted-foreground',
        primaire: 'border-primary/25 bg-primary/10 text-primary-strong',
        succes: 'border-success/25 bg-success/10 text-success',
        alerte: 'border-warning/25 bg-warning/10 text-warning',
        danger: 'border-destructive/25 bg-destructive/10 text-destructive',
        info: 'border-info/25 bg-info/10 text-info',
        arcane: 'border-arcane/25 bg-arcane/10 text-arcane',
        verre: 'border-white/10 bg-black/60 text-white',
      },
      taille: {
        sm: 'h-5 px-2 text-[11px]',
        md: 'h-6 px-2.5 text-xs',
      },
    },
    defaultVariants: { ton: 'neutre', taille: 'sm' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Petite pastille colorée avant le texte (statut « en ligne »…). */
  point?: boolean;
}

function Badge({ className, ton, taille, point, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ ton, taille }), className)} {...props}>
      {point && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
