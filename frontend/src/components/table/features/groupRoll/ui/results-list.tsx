'use client';

import { useTranslations } from 'next-intl';
import { Crown, Skull } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { ranked, type GroupResult } from '../state';

/** Résultats d'un jet de groupe, meilleur d'abord ; les attendus en dessous, qui pulsent. */
export function ResultsList({
  results,
  waiting,
  compact = false,
}: Readonly<{ results: readonly GroupResult[]; waiting: readonly string[]; compact?: boolean }>) {
  const t = useTranslations('table.groupRoll');
  const liste = ranked(results);
  const meilleur = liste[0]?.total;
  const pire = liste.filter((r) => r.total !== null).at(-1)?.total;
  return (
    <ul className="space-y-1">
      {liste.map((r, i) => (
        <motion.li
          key={r.userId}
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2.5',
            compact ? 'py-1' : 'py-1.5',
            r.total !== null && r.total === meilleur && liste.length > 1 && 'bg-success/10',
            r.total !== null &&
              r.total === pire &&
              liste.length > 1 &&
              i > 0 &&
              'bg-destructive/10',
          )}
        >
          <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
          {r.critical === 'success' && (
            <Crown className="size-3.5 text-warning" aria-label={t('crit')} />
          )}
          {r.critical === 'failure' && (
            <Skull className="size-3.5 text-destructive" aria-label={t('fumble')} />
          )}
          <span className="min-w-8 text-right font-mono text-sm font-semibold tabular-nums">
            {r.symbols ?? (r.total === null ? '✓' : r.total)}
          </span>
        </motion.li>
      ))}
      {waiting.map((name) => (
        <li
          key={name}
          className={cn(
            'flex items-center gap-2 px-2.5 text-[13px] text-subtle',
            compact ? 'py-1' : 'py-1.5',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span
            className="size-1.5 animate-pulse rounded-full bg-subtle"
            aria-label={t('waiting')}
          />
        </li>
      ))}
    </ul>
  );
}
