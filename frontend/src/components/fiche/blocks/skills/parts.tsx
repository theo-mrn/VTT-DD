'use client';

/**
 * Fenêtre de détail d'une compétence ou d'une capacité, et marques de rang. Le détail montre
 * tout (description assainie, bonus avec leur interrupteur et leur gestion, origine,
 * actions : activation, rang suivant) et renvoie au bloc Bonus.
 */
import { Plus, Route } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ContexteFiche } from '../../widgets';
import { echapLocal } from '../../bonus-editor/escape';
import { currencyName } from '../tree/model';
import type { SheetWrites } from '../tree/writes';
import { EntryDetails } from './entry-details';
import type { SkillCard } from './model';

export function RankMarks({ rank, max }: Readonly<{ rank: number; max: number }>) {
  if (max > 6)
    return (
      <span className="font-mono text-[11px] tabular text-muted-foreground">
        {rank}/{max}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5" aria-label={`Rang ${rank} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          className={cn('size-1.5 rounded-full', i < rank ? 'bg-primary' : 'bg-surface-3')}
        />
      ))}
    </span>
  );
}

export function offerText(ctx: ContexteFiche, card: SkillCard): string {
  const o = card.offer!;
  return o.possible
    ? `Rang ${o.cible} pour ${o.cout} ${currencyName(ctx.systeme, o.monnaie)}`
    : o.blocages.map((b) => b.message).join(' · ');
}

export function SkillDialog({
  ctx,
  card,
  writes,
  onClose,
}: Readonly<{
  ctx: ContexteFiche;
  card: SkillCard | null;
  writes: SheetWrites | undefined;
  onClose: () => void;
}>) {
  const sorte = card ? ctx.systeme.sortes.get(card.entry.sorte) : undefined;
  const on = !!card && card.activable && card.active;
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onEscapeKeyDown={(e) => echapLocal(e) && e.preventDefault()}
        className="sm:max-w-lg"
      >
        {card && (
          <>
            <DialogHeader>
              <DialogTitle
                className={cn(
                  'flex items-center gap-2 font-display text-xl',
                  on && 'text-primary-strong',
                )}
              >
                {card.activable && (
                  <span
                    className={cn(
                      'size-2.5 shrink-0 rounded-full',
                      on ? 'bg-success shadow-[0_0_6px_hsl(var(--success)/0.7)]' : 'bg-subtle/50',
                    )}
                    aria-hidden
                  />
                )}
                {card.entry.nom}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5">
                <span>{sorte?.nom}</span>
                {card.maxRank !== undefined && card.maxRank > 1 && (
                  <Badge>
                    Rang {card.rank}/{card.maxRank}
                  </Badge>
                )}
                {card.activable && (
                  <Badge ton={on ? 'succes' : 'neutre'}>{on ? 'Active' : 'Inactive'}</Badge>
                )}
                {card.origins.length > 0 && (
                  <Badge>
                    <Route />
                    {card.origins.join(', ')}
                  </Badge>
                )}
              </DialogDescription>
            </DialogHeader>

            <EntryDetails ctx={ctx} entry={card.entry} writes={writes} />

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                Fermer
              </Button>
              {writes && card.offer && (
                <Info texte={card.offer.possible ? undefined : offerText(ctx, card)}>
                  <span>
                    <Button
                      variant="secondary"
                      disabled={!card.offer.possible}
                      onClick={() => writes.buy(card.offer!.achat, card.offer!.objet)}
                    >
                      <Plus />
                      Rang {card.offer.cible} · {card.offer.cout}{' '}
                      {currencyName(ctx.systeme, card.offer.monnaie)}
                    </Button>
                  </span>
                </Info>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
