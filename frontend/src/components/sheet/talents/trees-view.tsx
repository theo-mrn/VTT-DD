'use client';

/**
 * Arbres de l'entité, repris du bloc « Talents et spécialisations » de
 * l'ancienne fiche : cartes des arbres ouverts (entrée ouvrante possédée,
 * nœuds acquis), cartes des entrées ouvrantes encore à acquérir (aperçu de
 * l'arbre et achat), dialogue de l'arbre avec achat au nœud, et codex.
 */
import { BookOpen, Eye, Lock, Plus } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { SheetBindings } from '../skills/common/bindings';
import { WriteButton } from '../skills/common/controls';
import { EntryDialog } from '../skills/common/entry-dialog';
import { balances, blockMessages, currencyName } from '../skills/common/helpers';
import {
  accentButton,
  autoGrid,
  balanceBadge,
  entryCard,
  entryCardOn,
  focus,
  ghostButton,
  iconButton,
  panel,
  softAccentButton,
  textAccent,
  textMuted,
  titleFont,
} from '../skills/common/styles';
import { treeTitle, treeViews, type TreeView } from './helpers';
import { TreeCodex } from './tree-codex';
import { TreeGrid } from './tree-grid';

export interface TreesViewProps extends SheetBindings {
  /** Titre du bloc (celui du widget de la présentation). */
  title: string;
  className?: string;
}

export function TreesView(props: TreesViewProps) {
  const { system, sheet, purchases, readOnly, title, className, onBuy } = props;
  const [openTree, setOpenTree] = useState<string | null>(null);
  const [codex, setCodex] = useState(false);

  const views = treeViews(system, sheet, purchases);
  const opened = views
    .filter((v) => v.opened)
    .sort((a, b) => treeTitle(a).localeCompare(treeTitle(b), 'fr'));
  const toAcquire = readOnly
    ? []
    : views
        .filter((v) => !v.opened && v.openerItem)
        .sort(
          (a, b) =>
            Number(b.openerItem!.possible) - Number(a.openerItem!.possible) ||
            treeTitle(a).localeCompare(treeTitle(b), 'fr'),
        );
  const openerKinds = new Set(views.flatMap((v) => (v.opener ? [v.opener.sorte] : [])));
  const wallet = balances(system, purchases, (p) => {
    const o = p.achat.obtient;
    return o.type === 'noeud' || (o.type === 'entree' && openerKinds.has(o.sorte));
  });
  const current = openTree ? views.find((v) => v.tree.id === openTree) : undefined;

  if (!views.length) return null;

  return (
    <>
      <section aria-label={title} className={cn(panel, 'h-full w-full', className)}>
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--fiche-bordure)] p-3">
          <h2 className={cn(titleFont, textAccent, 'text-lg font-bold')}>{title}</h2>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCodex(true)}
              className={iconButton}
              title="Codex : parcourir tous les arbres"
              aria-label="Ouvrir le codex des arbres"
            >
              <BookOpen className="h-4 w-4" />
            </button>
            {wallet.map((w) => (
              <span key={w.id} className={balanceBadge} title={`${w.name} disponible`}>
                {w.balance} {w.name}
              </span>
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {opened.length === 0 && toAcquire.length === 0 && (
            <p className={cn(textMuted, 'py-12 text-center text-sm')}>Aucun arbre ouvert.</p>
          )}
          <ul className={autoGrid}>
            {opened.map((v) => (
              <li key={v.tree.id}>
                <OpenedCard view={v} onOpen={() => setOpenTree(v.tree.id)} />
              </li>
            ))}
            {toAcquire.map((v) => (
              <li key={v.tree.id}>
                <AcquireCard
                  view={v}
                  currency={currencyName(system, v.openerItem!.monnaie)}
                  onPreview={() => setOpenTree(v.tree.id)}
                  onBuy={() => onBuy(v.openerItem!.achat, v.openerItem!.objet)}
                />
              </li>
            ))}
          </ul>
        </div>
      </section>

      {current && <TreeDialog {...props} view={current} onClose={() => setOpenTree(null)} />}
      {codex && (
        <TreeCodex
          open
          onClose={() => setCodex(false)}
          views={views}
          title={title}
          initial={opened[0]?.tree.id}
          system={system}
          sheet={sheet}
          purchases={purchases}
          presentation={props.presentation}
          themeVariables={props.themeVariables}
          onBuy={onBuy}
          onRefund={props.onRefund}
        />
      )}
    </>
  );
}

function OpenedCard({ view, onOpen }: { view: TreeView; onOpen(): void }) {
  const total = view.tree.noeuds.length;
  const pct = total ? Math.round((view.acquired / total) * 100) : 0;
  return (
    <button type="button" onClick={onOpen} className={cn(entryCard, entryCardOn, 'w-full gap-1')}>
      <span className={cn(textAccent, 'truncate text-sm font-semibold')}>{treeTitle(view)}</span>
      <span className={cn(textMuted, 'text-[11px]')}>
        {view.acquired} / {total} nœud{total > 1 ? 's' : ''} acquis
        {view.group ? ` · ${view.group.name}` : ''}
      </span>
      <span
        aria-hidden
        className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[color:var(--fiche-bordure)]"
      >
        <span
          className="block h-full rounded-full bg-[color:var(--fiche-accent)]"
          style={{ width: `${pct}%` }}
        />
      </span>
    </button>
  );
}

function AcquireCard({
  view,
  currency,
  onPreview,
  onBuy,
}: {
  view: TreeView;
  currency: string;
  onPreview(): void;
  onBuy(): Promise<boolean>;
}) {
  const item = view.openerItem!;
  const name = treeTitle(view);
  return (
    <div className="flex h-full items-center justify-between gap-2 rounded-lg border border-dashed border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-3">
      {/* Le nom ouvre l'arbre en aperçu : on n'achète pas à l'aveugle */}
      <button
        type="button"
        onClick={onPreview}
        title="Voir l’arbre"
        className={cn(
          textMuted,
          'flex min-w-0 items-center gap-1.5 text-left text-sm transition-colors hover:text-[color:var(--fiche-accent)]',
          focus,
        )}
      >
        <Eye className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          <span className="block truncate">{name}</span>
          {view.group && <span className="block truncate text-[10px]">{view.group.name}</span>}
        </span>
      </button>
      <WriteButton
        className={softAccentButton}
        disabled={!item.possible}
        title={item.possible ? undefined : blockMessages(item).join(' ; ')}
        label={`Acquérir ${name} : ${item.cout} ${currency}`}
        onClick={onBuy}
      >
        {item.possible ? <Plus /> : <Lock />}
        {item.cout} {currency}
      </WriteButton>
    </div>
  );
}

function TreeDialog({
  view,
  onClose,
  readOnly,
  system,
  onBuy,
  ...bindings
}: TreesViewProps & { view: TreeView; onClose(): void }) {
  const item = view.openerItem;
  const currency = item ? currencyName(system, item.monnaie) : '';
  const name = treeTitle(view);
  return (
    <EntryDialog
      open
      onClose={onClose}
      title={name}
      size="xl"
      themeVariables={bindings.themeVariables}
      description={
        view.opened
          ? (view.tree.description ?? `${view.acquired} / ${view.tree.noeuds.length} acquis`)
          : `Aperçu : acquérez ${view.opener?.nom ?? name} pour débloquer cet arbre.`
      }
      footer={
        <>
          <button type="button" className={ghostButton} onClick={onClose}>
            Fermer
          </button>
          {!readOnly && !view.opened && item && (
            <WriteButton
              className={accentButton}
              disabled={!item.possible}
              title={item.possible ? undefined : blockMessages(item).join(' ; ')}
              onClick={() => onBuy(item.achat, item.objet)}
            >
              {item.possible ? <Plus /> : <Lock />}
              Acquérir ({item.cout} {currency})
            </WriteButton>
          )}
        </>
      }
    >
      <TreeGrid
        {...bindings}
        system={system}
        onBuy={onBuy}
        tree={view.tree}
        canBuy={!readOnly && view.opened}
      />
    </EntryDialog>
  );
}
