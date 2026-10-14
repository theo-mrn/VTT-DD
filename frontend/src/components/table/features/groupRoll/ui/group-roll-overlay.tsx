'use client';

import { useTranslations } from 'next-intl';
import { Dices, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useStore } from 'zustand';
import { useFichePersonnage } from '@/components/des/contexte-jet';
import { annoncerJet } from '@/components/des/jet-rapide';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { useLancer } from '@/lib/jets';
import { useCampaignEphemeral } from '@/lib/realtime';
import { useTable, useTableHeros } from '../../../contexte';
import { enqueue } from '../../shared/outbox';
import { GROUP_RESULT_KIND, groupRoll, groupRollActions, type GroupResult } from '../state';
import { ResultsList } from './results-list';

/**
 * Jet de groupe chez les joueurs : l'invite (« Le MJ demande : Perception »), un clic lance le
 * jet avec le héros incarné ; ensuite, son résultat et ceux des autres si le MJ les partage.
 * Chez le MJ : reçoit les résultats et les range.
 */
export function GroupRollOverlay() {
  const t = useTranslations('table.groupRoll');
  const { campagne, moi, gm } = useTable();
  const heros = useTableHeros();
  groupRoll.useSync();
  const g = useStore(groupRoll.store, (s) => s.value);
  const fiche = useFichePersonnage(heros);
  const lancer = useLancer();
  const [enCours, setEnCours] = useState(false);
  const [masque, setMasque] = useState<string | null>(null);

  const { send } = useCampaignEphemeral(campagne.id, [GROUP_RESULT_KIND], (m) => {
    if (!gm || m.kind !== GROUP_RESULT_KIND || !m.data) return;
    const d = m.data as { rollId?: string; result?: GroupResult };
    if (typeof d.rollId === 'string' && d.result)
      groupRollActions.record(d.rollId, { ...d.result, userId: m.from.userId });
  });

  if (gm || !g || masque === g.id || !g.targets.includes(moi.userId)) return null;
  const mien = g.results.find((r) => r.userId === moi.userId);
  const attendus = g.targets
    .filter((u) => !g.results.some((r) => r.userId === u))
    .map((u) => campagne.members.find((m) => m.userId === u)?.name ?? '…');

  const jouer = async () => {
    if (!heros) return;
    setEnCours(true);
    try {
      const jet = await lancer.mutateAsync({
        formula: g.formula,
        label: g.label || null,
        visibility: g.shared ? 'public' : 'private',
        roomId: campagne.id,
        characterId: heros.id,
        fiche: fiche.fiche,
      });
      annoncerJet(jet);
      const result: GroupResult = {
        userId: moi.userId,
        name: heros.name,
        total: jet.total,
        symbols: jet.symbolResult,
        critical: jet.critical,
      };
      // Le MJ range le résultat et le rediffuse ; ici on le voit tout de suite
      groupRoll.store.setState({
        value: { ...g, results: [...g.results.filter((r) => r.userId !== moi.userId), result] },
      });
      enqueue(`group-result:${g.id}`, () =>
        send(GROUP_RESULT_KIND, { rollId: g.id, result }, { gmOnly: true }),
      );
    } catch (e) {
      toast.error(t('rollFailed'), { description: messageErreur(e) });
    } finally {
      setEnCours(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.section
        key={g.id}
        aria-label={t('title')}
        initial={{ opacity: 0, y: -12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12 }}
        className="fixed left-1/2 top-[8.75rem] z-30 w-[min(22rem,calc(100%-2rem))] -translate-x-1/2"
      >
        <div className="rounded-3xl border border-border-strong bg-popover/95 p-4 shadow-elevated backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
              <Dices className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                {g.closed ? t('closed') : t('asked')}
              </p>
              <p className="truncate text-base font-semibold tracking-tight">
                {g.label || g.formula}
              </p>
              {g.label && <p className="truncate font-mono text-xs text-subtle">{g.formula}</p>}
            </div>
            {(mien || g.closed) && (
              <button
                type="button"
                onClick={() => setMasque(g.id)}
                aria-label={t('hide')}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {!mien && !g.closed && (
            <Button
              className="mt-3 w-full"
              disabled={enCours || !heros}
              onClick={() => void jouer()}
            >
              {enCours ? <Loader2 className="animate-spin" /> : <Dices />}
              {t('roll')}
            </Button>
          )}
          {(mien || g.closed) && g.shared && (
            <div className="mt-3">
              <ResultsList results={g.results} waiting={g.closed ? [] : attendus} compact />
            </div>
          )}
          {mien && !g.shared && (
            <p className="mt-3 text-[13px] text-muted-foreground">{t('sentToGm')}</p>
          )}
        </div>
      </motion.section>
    </AnimatePresence>
  );
}
