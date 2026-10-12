'use client';

import { useTranslations } from 'next-intl';
import { Lock, Plus, Send, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MAX_OPTIONS, poll, pollActions } from '../state';

/** Panneau du MJ : poser une question à choix, suivre les voix, clore. */
export function PollPanel() {
  const t = useTranslations('table.poll');
  const p = useStore(poll.store, (s) => s.value);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const remplies = options.map((o) => o.trim()).filter(Boolean);

  if (p) {
    const total = p.counts.reduce((a, b) => a + b, 0);
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-2xl bg-surface-2/50 p-4">
          <p className="text-[11px] font-medium text-muted-foreground">
            {p.closed ? t('closed') : t('live')} · {t('votes', { count: total })}
          </p>
          <p className="mt-0.5 text-sm font-semibold">{p.question}</p>
          <ul className="mt-3 space-y-1.5">
            {p.options.map((o, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{o}</span>
                <span className="font-semibold tabular-nums">{p.counts[i]}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex gap-1.5">
          {!p.closed && (
            <Button size="sm" variant="secondary" className="flex-1" onClick={pollActions.close}>
              <Lock />
              {t('close')}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="flex-1" onClick={pollActions.clear}>
            <Trash2 />
            {t('clear')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (remplies.length < 2) return;
        pollActions.start(question.trim() || t('defaultQuestion'), remplies);
        setQuestion('');
        setOptions(['', '']);
      }}
    >
      <Input
        autoFocus
        value={question}
        maxLength={160}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder={t('questionPlaceholder')}
        aria-label={t('question')}
        className="h-9 rounded-xl font-medium"
      />
      <ol className="space-y-1">
        {options.map((o, i) => (
          <li key={i} className="group flex items-center gap-1.5">
            <span className="w-5 shrink-0 text-right font-mono text-[11px] text-subtle">
              {i + 1}
            </span>
            <Input
              value={o}
              maxLength={80}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
              placeholder={t('option', { n: String(i + 1) })}
              aria-label={t('option', { n: String(i + 1) })}
              className="h-8 rounded-lg text-[13px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              disabled={options.length <= 2}
              aria-label={t('removeOption', { n: String(i + 1) })}
              onClick={() => setOptions(options.filter((_, j) => j !== i))}
              className="text-subtle opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X />
            </Button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={options.length >= MAX_OPTIONS}
          onClick={() => setOptions([...options, ''])}
        >
          <Plus />
          {t('addOption')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOptions([t('yes'), t('no')])}
        >
          {t('yesNo')}
        </Button>
      </div>
      <Button type="submit" size="sm" className="w-full" disabled={remplies.length < 2}>
        <Send />
        {t('start')}
      </Button>
    </form>
  );
}
