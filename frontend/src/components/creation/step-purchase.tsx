'use client';

/**
 * Étape « acheter » : une sous-étape par achat autorisé (caractéristiques,
 * rangs, nouvelles entrées, nœuds d'arbre), le solde de la monnaie toujours
 * visible. Chaque carte montre le coût du prochain palier (« +1 → 30 »), le
 * plafond (« Max ») et rembourse le dernier achat de création de l'objet.
 */
import {
  acheterEtape,
  detailSolde,
  type Achat,
  type EtapeCreation,
  type ObjetAchetable,
} from '@vtt/rules';
import { Minus, Plus, Search, Undo2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { writes } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useSheet } from '../sheet/context';
import { normalize, SheetEmpty } from '../sheet/elements';
import { formatNumber, tagName } from '../sheet/format';
import { lastLine, maxRank, readableField } from '../sheet/possessions';
import { field, iconButton, secondaryButton, text, textAccent, textMuted } from '../sheet/styles';
import { TreesWidget } from '../sheet/talents';
import type { DraftTracker } from './draft';
import { plainSummary, mutedChip, panel, StepFooter, SubStepTrail, type TabNav } from './ui';
import { cardButton, statGrid, StatCard } from './stat-card';
import { treesOpenedBy } from './entries';
import { TreePreviewButton } from './tree-preview';

type Step = Extract<EtapeCreation, { type: 'acheter' }>;

/** Blocages qui signifient « plafond atteint » plutôt que « pas assez à dépenser ». */
const CAPPED = new Set(['condition', 'plafond', 'rang-max', 'limite-attribut', 'maximum']);
const capped = (o: ObjetAchetable) => o.blocages.some((b) => CAPPED.has(b.code));
const reasons = (o: ObjetAchetable) => o.blocages.map((b) => b.message).join(' ; ');

interface Tools {
  step: Step;
  buy(o: ObjetAchetable): Promise<boolean>;
  /** Index du journal remboursable pour cet objet (achat de cette étape), sinon -1. */
  refundable(objet: string): number;
  refund(index: number): Promise<boolean>;
  currency(id: string): string;
  busy: boolean;
}

export function PurchaseStep({
  step,
  nav,
  draft,
}: {
  step: Step;
  nav: TabNav;
  draft: DraftTracker;
}) {
  const { system, sheet, state, write, refund, pending } = useSheet();
  const purchases = step.achats
    .map((id) => system.achats.get(id))
    .filter((a): a is Achat => !!a && !!system.monnaies.get(a.monnaie)?.pour.includes(state.type));
  const [index, setIndex] = useState(() => {
    if (nav.enterAt === 'end') return purchases.length - 1;
    if (nav.enterAt === 'start') return 0;
    return draft.draft.subSteps[step.id] ?? 0;
  });
  const [busy, setBusy] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const current = Math.max(0, Math.min(index, purchases.length - 1));
  const purchase = purchases[current];

  const currencies = [...new Set(purchases.map((a) => a.monnaie))].map((m) =>
    detailSolde(sheet, m),
  );

  // Sous-étape courante gardée dans le brouillon (reprise après rechargement)
  const { setSubStep } = draft;
  useEffect(() => setSubStep(step.id, current), [setSubStep, step.id, current]);

  const go = (i: number) => {
    setIndex(i);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tools: Tools = {
    step,
    busy: busy || pending > 0,
    buy: async (o) => {
      setBusy(true);
      const ok = await write(writes.step(step.id, { achat: o.achat, objet: o.objet }), (e) => {
        const r = acheterEtape(system, e, step.id, { achat: o.achat, objet: o.objet });
        return r.ok ? r.etat : null;
      });
      setBusy(false);
      return ok;
    },
    refundable: (objet) => {
      const i = lastLine(state, objet);
      const line = state.journal[i];
      return line && line.creation && step.achats.includes(line.achat) ? i : -1;
    },
    refund: async (i) => {
      setBusy(true);
      const ok = await refund(i);
      setBusy(false);
      return ok;
    },
    currency: (id) => system.monnaies.get(id)?.nom ?? id,
  };

  if (!purchase) return <SheetEmpty>Aucun achat ouvert à ce type de fiche.</SheetEmpty>;

  return (
    <div ref={top} className={cn(panel, 'scroll-mt-24 space-y-6 p-5 sm:p-6')}>
      <div className="flex flex-col gap-4 rounded-2xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 space-y-2">
          <SubStepTrail labels={purchases.map((a) => a.nom)} current={current} onGo={go} />
          <h3 className={cn(text, 'text-lg font-semibold')}>{purchase.nom}</h3>
          {purchase.description && (
            <p className={cn(textMuted, 'text-xs')}>{purchase.description}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end" aria-live="polite">
          {currencies.map((s) => (
            <span
              key={s.monnaie.id}
              title={s.erreur}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-bold tabular-nums',
                s.solde < 0
                  ? 'border-red-500/40 bg-red-500/10 text-red-300'
                  : 'border-[color:color-mix(in_srgb,var(--fiche-accent)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] text-[color:var(--fiche-accent)]',
              )}
            >
              {formatNumber(s.solde)} / {formatNumber(s.total)}
              <span className="text-xs font-normal">{s.monnaie.nom}</span>
            </span>
          ))}
        </div>
      </div>

      {purchase.obtient.type === 'attribut' ? (
        <AttributePurchases purchase={purchase} tools={tools} />
      ) : purchase.obtient.type === 'rang' ? (
        <RankPurchases key={purchase.id} purchase={purchase} tools={tools} />
      ) : purchase.obtient.type === 'entree' ? (
        <EntryPurchases key={purchase.id} purchase={purchase} tools={tools} />
      ) : (
        <TreesWidget widget={{ type: 'arbres', titre: purchase.nom }} />
      )}

      <StepFooter
        className="border-t border-[color:var(--fiche-bordure)] pt-6"
        onPrev={current > 0 ? () => go(current - 1) : nav.onPrev}
        onNext={() => (current < purchases.length - 1 ? go(current + 1) : nav.onNext())}
        busy={busy}
      />
    </div>
  );
}

/** Objets d'un achat, lus dans les achats possibles (serveur, sinon calcul local). */
function useItems(purchase: Achat): ObjetAchetable[] {
  const { purchases } = useSheet();
  return purchases.find((p) => p.achat.id === purchase.id)?.objets ?? [];
}

/** « −  +1 → 30  + » : remboursement, prochain palier, achat. */
function Stepper({ item, label, tools }: { item: ObjetAchetable; label: string; tools: Tools }) {
  const refundIndex = tools.refundable(item.objet);
  const currency = tools.currency(item.monnaie);
  const isCapped = !item.possible && capped(item);
  return (
    <>
      <button
        type="button"
        className={cardButton}
        disabled={refundIndex < 0 || tools.busy}
        onClick={() => void tools.refund(refundIndex)}
        title={refundIndex >= 0 ? `Rendre le dernier achat : ${label}` : 'Aucun achat à rembourser'}
        aria-label={`Rembourser : ${label}`}
      >
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span
        title={item.possible ? `${label} : ${item.cout} ${currency}` : reasons(item)}
        className={cn(
          'font-mono text-[10px] uppercase tracking-wide',
          item.possible ? textAccent : textMuted,
        )}
      >
        {isCapped
          ? `Max${item.plafond !== undefined ? ` (${formatNumber(item.plafond)})` : ''}`
          : `+1 → ${formatNumber(item.cout)}`}
      </span>
      <button
        type="button"
        className={cardButton}
        disabled={!item.possible || tools.busy}
        onClick={() => void tools.buy(item)}
        title={item.possible ? `${label} : ${item.cout} ${currency}` : reasons(item)}
        aria-label={`Acheter : ${label} (${item.cout} ${currency})${item.possible ? '' : ` — impossible : ${reasons(item)}`}`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </>
  );
}

// ─── Attributs ───────────────────────────────────────────────────────────────

function AttributePurchases({ purchase, tools }: { purchase: Achat; tools: Tools }) {
  const { sheet } = useSheet();
  const items = useItems(purchase);
  if (!items.length) return <SheetEmpty>Rien à acheter pour l’instant.</SheetEmpty>;
  return (
    <div className={statGrid}>
      {items.map((o) => {
        const a = sheet.entite.attributs.get(o.objet);
        if (!a) return null;
        return (
          <StatCard
            key={o.objet}
            attribute={a}
            highlight={tools.refundable(o.objet) >= 0}
            footer={<Stepper item={o} label={a.nom} tools={tools} />}
          />
        );
      })}
    </div>
  );
}

// ─── Rangs ───────────────────────────────────────────────────────────────────

function RankPurchases({ purchase, tools }: { purchase: Achat; tools: Tools }) {
  const { system, sheet, state } = useSheet();
  const items = useItems(purchase);
  const [search, setSearch] = useState('');
  if (purchase.obtient.type !== 'rang') return null;
  const kind = system.sortes.get(purchase.obtient.sorte);
  const top = kind ? maxRank(sheet, kind) : undefined;
  const linkedFields = (kind?.champs ?? []).filter((c) => c.type === 'attribut');
  const filter = normalize(search.trim());
  const visible = items
    .filter((o) => !filter || normalize(o.nom).includes(filter))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  if (!items.length) return <SheetEmpty>Rien à acheter pour l’instant.</SheetEmpty>;

  return (
    <div className="space-y-4">
      {items.length > 8 && (
        <div className="relative sm:max-w-xs">
          <Search
            className={cn(textMuted, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            aria-label={`Rechercher : ${kind?.nomPluriel ?? purchase.nom}`}
            className={cn(field, 'pl-9')}
          />
        </div>
      )}
      <ul className="grid gap-2 md:grid-cols-2">
        {visible.map((o) => {
          const entry = system.entrees.get(o.objet);
          const tags = [...(sheet.marques.get(o.objet) ?? [])];
          const pips = Math.max(o.actuel, o.plafond ?? 0, top ?? 0);
          const linked = entry
            ? linkedFields
                .map((c) => readableField(system, state.type, c, entry.champs[c.id]))
                .filter((v) => v !== '—')
            : [];
          return (
            <li
              key={o.objet}
              className={cn(
                'flex items-center gap-3 rounded-xl border bg-[color:var(--fiche-carte)] px-3 py-2.5',
                tools.refundable(o.objet) >= 0
                  ? 'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)]'
                  : 'border-[color:var(--fiche-bordure)]',
              )}
            >
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={cn(text, 'truncate text-sm font-medium')}>{o.nom}</span>
                  {linked.map((l) => (
                    <span key={l} className={cn(textMuted, 'text-xs')}>
                      ({l})
                    </span>
                  ))}
                  {tags.map((t) => (
                    <span key={t} className={mutedChip}>
                      {tagName(t)}
                    </span>
                  ))}
                </span>
                {pips > 0 && (
                  <span className="flex gap-1" aria-label={`Rang ${o.actuel}`}>
                    {Array.from({ length: pips }, (_, i) => (
                      <span
                        key={i}
                        className={cn(
                          'h-2 w-2 rounded-full border',
                          i < o.actuel
                            ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)]'
                            : o.plafond !== undefined && i >= o.plafond
                              ? 'border-[color:var(--fiche-bordure)] opacity-40'
                              : 'border-[color:var(--fiche-bordure)]',
                        )}
                      />
                    ))}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <Stepper item={o} label={o.nom} tools={tools} />
              </span>
            </li>
          );
        })}
      </ul>
      {!visible.length && <SheetEmpty>Aucun résultat.</SheetEmpty>}
    </div>
  );
}

// ─── Nouvelles entrées ───────────────────────────────────────────────────────

function EntryPurchases({ purchase, tools }: { purchase: Achat; tools: Tools }) {
  const { system, sheet, state } = useSheet();
  const items = useItems(purchase);
  const [blocked, setBlocked] = useState(false);
  if (purchase.obtient.type !== 'entree') return null;
  const sorte = purchase.obtient.sorte;
  const owned = state.possessions.filter((p) => system.entrees.get(p.entree)?.sorte === sorte);
  const shown = items
    .filter((o) => blocked || o.possible)
    .sort(
      (a, b) =>
        Number(b.possible) - Number(a.possible) ||
        a.cout - b.cout ||
        a.nom.localeCompare(b.nom, 'fr'),
    );

  return (
    <div className="space-y-5">
      {owned.length > 0 && (
        <section className="space-y-2">
          <h4 className={cn(textMuted, 'text-[10px] font-bold uppercase tracking-widest')}>
            Déjà obtenues
          </h4>
          <ul className="flex flex-wrap gap-2">
            {owned.map((p) => {
              const e = system.entrees.get(p.entree);
              const i = tools.refundable(p.entree);
              return (
                <li
                  key={p.entree}
                  className="flex items-center gap-2 rounded-lg border border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_10%,transparent)] py-1 pl-3 pr-1 text-sm"
                >
                  <span className={textAccent}>{e?.nom ?? p.entree}</span>
                  <TreePreviewButton
                    trees={treesOpenedBy(system, p.entree)}
                    label={e?.nom ?? p.entree}
                    className="h-7 w-7"
                  />
                  {i >= 0 && (
                    <button
                      type="button"
                      className={cn(iconButton, 'h-7 w-7')}
                      disabled={tools.busy}
                      onClick={() => void tools.refund(i)}
                      aria-label={`Annuler l’achat : ${e?.nom ?? p.entree}`}
                      title="Annuler l’achat"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          aria-pressed={blocked}
          className={cn(secondaryButton, 'text-xs')}
          onClick={() => setBlocked((b) => !b)}
        >
          {blocked ? 'Masquer les achats impossibles' : 'Afficher les achats impossibles'}
        </button>
      </div>

      {shown.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((o) => {
            const e = system.entrees.get(o.objet);
            const tags = [...(sheet.marques.get(o.objet) ?? [])];
            const currency = tools.currency(o.monnaie);
            return (
              <li
                key={o.objet}
                className={cn(
                  'flex flex-col gap-2 rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] p-4',
                  !o.possible && 'opacity-60',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn(text, 'font-semibold')}>{o.nom}</p>
                    <span className="mt-1 flex flex-wrap gap-1">
                      {tags.map((t) => (
                        <span key={t} className={mutedChip}>
                          {tagName(t)}
                        </span>
                      ))}
                    </span>
                  </div>
                  <TreePreviewButton trees={treesOpenedBy(system, o.objet)} label={o.nom} />
                </div>
                {e?.description && (
                  <p className={cn(textMuted, 'line-clamp-3 text-xs')}>
                    {plainSummary(e.description)}
                  </p>
                )}
                {!o.possible && <p className="text-xs text-red-300">{reasons(o)}</p>}
                <button
                  type="button"
                  className={cn(secondaryButton, 'mt-auto justify-between text-xs')}
                  disabled={!o.possible || tools.busy}
                  onClick={() => void tools.buy(o)}
                >
                  <span>Acheter</span>
                  <span className="tabular-nums">
                    {formatNumber(o.cout)} {currency}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <SheetEmpty>Plus rien d’achetable pour l’instant.</SheetEmpty>
      )}
    </div>
  );
}
