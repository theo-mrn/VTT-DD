import { cn } from '@/lib/utils';

/** Bloc de chargement avec reflet qui balaie. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-2',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/[0.04] before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
