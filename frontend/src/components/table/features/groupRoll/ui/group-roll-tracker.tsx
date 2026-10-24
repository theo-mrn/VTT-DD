'use client';

import { useTranslations } from 'next-intl';
import { Crown, Lock, RotateCcw, Skull, UsersRound, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { groupRoll, groupRollActions, ranked } from '../state';

/**
 * Suivi du jet de groupe chez le MJ, en bas de son lanceur de dés : l'intitulé et l'avancée, les
 * résultats en étiquettes (meilleur d'abord, en vert ; le plus bas en rouge), les attendus qui
 * pulsent, et clore, redemander, retirer. Rien tant qu'aucun jet n'est demandé.
 */
export function GroupRollTracker() {
  const t = useTranslations('table.groupRoll');
  const { campagne } = useTable();
  const g = useStore(groupRoll.store, (s) => s.value);
  if (!g) return null;
  const liste = ranked(g.results);
  const totaux = liste.flatMap((r) => (r.total === null ? [] : [r.total]));
  const meilleur = totaux.length > 1 ? totaux[0] : undefined;
  const pire = totaux.length > 1 ? totaux.at(-1) : undefined;
  const attendus = g.closed
    ? []
    : g.targets
        .filter((u) => !g.results.some((r) => r.userId === u))
        .map((u) => campagne.members.find((m) => m.userId === u)?.name ?? '…');

  return (
    <section aria-label={t('title')} className="mt-2 border-t border-border/70 pt-2">
      <div className="flex items-center gap-1.5">
        <UsersRound className="size-3.5 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 truncate text-[11px]">
          <span className="font-semibold text-foreground">{g.label || g.formula}</span>
          <span className="text-subtle">
            {' · '}
            {g.closed ? t('closed') : `${g.results.length}/${g.targets.length}`}
          </span>
        </p>
        {!g.closed && (
          <Action label={t('close')} onClick={groupRollActions.close}>
            <Lock />
          </Action>
        )}
        <Action
          label={t('again')}
          onClick={() => groupRollActions.start(g.label, g.formula, g.shared, g.targets)}
        >
          <RotateCcw />
        </Action>
        <Action label={t('clear')} onClick={groupRollActions.clear}>
          <X />
        </Action>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-1">
        {liste.map((r) => (
          <motion.li
            key={r.userId}
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
              tone(r.total, meilleur, pire),
            )}
          >
            <span className="max-w-[7rem] truncate text-muted-foreground">{r.name}</span>
            {r.critical === 'success' && (
              <Crown className="size-3 text-warning" aria-label={t('crit')} />
            )}
            {r.critical === 'failure' && (
              <Skull className="size-3 text-destructive" aria-label={t('fumble')} />
            )}
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {r.symbols ?? (r.total === null ? '✓' : r.total)}
            </span>
          </motion.li>
        ))}
        {attendus.map((name) => (
          <li
            key={name}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-dashed border-border px-1.5 py-0.5 text-[11px] text-subtle"
          >
            <span className="max-w-[7rem] truncate">{name}</span>
            <span
              className="size-1.5 animate-pulse rounded-full bg-subtle"
              aria-label={t('waiting')}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Fond d'une étiquette : le meilleur total en vert, le plus bas en rouge. */
function tone(total: number | null, best: number | undefined, worst: number | undefined) {
  if (total !== null && total === best) return 'bg-success/15';
  if (total !== null && total === worst) return 'bg-destructive/10';
  return 'bg-surface-2/80';
}

function Action({
  label,
  onClick,
  children,
}: Readonly<{ label: string; onClick(): void; children: ReactNode }>) {
  return (
    <Info texte={label}>
      <Button size="icon-xs" variant="ghost" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </Info>
  );
}
