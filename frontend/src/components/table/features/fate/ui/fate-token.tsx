import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Un jeton : doré plein, ou en creux une fois dépensé. */
export function FateToken({ full, className }: Readonly<{ full: boolean; className?: string }>) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid place-items-center rounded-full transition-[background-color,box-shadow,opacity] duration-300',
        full
          ? 'bg-gradient-to-br from-primary to-primary-strong text-primary-foreground shadow-glow'
          : 'border border-dashed border-border-strong text-subtle opacity-60',
        className,
      )}
    >
      <Star className="size-[55%]" fill={full ? 'currentColor' : 'none'} />
    </span>
  );
}
