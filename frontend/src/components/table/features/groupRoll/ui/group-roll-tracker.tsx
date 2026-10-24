'use client';

import { useTranslations } from 'next-intl';
import { Lock, RotateCcw, Trash2, UsersRound } from 'lucide-react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { useTable } from '../../../contexte';
import { groupRoll, groupRollActions } from '../state';
import { ResultsList } from './results-list';

/**
 * Suivi du jet de groupe chez le MJ, sous son lanceur de dés : qui a lancé, qui est attendu,
 * clore, redemander, retirer. Rien tant qu'aucun jet n'est demandé (bouton « Groupe »).
 */
export function GroupRollTracker() {
  const t = useTranslations('table.groupRoll');
  const { campagne } = useTable();
  const g = useStore(groupRoll.store, (s) => s.value);
  if (!g) return null;
  const attendus = g.targets
    .filter((u) => !g.results.some((r) => r.userId === u))
    .map((u) => campagne.members.find((m) => m.userId === u)?.name ?? '…');
  return (
    <section
      aria-label={t('title')}
      className="mt-3 space-y-3 rounded-2xl border border-border bg-card p-3 shadow-surface"
    >
      <div className="flex items-start gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
          <UsersRound className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-muted-foreground">
            {g.closed ? t('closed') : t('live')} · {g.results.length}/{g.targets.length}
          </p>
          <p className="truncate text-sm font-semibold">{g.label || g.formula}</p>
          {g.label && <p className="truncate font-mono text-xs text-subtle">{g.formula}</p>}
        </div>
      </div>
      <ResultsList results={g.results} waiting={g.closed ? [] : attendus} />
      <div className="flex gap-1.5">
        {!g.closed && (
          <Button size="sm" variant="secondary" className="flex-1" onClick={groupRollActions.close}>
            <Lock />
            {t('close')}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="flex-1"
          onClick={() => groupRollActions.start(g.label, g.formula, g.shared, g.targets)}
        >
          <RotateCcw />
          {t('again')}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={t('clear')}
          onClick={groupRollActions.clear}
        >
          <Trash2 />
        </Button>
      </div>
    </section>
  );
}
