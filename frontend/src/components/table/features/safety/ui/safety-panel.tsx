'use client';

import { useTranslations } from 'next-intl';
import { Ban, Check, EyeOff, Plus, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCampaignEphemeral } from '@/lib/realtime';
import { cn } from '@/lib/utils';
import { useTable } from '../../../contexte';
import { enqueue } from '../../shared/outbox';
import { boundaries, XCARD_KIND, type Boundaries } from '../state';

/** Panneau de tous : lever la carte X ; lire les lignes et voiles (le MJ les écrit). */
export function SafetyPanel() {
  const t = useTranslations('table.safety');
  const { campagne, gm } = useTable();
  const value = useStore(boundaries.store, (s) => s.value) ?? { lines: [], veils: [] };
  const { send, live } = useCampaignEphemeral(campagne.id, [XCARD_KIND], () => undefined);
  const [envoye, setEnvoye] = useState(false);

  useEffect(() => {
    if (!envoye) return;
    const id = setTimeout(() => setEnvoye(false), 5000);
    return () => clearTimeout(id);
  }, [envoye]);

  const changer = (cle: keyof Boundaries, items: string[]) =>
    boundaries.set({ ...value, [cle]: items });

  return (
    <div className="space-y-5 p-4">
      <button
        type="button"
        disabled={!live || envoye}
        onClick={() => {
          enqueue(`xcard:${crypto.randomUUID()}`, () => send(XCARD_KIND, null, { gmOnly: true }));
          setEnvoye(true);
        }}
        className={cn(
          'group flex w-full items-center gap-4 rounded-3xl border p-4 text-left transition-[background-color,border-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]',
          envoye
            ? 'border-success/40 bg-success/10'
            : 'border-destructive/40 bg-destructive/[0.07] hover:border-destructive/70 hover:bg-destructive/15',
        )}
      >
        <span
          className={cn(
            'grid size-14 shrink-0 place-items-center rounded-2xl text-2xl font-black shadow-sm transition-transform group-hover:scale-105',
            envoye
              ? 'bg-success text-success-foreground'
              : 'bg-destructive text-destructive-foreground',
          )}
        >
          {envoye ? <Check className="size-7" aria-hidden /> : 'X'}
        </span>
        <span className="min-w-0">
          <span className="block text-base font-semibold">{envoye ? t('sent') : t('xcard')}</span>
          <span className="block text-xs text-muted-foreground">
            {envoye ? t('sentHint') : t('xcardHint')}
          </span>
        </span>
      </button>

      <Liste
        icone={<Ban className="size-4 text-destructive" aria-hidden />}
        titre={t('lines')}
        aide={t('linesHint')}
        vide={t('noLines')}
        items={value.lines}
        editable={gm}
        placeholder={t('linePlaceholder')}
        onChange={(items) => changer('lines', items)}
      />
      <Liste
        icone={<EyeOff className="size-4 text-warning" aria-hidden />}
        titre={t('veils')}
        aide={t('veilsHint')}
        vide={t('noVeils')}
        items={value.veils}
        editable={gm}
        placeholder={t('veilPlaceholder')}
        onChange={(items) => changer('veils', items)}
      />
    </div>
  );
}

function Liste({
  icone,
  titre,
  aide,
  vide,
  items,
  editable,
  placeholder,
  onChange,
}: Readonly<{
  icone: ReactNode;
  titre: string;
  aide: string;
  vide: string;
  items: string[];
  editable: boolean;
  placeholder: string;
  onChange(items: string[]): void;
}>) {
  const t = useTranslations('table.safety');
  const [brouillon, setBrouillon] = useState('');
  return (
    <section aria-label={titre}>
      <div className="mb-2 flex items-center gap-2">
        {icone}
        <h3 className="text-sm font-semibold">{titre}</h3>
        <span className="text-xs text-muted-foreground">· {aide}</span>
      </div>
      {items.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <li
              key={`${it}-${i}`}
              className="flex items-center gap-1 rounded-lg bg-surface-2/80 py-1 pl-2.5 pr-1 text-[13px]"
            >
              {it}
              {editable && (
                <button
                  type="button"
                  aria-label={t('remove', { item: it })}
                  onClick={() => onChange(items.filter((_, j) => j !== i))}
                  className="grid size-5 place-items-center rounded-md text-subtle hover:bg-surface-3 hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-subtle">{vide}</p>
      )}
      {editable && (
        <form
          className="mt-2 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const v = brouillon.trim();
            if (!v) return;
            onChange([...items, v]);
            setBrouillon('');
          }}
        >
          <Input
            value={brouillon}
            maxLength={120}
            onChange={(e) => setBrouillon(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-8 rounded-lg text-[13px]"
          />
          <Button type="submit" size="icon-sm" aria-label={t('add')} disabled={!brouillon.trim()}>
            <Plus />
          </Button>
        </form>
      )}
    </section>
  );
}
