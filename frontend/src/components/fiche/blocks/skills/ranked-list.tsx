'use client';

/**
 * Vue des entrées dont les rangs s'achètent directement (compétences à rangs) : tout le
 * catalogue de la sorte, rang 0 compris, regroupé par première étiquette. Nom, attribut
 * lié (champ de la sorte), marques de rang et « + » pour acheter le rang suivant (coût ou
 * blocage en info-bulle). Le détail s'ouvre au clic sur le nom.
 */
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ContexteFiche } from '../../widgets';
import type { SheetWrites } from '../tree/writes';
import type { RankedGroup } from './abilities';
import type { SkillCard } from './model';
import { offerText, RankMarks } from './parts';

/** Abréviation de l'attribut qu'un champ `attribut` de la sorte lie à l'entrée. */
function linkedAttribute(ctx: ContexteFiche, card: SkillCard): string | null {
  const sorte = ctx.systeme.sortes.get(card.entry.sorte);
  const champ = sorte?.champs.find((c) => c.type === 'attribut');
  const v = champ ? card.entry.champs[champ.id] : undefined;
  if (typeof v !== 'string') return null;
  const a = ctx.fiche.entite.attributs.get(v);
  return a?.abrege ?? a?.nom ?? v;
}

export function RankedList({
  ctx,
  groups,
  matches,
  writes,
  onOpen,
}: {
  ctx: ContexteFiche;
  groups: RankedGroup[];
  matches: (card: SkillCard) => boolean;
  writes: SheetWrites | undefined;
  onOpen: (card: SkillCard) => void;
}) {
  const sections = groups.flatMap((g) =>
    g.groups
      .map((s) => ({ ...s, key: `${g.sorte.id}:${s.key}`, cards: s.cards.filter(matches) }))
      .filter((s) => s.cards.length),
  );
  if (!sections.length)
    return <p className="py-6 text-center text-sm text-muted-foreground">Aucun résultat.</p>;
  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <section key={s.key} aria-label={s.label ?? undefined}>
          {s.label && (
            <h3 className="mb-1 px-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle">
              {s.label}
            </h3>
          )}
          <ul className="grid gap-x-4 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
            {s.cards.map((card) => {
              const attr = linkedAttribute(ctx, card);
              return (
                <li
                  key={card.entry.id}
                  className="flex min-h-11 items-center gap-2 border-b border-border py-0.5 sm:min-h-9"
                >
                  <button
                    type="button"
                    onClick={() => onOpen(card)}
                    className={cn(
                      'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left sm:min-h-8',
                      'transition-colors duration-150 hover:bg-surface-2 motion-reduce:transition-none',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                  >
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-[13px]',
                        card.rank > 0 ? 'font-medium text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {card.entry.nom}
                    </span>
                    {attr && (
                      <span className="shrink-0 font-mono text-[10px] uppercase text-subtle">
                        {attr}
                      </span>
                    )}
                    {card.maxRank !== undefined && (
                      <RankMarks rank={card.rank} max={card.maxRank} />
                    )}
                  </button>
                  {writes && card.offer && (
                    <Info texte={offerText(ctx, card)}>
                      <span>
                        <Button
                          variant="secondary"
                          size="icon-xs"
                          className="size-9 sm:size-7"
                          disabled={!card.offer.possible}
                          onClick={() => writes.buy(card.offer!.achat, card.offer!.objet)}
                          aria-label={`Acheter le rang ${card.offer.cible} de ${card.entry.nom} : ${offerText(ctx, card)}`}
                        >
                          <Plus />
                        </Button>
                      </span>
                    </Info>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
