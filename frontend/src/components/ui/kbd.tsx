import { cn } from '@/lib/utils';

/** Touche de clavier (raccourcis). */
function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border-strong bg-surface-2 px-1 font-sans text-[10px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_0_hsl(0_0%_100%/0.06)]',
        className,
      )}
      {...props}
    />
  );
}

export { Kbd };
