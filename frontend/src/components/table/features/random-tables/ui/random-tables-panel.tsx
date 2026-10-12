'use client';

import { useTranslations } from 'next-intl';
import { Dices, Eye, Pencil, Plus, Shuffle, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ListSkeleton, Notice } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { chatApi, CHAT_MAX_BODY } from '@/lib/campaign-chat';
import { useTable } from '../../../contexte';
import {
  draw,
  parseEntries,
  useRandomTables,
  useSaveRandomTables,
  type RandomTable,
} from '../state';

type Editing = { id: string | null; name: string; entries: string[] };

/** Entrées remplies (les champs vides ne comptent pas). */
const filled = (entries: readonly string[]) => entries.map((e) => e.trim()).filter(Boolean);

/** Panneau du MJ : ses tables, un tirage posté au chat (ou gardé pour soi), édition en place. */
export function RandomTablesPanel() {
  const t = useTranslations('table.randomTables');
  const { campagne } = useTable();
  const tables = useRandomTables();
  const save = useSaveRandomTables();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [results, setResults] = useState<Record<string, { text: string; seq: number }>>({});

  const liste = tables.data ?? [];
  const enregistrer = (next: RandomTable[]) =>
    save.mutate(next, {
      onError: (e) => toast.error(t('saveFailed'), { description: messageErreur(e) }),
    });

  const tirer = async (table: RandomTable, prive: boolean) => {
    const r = draw(table.entries);
    if (!r) return;
    setResults((s) => ({ ...s, [table.id]: { text: r, seq: (s[table.id]?.seq ?? 0) + 1 } }));
    if (prive) return;
    try {
      const body = t('posted', { table: table.name, result: r }).slice(0, CHAT_MAX_BODY);
      await chatApi.post(campagne.id, body, null);
    } catch (e) {
      toast.error(t('postFailed'), { description: messageErreur(e) });
    }
  };

  const valider = () => {
    if (!editing) return;
    const entries = filled(editing.entries);
    const name = editing.name.trim() || t('namePlaceholder');
    const next = editing.id
      ? liste.map((x) => (x.id === editing.id ? { ...x, name, entries } : x))
      : [...liste, { id: crypto.randomUUID(), name, entries }];
    enregistrer(next);
    setEditing(null);
  };

  if (tables.isPending)
    return (
      <div className="p-4">
        <ListSkeleton rows={3} />
      </div>
    );

  return (
    <div className="space-y-3 p-4">
      {!editing && (
        <Button
          size="sm"
          className="w-full"
          onClick={() => setEditing({ id: null, name: '', entries: [''] })}
        >
          <Plus />
          {t('new')}
        </Button>
      )}

      {editing && (
        <TableEditor
          editing={editing}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSubmit={valider}
          onDelete={
            editing.id
              ? () => {
                  enregistrer(liste.filter((x) => x.id !== editing.id));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}

      {!liste.length && !editing && (
        <Notice icon={Dices} title={t('empty')} description={t('emptyHint')} />
      )}

      <ul className="space-y-2">
        {liste.map((table) => {
          const res = results[table.id];
          return (
            <li
              key={table.id}
              className="group rounded-2xl border border-border/70 bg-card p-3 transition-colors hover:border-border-strong"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{table.name}</span>
                  <span className="block text-[11px] tabular-nums text-subtle">
                    {t('count', { count: table.entries.length })}
                  </span>
                </span>
                <Info texte={t('edit')}>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('edit')}
                    className="text-subtle opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                    onClick={() =>
                      setEditing({
                        id: table.id,
                        name: table.name,
                        entries: [...table.entries, ''],
                      })
                    }
                  >
                    <Pencil />
                  </Button>
                </Info>
                <Info texte={t('rollPrivate')}>
                  <Button
                    variant="secondary"
                    size="icon-sm"
                    aria-label={t('rollPrivate')}
                    onClick={() => void tirer(table, true)}
                  >
                    <Eye />
                  </Button>
                </Info>
                <Button size="sm" onClick={() => void tirer(table, false)}>
                  <Shuffle />
                  {t('roll')}
                </Button>
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                {res && (
                  <motion.p
                    key={res.seq}
                    initial={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -6 }}
                    className="mt-2.5 rounded-xl bg-surface-2/70 px-3 py-2 text-[13px] leading-snug"
                  >
                    {res.text}
                  </motion.p>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Édition d'une table : son nom, puis ses entrées numérotées, une par champ. Entrée passe au
 * champ suivant (ou en ajoute un), un collage de plusieurs lignes donne plusieurs entrées.
 */
function TableEditor({
  editing,
  onChange,
  onCancel,
  onSubmit,
  onDelete,
}: Readonly<{
  editing: Editing;
  onChange(e: Editing): void;
  onCancel(): void;
  onSubmit(): void;
  onDelete?: () => void;
}>) {
  const t = useTranslations('table.randomTables');
  const liste = useRef<HTMLOListElement>(null);
  const n = filled(editing.entries).length;
  const focus = (i: number) =>
    requestAnimationFrame(() => liste.current?.querySelectorAll('input')[i]?.focus());
  const setEntries = (entries: string[]) => onChange({ ...editing, entries });

  return (
    <form
      className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          value={editing.name}
          maxLength={80}
          onChange={(e) => onChange({ ...editing, name: e.target.value })}
          placeholder={t('namePlaceholder')}
          aria-label={t('name')}
          className="h-9 flex-1 rounded-xl font-medium"
        />
        <span className="shrink-0 rounded-lg bg-surface-3 px-2 py-1 font-mono text-xs font-semibold text-muted-foreground">
          d{n || '?'}
        </span>
      </div>

      <ol ref={liste} aria-label={t('entries')} className="space-y-1">
        {editing.entries.map((entry, i) => (
          <li key={i} className="group flex items-center gap-1.5">
            <span className="w-6 shrink-0 text-right font-mono text-[11px] tabular-nums text-subtle">
              {i + 1}
            </span>
            <Input
              value={entry}
              maxLength={300}
              placeholder={i === 0 ? t('entryPlaceholder') : t('entryNext')}
              aria-label={t('entryN', { n: String(i + 1) })}
              onChange={(e) =>
                setEntries(editing.entries.map((x, j) => (j === i ? e.target.value : x)))
              }
              onPaste={(e) => {
                const lignes = parseEntries(e.clipboardData.getData('text'));
                if (lignes.length < 2) return;
                e.preventDefault();
                const next = [...editing.entries];
                next.splice(i, entry.trim() ? 0 : 1, ...lignes);
                setEntries(next.at(-1)?.trim() ? [...next, ''] : next);
                focus(i + lignes.length);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (i === editing.entries.length - 1) setEntries([...editing.entries, '']);
                  focus(i + 1);
                }
                if (e.key === 'Backspace' && !entry && editing.entries.length > 1) {
                  e.preventDefault();
                  setEntries(editing.entries.filter((_, j) => j !== i));
                  focus(Math.max(0, i - 1));
                }
              }}
              className="h-8 rounded-lg text-[13px]"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('removeEntry', { n: String(i + 1) })}
              disabled={editing.entries.length === 1}
              onClick={() => setEntries(editing.entries.filter((_, j) => j !== i))}
              className="text-subtle opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X />
            </Button>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="ml-7 text-muted-foreground"
        onClick={() => {
          setEntries([...editing.entries, '']);
          focus(editing.entries.length);
        }}
      >
        <Plus />
        {t('addEntry')}
      </Button>

      <div className="flex items-center gap-1.5 border-t border-primary/15 pt-3">
        {onDelete && (
          <Info texte={t('delete')}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('delete')}
              className="text-subtle hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 />
            </Button>
          </Info>
        )}
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={!n}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}
