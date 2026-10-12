'use client';

import { useTranslations } from 'next-intl';
import { Eye, EyeOff, Minus, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useStore } from 'zustand';
import { Notice } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { clockActions, clocks, SEGMENTS } from '../state';
import { ClockFace } from './clock-face';
import { Hourglass } from 'lucide-react';

/** Panneau du MJ : créer des horloges, les faire avancer d'un clic, les montrer ou les cacher. */
export function ClocksPanel() {
  const t = useTranslations('table.clocks');
  const liste = useStore(clocks.store, (s) => s.value) ?? [];
  const [name, setName] = useState('');
  const [segments, setSegments] = useState<number>(6);

  return (
    <div className="space-y-4 p-4">
      <form
        className="space-y-2 rounded-2xl bg-surface-2/50 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          clockActions.add(name.trim() || t('defaultName'), segments);
          setName('');
        }}
      >
        <Input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('namePlaceholder')}
          aria-label={t('name')}
          className="h-9 rounded-xl"
        />
        <div className="flex items-center gap-1">
          {SEGMENTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={segments === n}
              onClick={() => setSegments(n)}
              className={cn(
                'h-8 flex-1 rounded-lg text-xs font-semibold tabular-nums transition-colors',
                segments === n
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-surface-3/70 text-muted-foreground hover:text-foreground',
              )}
            >
              {n}
            </button>
          ))}
          <Button type="submit" size="sm" className="ml-1">
            <Plus />
            {t('add')}
          </Button>
        </div>
      </form>

      {!liste.length && <Notice icon={Hourglass} title={t('empty')} description={t('emptyHint')} />}

      <ul className="space-y-2">
        {liste.map((c) => (
          <li
            key={c.id}
            className={cn(
              'group flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-3',
              !c.visible && 'border-dashed',
            )}
          >
            <ClockFace
              segments={c.segments}
              filled={c.filled}
              className="size-16"
              label={t('progress', {
                name: c.name,
                filled: String(c.filled),
                segments: String(c.segments),
              })}
              onSegment={(i) =>
                clockActions.update(c.id, { filled: i + 1 === c.filled ? i : i + 1 })
              }
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate text-sm font-semibold">{c.name}</p>
              <div className="flex items-center gap-1">
                <Button
                  size="icon-xs"
                  variant="secondary"
                  aria-label={t('less')}
                  disabled={c.filled === 0}
                  onClick={() => clockActions.update(c.id, { filled: c.filled - 1 })}
                >
                  <Minus />
                </Button>
                <span className="w-10 text-center text-xs font-semibold tabular-nums">
                  {c.filled}/{c.segments}
                </span>
                <Button
                  size="icon-xs"
                  variant="secondary"
                  aria-label={t('more')}
                  disabled={c.filled >= c.segments}
                  onClick={() => clockActions.update(c.id, { filled: c.filled + 1 })}
                >
                  <Plus />
                </Button>
                <span className="flex-1" />
                <Info texte={c.visible ? t('hide') : t('show')}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={c.visible ? t('hide') : t('show')}
                    aria-pressed={c.visible}
                    onClick={() => clockActions.update(c.id, { visible: !c.visible })}
                  >
                    {c.visible ? <Eye /> : <EyeOff />}
                  </Button>
                </Info>
                <Info texte={t('delete')}>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={t('delete')}
                    className="text-subtle hover:text-destructive"
                    onClick={() => clockActions.remove(c.id)}
                  >
                    <Trash2 />
                  </Button>
                </Info>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
