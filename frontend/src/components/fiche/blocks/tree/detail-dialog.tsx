'use client';

/**
 * Détail d'un rang de voie ou d'un nœud d'arbre : entrées obtenues, coût, raisons d'un
 * blocage (moteur), achat et remboursement par les opérations de la fiche.
 */
import { useTranslations } from 'next-intl';
import { translate } from '@/i18n/runtime';
import type { ContexteFiche } from '../../widgets';
import type { ObjetAchetable } from '@vtt/rules';
import { AlertTriangle, Check, Lock, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
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
import { echapLocal } from '../../bonus-editor/escape';
import { EntryDetails } from '../skills/entry-details';
import {
  currencyName,
  type NodeView,
  type PathRankView,
  type PathView,
  type TreeView,
} from './model';
import type { SheetWrites } from './writes';

export type TreeSelection =
  | { kind: 'rank'; path: PathView; rank: PathRankView }
  | { kind: 'node'; tree: TreeView; node: NodeView };

export function TreeDetailDialog({
  ctx,
  writes,
  selection,
  onClose,
}: Readonly<{
  ctx: ContexteFiche;
  writes: SheetWrites | undefined;
  selection: TreeSelection | null;
  onClose: () => void;
}>) {
  const t = useTranslations();
  const { systeme } = ctx;
  const cur = (id: string | undefined) => currencyName(systeme, id);

  const info = useMemo(() => {
    if (!selection) return null;
    if (selection.kind === 'rank') {
      const { path, rank } = selection;
      const isTop = rank.owned && rank.rank === path.rank;
      return {
        title: rank.entries.map((e) => e.nom).join(' · ') || `Rang ${rank.rank}`,
        subtitle: `${path.entry.nom} · rang ${rank.rank}`,
        entries: rank.entries,
        owned: rank.owned,
        offer: rank.offer,
        cost: rank.offer?.cout,
        currency: rank.offer?.monnaie,
        refundIndex: isTop ? path.refundIndex : undefined,
        locked: !rank.owned && !rank.offer,
        lockedText: translate('sheet.tree.unlockFirst', { rank: path.rank + 1 }),
      };
    }
    const { tree, node } = selection;
    return {
      title: node.entry.nom,
      subtitle: tree.tree.nom,
      entries: [node.entry],
      owned: node.state === 'owned',
      offer: node.offer,
      cost: node.cost,
      currency: node.currency,
      refundIndex: node.refundIndex,
      locked: false,
      lockedText: '',
    };
  }, [selection]);

  // Remboursement vérifié par le moteur avant d'être proposé (nœuds qui en dépendent…)
  const refundCheck = useMemo(
    () =>
      info?.refundIndex !== undefined && writes?.refund
        ? writes.refund.check(info.refundIndex)
        : null,
    [info, writes],
  );

  const offer: ObjetAchetable | undefined = info?.offer;
  const rankNote =
    selection?.kind === 'node' && selection.node.entryRank > 0
      ? `Rang actuel : ${selection.node.entryRank}`
      : null;

  return (
    <Dialog open={!!selection} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        onEscapeKeyDown={(e) => echapLocal(e) && e.preventDefault()}
        className="sm:max-w-lg"
      >
        {info && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl">{info.title}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5">
                <span>{info.subtitle}</span>
                {info.owned && (
                  <Badge ton="primaire">
                    <Check />
                    {t('sheet.tree.owned')}
                  </Badge>
                )}
                {!info.owned && offer?.possible && (
                  <Badge ton="succes">{t('sheet.tree.available')}</Badge>
                )}
                {!info.owned && !offer?.possible && (
                  <Badge>
                    <Lock />
                    {t('sheet.tree.locked')}
                  </Badge>
                )}
                {info.cost !== undefined && (
                  <Badge taille="sm">
                    {info.cost} {cur(info.currency)}
                  </Badge>
                )}
                {rankNote && <Badge taille="sm">{rankNote}</Badge>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {info.entries.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('sheet.tree.noEntry')}</p>
              )}
              {info.entries.map((e) => (
                <div key={e.id} className="space-y-2">
                  {info.entries.length > 1 && (
                    <p className="text-sm font-semibold text-primary-strong">{e.nom}</p>
                  )}
                  <EntryDetails ctx={ctx} entry={e} writes={writes} />
                </div>
              ))}

              {!info.owned && offer && !offer.possible && offer.blocages.length > 0 && (
                <ul className="space-y-1 rounded-lg border border-warning/25 bg-warning/5 p-3 text-[13px] text-warning">
                  {offer.blocages.map((b) => (
                    <li key={b.code + b.message} className="flex gap-2">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      {b.message}
                    </li>
                  ))}
                </ul>
              )}
              {info.locked && <p className="text-[13px] text-subtle">{info.lockedText}</p>}
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose}>
                {t('common.actions.close')}
              </Button>
              {writes?.refund && info.refundIndex !== undefined && refundCheck && (
                <Info texte={refundCheck.ok ? t('sheet.tree.refundHint') : refundCheck.erreur}>
                  <span>
                    <Button
                      variant="destructive"
                      disabled={!refundCheck.ok}
                      onClick={() => {
                        writes.refund!.run(info.refundIndex!);
                        onClose();
                      }}
                    >
                      <Undo2 />
                      {t('sheet.tree.refund')}
                    </Button>
                  </span>
                </Info>
              )}
              {writes && !info.owned && offer && (
                <Button
                  disabled={!offer.possible}
                  onClick={() => {
                    writes.buy(offer.achat, offer.objet);
                    onClose();
                  }}
                >
                  Acheter · {offer.cout} {cur(offer.monnaie)}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
