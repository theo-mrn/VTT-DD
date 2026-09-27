'use client';

/**
 * Zone défilante, même API que `@/components/ui/scroll-area` de l'ancienne app
 * (Radix, absent du nouveau front) : un conteneur à défilement natif.
 */
import * as React from 'react';
import { cn } from '@/lib/utils';

const ScrollArea = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn('relative overflow-auto', className)} {...props}>
      {children}
    </div>
  ),
);
ScrollArea.displayName = 'ScrollArea';

/** Barre de défilement : native, rien à rendre. */
function ScrollBar(_props: { orientation?: 'vertical' | 'horizontal'; className?: string }) {
  return null;
}

export { ScrollArea, ScrollBar };
