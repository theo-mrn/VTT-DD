'use client';

/**
 * Carte d'une compétence et sa fenêtre de détail. La carte reste compacte : nom, pastille
 * d'état pour une sorte activable, rang, valeur du champ filtré et quelques étiquettes de
 * bonus ou de jet ; le détail montre tout (description assainie, effets, origine, actions).
 */
import { Dices, Plus, Power, Sparkles } from 'lucide-react';
import type { KeyboardEvent } from 'react';
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
import { currencyName } from '../tree/model';
import type { SheetWrites } from '../tree/writes';
import { EntryDetails } from './entry-details';
import type { SkillCard } from './model';

const MAX_TAGS = 3;

function RankMarks({ rank, max }: { rank: number; max: number }) {
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

function offerText(ctx: ContexteFiche, card: SkillCard): string {
  const o = card.offer!;
  return o.possible
    ? `Rang ${o.cible} pour ${o.cout} ${currencyName(ctx.systeme, o.monnaie)}`
    : o.blocages.map((b) => b.message).join(' · ');
}

export function SkillCardView({
  card,
  ctx,
  writes,
  onOpen,
}: {
  card: SkillCard;
  ctx: ContexteFiche;
  writes: SheetWrites | undefined;
  onOpen: () => void;
}) {
  const on = card.activable && card.active;
  const owned = card.rank > 0 || !card.maxRank || !!card.possession;
  const tags = [
    ...card.bonuses.map((b) => ({ kind: 'bonus' as const, label: b.label, applied: b.applied })),
    ...card.rolls.map((label) => ({ kind: 'roll' as const, label, applied: true })),
  ];
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKey}
      className={cn(
        'group relative flex min-h-[3.25rem] cursor-pointer flex-col justify-center gap-1.5 rounded-xl border p-2.5 text-left transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        on
          ? 'border-primary/45 bg-primary/[0.06] shadow-[0_0_0_1px_hsl(var(--primary)/0.15)]'
          : 'border-border bg-surface-2/50 hover:border-border-strong hover:bg-surface-2',
        !owned && 'opacity-60 hover:opacity-100',
      )}
    >
      <div className="flex items-center gap-2">
        {card.activable && (
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              on ? 'bg-success shadow-[0_0_5px_hsl(var(--success)/0.7)]' : 'bg-subtle/50',
            )}
            aria-label={on ? 'Active' : 'Inactive'}
          />
        )}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[13px] font-semibold',
            on ? 'text-primary-strong' : 'text-foreground',
          )}
        >
          {card.entry.nom}
        </span>
        {card.maxRank !== undefined && card.maxRank > 1 && (
          <RankMarks rank={card.rank} max={card.maxRank} />
        )}
        {writes && card.offer && (
          <Info texte={offerText(ctx, card)}>
            <span>
              <Button
                variant="secondary"
                size="icon-xs"
                className="size-6"
                disabled={!card.offer.possible}
                onClick={(e) => {
                  e.stopPropagation();
                  writes.buy(card.offer!.achat, card.offer!.objet);
                }}
                aria-label={`Acheter un rang de ${card.entry.nom}`}
              >
                <Plus />
              </Button>
            </span>
          </Info>
        )}
      </div>
      {(card.filter || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1 overflow-hidden">
          {card.filter && card.filter.key !== '' && (
            <span className="rounded border border-border-strong px-1.5 py-0.5 text-[10px] leading-none text-subtle">
              {card.filter.label}
            </span>
          )}
          {tags.slice(0, MAX_TAGS).map((t, i) => (
            <span
              key={`${t.label}-${i}`}
              className={cn(
                'flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[10px] font-medium leading-none',
                t.kind === 'roll'
                  ? 'bg-info/10 text-info'
                  : t.applied
                    ? 'bg-primary/10 text-primary-strong'
                    : 'border border-dashed border-border-strong text-subtle',
              )}
            >
              {t.kind === 'roll' && <Dices className="size-2.5 shrink-0" />}
              <span className="truncate">{t.label}</span>
            </span>
          ))}
          {tags.length > MAX_TAGS && (
            <span className="text-[10px] text-subtle">+{tags.length - MAX_TAGS}</span>
          )}
        </div>
      )}
    </div>
  );
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

            <EntryDetails fiche={ctx.fiche} entry={card.entry} />
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
