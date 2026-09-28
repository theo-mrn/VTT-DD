'use client';

/**
 * Fenêtre de détail d'une compétence ou d'une capacité, et marques de rang. Le détail montre
 * tout (description assainie, bonus et leur état, origine, actions : activation, rang
 * suivant) et renvoie au bloc Bonus, seul endroit où les bonus s'activent ou se coupent.
 */
import { Plus, Power, Sparkles } from 'lucide-react';
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
import { allerAuBlocBonus, ancreBonus } from '../effects/model';
import { currencyName } from '../tree/model';
import type { SheetWrites } from '../tree/writes';
import { EntryDetails } from './entry-details';
import type { SkillCard } from './model';

export function RankMarks({ rank, max }: { rank: number; max: number }) {
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
}: {
  ctx: ContexteFiche;
  card: SkillCard | null;
  writes: SheetWrites | undefined;
  onClose: () => void;
}) {
  const sorte = card ? ctx.systeme.sortes.get(card.entry.sorte) : undefined;
  const on = !!card && card.activable && card.active;
  return (
    <Dialog open={!!card} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
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
                    <Sparkles />
                    {card.origins.join(', ')}
                  </Badge>
                )}
              </DialogDescription>
            </DialogHeader>

            <EntryDetails
              fiche={ctx.fiche}
              entry={card.entry}
              onManageBonus={
                typeof document !== 'undefined' &&
                document.getElementById(ancreBonus(ctx.personnage.id))
                  ? () => {
                      onClose();
                      // Après la fermeture : le focus revient d'abord à la carte, puis va au bloc
                      window.setTimeout(() => allerAuBlocBonus(ctx.personnage.id), 150);
                    }
                  : undefined
              }
            />
            {card.activable && !on && card.bonuses.some((b) => !b.applied) && (
              <p className="text-xs text-subtle">
                Les effets s’appliquent une fois l’entrée active.
              </p>
            )}

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
              {writes && card.activable && (card.rank > 0 || !card.maxRank || card.possession) && (
                <Button
                  variant={on ? 'destructive' : 'default'}
                  onClick={() => {
                    writes.setActive(card.entry.id, !on);
                    onClose();
                  }}
                >
                  <Power />
                  {on ? 'Désactiver' : 'Activer'}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
