'use client';

import { useTranslations } from 'next-intl';
import { Check, Vote, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { useStore } from 'zustand';
import { useCampaignEphemeral } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { enqueue } from '../../shared/outbox';
import { myVotes, poll, pollActions, POLL_VOTE_KIND } from '../state';

/** Sondage en cours, chez tous : en bas au centre, on vote d'un clic, les barres suivent. */
export function PollOverlay() {
  const t = useTranslations('table.poll');
  const { campagne, moi, gm } = useTable();
  poll.useSync();
  const p = useStore(poll.store, (s) => s.value);
  const mine = useStore(myVotes, (s) => (p ? s[p.id] : undefined));
  const [masque, setMasque] = useState<string | null>(null);

  // MJ : reçoit les voix ; joueurs : envoient la leur au MJ seul
  const { send } = useCampaignEphemeral<{ pollId: string; option: number }>(
    campagne.id,
    [POLL_VOTE_KIND],
    (m) => {
      if (gm && m.kind === POLL_VOTE_KIND && m.data)
        pollActions.tally(m.data.pollId, m.from.userId, m.data.option);
    },
  );

  const voter = (option: number) => {
    if (!p || p.closed) return;
    myVotes.setState({ [p.id]: option });
    if (gm) pollActions.tally(p.id, moi.userId, option);
    else
      enqueue(POLL_VOTE_KIND, () =>
        send(POLL_VOTE_KIND, { pollId: p.id, option }, { gmOnly: true }),
      );
  };

  const total = p ? p.counts.reduce((a, b) => a + b, 0) : 0;
  const resultats = p !== null && (p.closed || mine !== undefined || gm);
  const visible = p !== null && masque !== p.id;

  return (
    <AnimatePresence>
      {visible && p && (
        <motion.section
          key={p.id}
          aria-label={t('title')}
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          className="fixed bottom-[calc(var(--table-dock-h)+1.5rem)] left-1/2 z-30 w-[min(26rem,calc(100%-2rem))] -translate-x-1/2"
        >
          <div className="rounded-3xl border border-border-strong bg-popover/95 p-4 shadow-elevated backdrop-blur">
            <div className="mb-3 flex items-start gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                <Vote className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-muted-foreground">
                  {p.closed ? t('closed') : t('title')} · {t('votes', { count: total })}
                </p>
                <p className="text-sm font-semibold leading-snug">{p.question}</p>
              </div>
              <button
                type="button"
                onClick={() => setMasque(p.id)}
                aria-label={t('hide')}
                className="grid size-7 shrink-0 place-items-center rounded-lg text-subtle hover:bg-surface-3 hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <ul className="space-y-1.5">
              {p.options.map((o, i) => {
                const part = total ? p.counts[i]! / total : 0;
                const moiCi = mine === i;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={p.closed}
                      onClick={() => voter(i)}
                      aria-pressed={moiCi}
                      className={cn(
                        'relative flex h-10 w-full items-center gap-2 overflow-hidden rounded-xl border px-3 text-left text-[13px] font-medium transition-colors',
                        moiCi
                          ? 'border-primary/50 text-foreground'
                          : 'border-border bg-surface-2/40 text-foreground/90 enabled:hover:border-border-strong',
                      )}
                    >
                      {resultats && (
                        <motion.span
                          aria-hidden
                          className={cn(
                            'absolute inset-y-0 left-0',
                            moiCi ? 'bg-primary/20' : 'bg-surface-3',
                          )}
                          initial={false}
                          animate={{ width: `${part * 100}%` }}
                          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
                        />
                      )}
                      <span className="relative min-w-0 flex-1 truncate">{o}</span>
                      {moiCi && <Check className="relative size-4 text-primary" aria-hidden />}
                      {resultats && (
                        <span className="relative text-xs tabular-nums text-muted-foreground">
                          {Math.round(part * 100)} %
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
