'use client';

/**
 * Bouton « Corbeille » (docs/nettoyage.md) : absent tant qu'elle est vide, il ouvre la liste des
 * éléments supprimés, chacun avec sa date de purge et « Restaurer ».
 */
import { Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { vignette } from '@/lib/assets';
import { type TrashItem, useRestore } from '@/lib/trash';
import { cn } from '@/lib/utils';

const day = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

export function TrashButton({
  items,
  className,
}: Readonly<{
  items: TrashItem[] | undefined;
  className?: string;
}>) {
  const restore = useRestore();
  if (!items?.length) return null;

  const restoreItem = (item: TrashItem) =>
    restore.mutate(item.id, {
      onSuccess: () => toast.success(`« ${item.name} » restauré`),
      onError: (err) => toast.error('Restauration impossible', { description: messageErreur(err) }),
    });

  return (
    <Popover>
      <Info texte="Corbeille">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className={cn('gap-1.5', className)}>
            <Trash2 />
            <span className="tabular-nums">{items.length}</span>
          </Button>
        </PopoverTrigger>
      </Info>
      <PopoverContent align="end" className="w-80 p-1.5">
        <ul className="max-h-80 overflow-y-auto">
          {items.map((item) => {
            const purge = new Date(item.purgeAt);
            return (
              <li key={item.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-surface-2 text-subtle">
                  {item.imageUrl ? (
                    <img
                      src={vignette(item.imageUrl, 72)}
                      alt=""
                      className="size-full object-cover object-top"
                      loading="lazy"
                    />
                  ) : (
                    <UserRound className="size-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">{item.name}</span>
                  <Info texte={`Supprimé définitivement le ${full.format(purge)}`}>
                    <span className="text-[11px] text-subtle">jusqu’au {day.format(purge)}</span>
                  </Info>
                </span>
                <Button
                  variant="outline"
                  size="xs"
                  loading={restore.isPending && restore.variables === item.id}
                  onClick={() => restoreItem(item)}
                >
                  Restaurer
                </Button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
