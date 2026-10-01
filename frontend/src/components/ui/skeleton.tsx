import { cn } from '@/lib/utils';

/**
 * Bloc de chargement avec reflet qui balaie : trois passages puis fixe (des dizaines de blocs à
 * l'écran ne gardent pas chacun une animation sans fin), aucun en mouvement réduit.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-lg bg-surface-2',
        'before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:[animation-iteration-count:3] motion-reduce:before:animate-none before:from-transparent before:via-white/[0.04] before:to-transparent',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
