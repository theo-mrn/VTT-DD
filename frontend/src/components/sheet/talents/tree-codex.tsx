'use client';

/**
 * Codex des arbres, repris du codex des spécialisations de l'ancienne app :
 * tous les arbres en un seul endroit, listés à gauche (groupés par l'entrée
 * parente de leur ouvreur, s'il en a une), arbre et détails à droite.
 * Lecture seule : l'achat se fait depuis le bloc des arbres.
 */
import { Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from '../skills/common/bindings';
import { EntryDialog } from '../skills/common/entry-dialog';
import { normalize } from '../skills/common/helpers';
import {
  field,
  focus,
  ghostButton,
  gradientTitle,
  text,
  textAccent,
  textMuted,
  titleFont,
} from '../skills/common/styles';
import { codexGroups, openerMarks, treeTitle, type TreeView } from './helpers';
import { TreeGrid } from './tree-grid';

export interface TreeCodexProps extends Pick<
  SheetBindings,
  'system' | 'sheet' | 'purchases' | 'presentation' | 'themeVariables' | 'onBuy' | 'onRefund'
> {
  open: boolean;
  onClose(): void;
  views: TreeView[];
  /** Titre du codex (celui du bloc). */
  title: string;
  /** Arbre sélectionné à l'ouverture. */
  initial?: string;
}

export function TreeCodex({ open, onClose, views, title, initial, ...bindings }: TreeCodexProps) {
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [search, setSearch] = useState('');
  const query = normalize(search.trim());
  const groups = useMemo(
    () =>
      codexGroups(
        views.filter(
          (v) =>
            !query ||
            normalize(treeTitle(v)).includes(query) ||
            (!!v.group && normalize(v.group.name).includes(query)),
        ),
      ),
    [views, query],
  );
  const current =
    views.find((v) => v.tree.id === selected) ?? groups[0]?.views[0] ?? views[0] ?? null;
  const marks = current?.opener ? openerMarks(bindings.system, current.opener) : [];
  const description = current?.opener?.description ?? current?.tree.description;

  return (
    <EntryDialog
      open={open}
      onClose={onClose}
      title={`Codex : ${title}`}
      size="full"
      bare
      themeVariables={bindings.themeVariables}
    >
      <div className="flex h-[85vh] flex-col overflow-hidden rounded-lg bg-[color:var(--fiche-fond)] sm:flex-row">
        <nav
          aria-label={`Liste : ${title}`}
          className="max-h-[35%] shrink-0 space-y-4 overflow-y-auto border-b border-[color:var(--fiche-bordure)] p-3 sm:max-h-none sm:w-60 sm:border-b-0 sm:border-r"
        >
          <h2 className={cn(titleFont, textAccent, 'text-sm font-bold uppercase tracking-wider')}>
            {title}
          </h2>
          <div className="relative">
            <Search
              className={cn(
                textMuted,
                'pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2',
              )}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher dans le codex"
              className={cn(field, 'h-8 pl-8')}
            />
          </div>
          {groups.map((g) => (
            <div key={g.label} className="space-y-1">
              <h3 className={cn(textMuted, 'px-2 text-[10px] font-bold uppercase tracking-widest')}>
                {g.label}
              </h3>
              {g.views.map((v) => (
                <button
                  key={`${g.label}-${v.tree.id}`}
                  type="button"
                  onClick={() => setSelected(v.tree.id)}
                  aria-current={current?.tree.id === v.tree.id || undefined}
                  className={cn(
                    'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                    current?.tree.id === v.tree.id
                      ? 'bg-[color:color-mix(in_srgb,var(--fiche-accent)_15%,transparent)] font-semibold text-[color:var(--fiche-accent)]'
                      : cn(text, 'hover:bg-white/5'),
                    focus,
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{treeTitle(v)}</span>
                  {v.opened && v.opener && (
                    <Check
                      aria-label="Possédé"
                      className={cn(textAccent, 'h-3.5 w-3.5 shrink-0')}
                    />
                  )}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && <p className={cn(textMuted, 'text-xs')}>Aucun résultat.</p>}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {current ? (
            <>
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <h2 className={cn(titleFont, gradientTitle, 'text-2xl font-bold')}>
                  {treeTitle(current)}
                </h2>
                {current.group && (
                  <span className="rounded border border-[color:color-mix(in_srgb,var(--fiche-accent)_40%,transparent)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[color:var(--fiche-accent)]">
                    {current.group.name}
                  </span>
                )}
                {current.opened && current.opener && (
                  <span className={cn(textMuted, 'text-[10px] uppercase tracking-wide')}>
                    Possédé · {current.acquired} / {current.tree.noeuds.length} acquis
                  </span>
                )}
              </div>
              {description && (
                <p className={cn(textMuted, 'mb-2 max-w-3xl whitespace-pre-line text-xs')}>
                  {description}
                </p>
              )}
              {marks.map((m) => (
                <p key={m} className={cn(textMuted, 'mb-1 text-[11px]')}>
                  {m}
                </p>
              ))}
              <TreeGrid key={current.tree.id} {...bindings} tree={current.tree} canBuy={false} />
            </>
          ) : (
            <p className={cn(textMuted, 'flex h-full items-center justify-center text-sm')}>
              Aucun arbre défini.
            </p>
          )}
          <div className="mt-4 flex justify-end border-t border-white/5 pt-4">
            <button type="button" className={ghostButton} onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
    </EntryDialog>
  );
}
