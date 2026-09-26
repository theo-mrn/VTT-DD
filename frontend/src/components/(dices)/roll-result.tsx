'use client';

/**
 * Affichage d'un jet : résultat d'une action (`ResultatAction`), lancer libre de
 * dés à symboles ou notation libre (`2d6 + 3`). Tout libellé, icône et couleur
 * vient du système et de sa présentation.
 */
import {
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  Crown,
  Dices,
  Skull,
  Table2,
} from 'lucide-react';
import type {
  DeSymbole,
  JetDes,
  LancerSymboles,
  Modification,
  Pool,
  Presentation,
  ResultatAction,
  SystemeCharge,
  TirageTable,
} from '@vtt/rules';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import {
  kindAppearance,
  symbolAppearance,
  dim,
  SymbolBadge,
  ShapedDie,
  SymbolIcon,
} from './appearance';

/** Jet à afficher : une action exécutée par le serveur, ou un lancer libre. */
export type DisplayedRoll =
  | {
      kind: 'action';
      result: ResultatAction;
      /** Les modifications ont été appliquées par le serveur (`appliquer: true`). */
      applied?: boolean;
    }
  | { kind: 'symboles'; pool: Pool; roll: LancerSymboles }
  | { kind: 'formule'; text: string; value: number; rolls: JetDes[] };

export interface RollResultProps {
  roll: DisplayedRoll;
  system: SystemeCharge;
  presentation?: Presentation | null;
  /** Noms affichés pour l'acteur et la cible dans les conséquences. */
  names?: { actor?: string; target?: string };
  /** Masque les explications et les dés (historique). */
  compact?: boolean;
  className?: string;
}

// ─── Résumé d'une ligne (historique) ─────────────────────────────────────────

/** Résumé textuel d'un jet, pour l'historique. */
export function summarizeRoll(roll: DisplayedRoll, system: SystemeCharge): string {
  const visibleResults = (results: Record<string, number>) =>
    (system.source.des?.resultats ?? [])
      .filter((r) => r.visible && (results[r.cle] ?? 0) !== 0)
      .map((r) => `${r.nom} ${results[r.cle]}`)
      .join(', ') || 'aucun résultat';
  switch (roll.kind) {
    case 'formule':
      return `${roll.text} = ${roll.value}`;
    case 'symboles':
      return visibleResults(roll.roll.resultats);
    case 'action': {
      const name = system.actions.get(roll.result.action)?.nom ?? roll.result.action;
      const r = roll.result;
      const detail =
        r.jet.type === 'numerique' ? `${r.jet.total}` : visibleResults(r.jet.resultats);
      return `${name} : ${detail} (${r.reussi ? 'réussite' : 'échec'})`;
    }
  }
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function RollResult({
  roll,
  system,
  presentation,
  names,
  compact = false,
  className,
}: RollResultProps) {
  const action = roll.kind === 'action' ? system.actions.get(roll.result.action) : undefined;
  const title =
    roll.kind === 'action'
      ? (action?.nom ?? roll.result.action)
      : roll.kind === 'formule'
        ? roll.text
        : 'Lancer libre';

  return (
    <div
      className={cn('space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold text-white">
          <Dices className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="truncate">{title}</span>
        </h3>
        {roll.kind === 'action' && <Status result={roll.result} />}
      </header>

      {roll.kind === 'formule' && (
        <NumericRoll
          total={roll.value}
          rolls={roll.rolls}
          system={system}
          presentation={presentation}
          compact={compact}
        />
      )}

      {roll.kind === 'symboles' && (
        <SymbolRoll
          dice={roll.roll.des}
          results={roll.roll.resultats}
          symbols={roll.roll.symboles}
          system={system}
          presentation={presentation}
          compact={compact}
        />
      )}

      {roll.kind === 'action' &&
        (roll.result.jet.type === 'numerique' ? (
          <NumericRoll
            total={roll.result.jet.total}
            rolls={roll.result.jet.jets}
            formula={roll.result.jet.formule}
            natural={roll.result.jet.naturel}
            bonus={roll.result.jet.bonus}
            system={system}
            presentation={presentation}
            compact={compact}
          />
        ) : (
          <SymbolRoll
            dice={roll.result.jet.des}
            results={roll.result.jet.resultats}
            symbols={roll.result.jet.symboles}
            system={system}
            presentation={presentation}
            compact={compact}
          />
        ))}

      {roll.kind === 'action' && roll.result.modifications.length > 0 && (
        <Modifications
          modifications={roll.result.modifications}
          applied={!!roll.applied}
          system={system}
          names={names}
        />
      )}

      {roll.kind === 'action' && roll.result.tables.length > 0 && (
        <Tables tables={roll.result.tables} system={system} />
      )}

      {!compact && roll.kind === 'symboles' && roll.roll.erreurs.length > 0 && (
        <Errors errors={roll.roll.erreurs} />
      )}

      {!compact && roll.kind === 'action' && (
        <>
          {roll.result.erreurs.length > 0 && <Errors errors={roll.result.erreurs} />}
          {roll.result.explications.length > 0 && (
            <details className="group rounded-lg border border-zinc-800 bg-zinc-900/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                Explications
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="space-y-1 border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                {roll.result.explications.map((e, i) => (
                  <li key={i} className="break-words">
                    {e}
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </div>
  );
}

// ─── Statut ──────────────────────────────────────────────────────────────────

function Chip({ color, icon, children }: { color: string; icon: ReactNode; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{
        color,
        borderColor: dim(color, 45),
        backgroundColor: dim(color, 12),
      }}
    >
      {icon}
      {children}
    </span>
  );
}

function Status({ result }: { result: ResultatAction }) {
  const j = result.jet;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {j.type === 'numerique' && j.critique && (
        <Chip color="#f59e0b" icon={<Crown className="h-3.5 w-3.5" />}>
          Critique
        </Chip>
      )}
      {j.type === 'numerique' && j.fumble && (
        <Chip color="#a855f7" icon={<Skull className="h-3.5 w-3.5" />}>
          Échec critique
        </Chip>
      )}
      {result.reussi ? (
        <Chip color="#10b981" icon={<CircleCheck className="h-3.5 w-3.5" />}>
          Réussite
        </Chip>
      ) : (
        <Chip color="#ef4444" icon={<CircleX className="h-3.5 w-3.5" />}>
          Échec
        </Chip>
      )}
    </div>
  );
}

// ─── Jet numérique ───────────────────────────────────────────────────────────

/** Dés d'un jet numérique : dés écartés barrés, explosions marquées. */
export function NumericDice({
  rolls,
  system,
  presentation,
  size = 40,
}: {
  rolls: JetDes[];
  system: SystemeCharge;
  presentation?: Presentation | null;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {rolls.map((j, i) => {
        const a = kindAppearance(`d${j.faces}`, system, presentation);
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-500">d{j.faces}</span>
            {j.des.map((d, k) => (
              <span key={k} className="relative">
                <ShapedDie
                  shape={a.shape}
                  color={a.color}
                  size={size}
                  filled={d.garde}
                  className={cn(!d.garde && 'opacity-40')}
                  title={`${d.valeur}${d.garde ? '' : ' (écarté)'}${d.explosion ? ' (explosion)' : ''}`}
                >
                  <span className={cn(!d.garde && 'line-through')}>{d.valeur}</span>
                </ShapedDie>
                {d.explosion && (
                  <span className="absolute -right-1 -top-1 rounded-full bg-orange-500 px-1 text-[10px] font-bold leading-4 text-zinc-950">
                    !
                  </span>
                )}
              </span>
            ))}
            {j.des.length > 1 && <span className="text-xs text-zinc-500">= {j.total}</span>}
          </div>
        );
      })}
    </div>
  );
}

function NumericRoll({
  total,
  rolls,
  formula,
  natural,
  bonus,
  system,
  presentation,
  compact,
}: {
  total: number;
  rolls: JetDes[];
  formula?: string;
  natural?: number;
  bonus?: { nom: string; valeur: number }[];
  system: SystemeCharge;
  presentation?: Presentation | null;
  compact: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="text-4xl font-bold tabular-nums text-white">{total}</span>
        {natural !== undefined && rolls.length > 0 && (
          <span className="pb-1 text-sm text-zinc-400">naturel {natural}</span>
        )}
      </div>
      {!compact && rolls.length > 0 && (
        <NumericDice rolls={rolls} system={system} presentation={presentation} />
      )}
      {!compact && (formula || (bonus && bonus.length > 0)) && (
        <div className="space-y-1 text-xs text-zinc-500">
          {formula && <p className="break-words font-mono">{formula}</p>}
          {bonus?.map((b, i) => (
            <p key={i}>
              {b.nom} : {b.valeur >= 0 ? `+ ${b.valeur}` : `− ${-b.valeur}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Jet à symboles ──────────────────────────────────────────────────────────

/** Dés à symboles tirés : forme et couleur de la sorte, symboles de la face. */
export function SymbolDice({
  dice,
  system,
  presentation,
  size = 46,
}: {
  dice: DeSymbole[];
  system: SystemeCharge;
  presentation?: Presentation | null;
  size?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {dice.map((d, i) => {
        const a = kindAppearance(d.de, system, presentation);
        const symbols = Object.entries(d.symboles);
        const title = `${a.name}, face ${d.face} : ${
          symbols
            .map(([s, n]) => `${symbolAppearance(s, system, presentation).name} ×${n}`)
            .join(', ') || 'vierge'
        }`;
        return (
          <ShapedDie key={i} shape={a.shape} color={a.color} size={size} title={title}>
            {symbols.length === 0 ? (
              <span className="opacity-40">—</span>
            ) : (
              symbols.flatMap(([s, n]) =>
                Array.from({ length: Math.min(n, 3) }, (_, k) => (
                  <SymbolIcon
                    key={`${s}-${k}`}
                    appearance={symbolAppearance(s, system, presentation)}
                    size={Math.round(size * (symbols.length + n > 2 ? 0.26 : 0.36))}
                  />
                )),
              )
            )}
          </ShapedDie>
        );
      })}
    </div>
  );
}

function SymbolRoll({
  dice,
  results,
  symbols,
  system,
  presentation,
  compact,
}: {
  dice: DeSymbole[];
  results: Record<string, number>;
  symbols: Record<string, number>;
  system: SystemeCharge;
  presentation?: Presentation | null;
  compact: boolean;
}) {
  const read = (system.source.des?.resultats ?? []).filter(
    (r) => r.visible && (results[r.cle] ?? 0) !== 0,
  );
  const rolled = (system.source.des?.symboles ?? []).filter((s) => (symbols[s.id] ?? 0) > 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {read.length ? (
          read.map((r) => (
            <SymbolBadge
              key={r.cle}
              appearance={symbolAppearance(r.cle, system, presentation)}
              value={results[r.cle] ?? 0}
            />
          ))
        ) : (
          <span className="text-sm text-zinc-500">Aucun résultat net</span>
        )}
      </div>
      {!compact && dice.length > 0 && (
        <SymbolDice dice={dice} system={system} presentation={presentation} />
      )}
      {!compact && rolled.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>Symboles bruts :</span>
          {rolled.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <SymbolIcon appearance={symbolAppearance(s.id, system, presentation)} size={12} />
              {symbols[s.id]}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ─── Conséquences et tables ──────────────────────────────────────────────────

function attributeName(system: SystemeCharge, key: string): string {
  for (const e of system.entites.values()) {
    const a = e.attributs.get(key);
    if (a) return a.nom;
  }
  return key;
}

function Modifications({
  modifications,
  applied,
  system,
  names,
}: {
  modifications: Modification[];
  applied: boolean;
  system: SystemeCharge;
  names?: { actor?: string; target?: string };
}) {
  const who = (e: 'acteur' | 'cible') =>
    e === 'cible' ? (names?.target ?? 'Cible') : (names?.actor ?? 'Acteur');
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {applied ? 'Conséquences appliquées' : 'Conséquences proposées'}
      </h4>
      <ul className="space-y-1.5">
        {modifications.map((m, i) => {
          if ('entree' in m) {
            const name = system.entrees.get(m.entree)?.nom ?? m.entree;
            const hasRanks = !!system.sortes.get(system.entrees.get(m.entree)?.sorte ?? '')?.rangs;
            return (
              <li
                key={i}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm"
              >
                <span className="text-zinc-400">{who(m.entite)}</span>
                <span className={m.operation === 'donner' ? 'text-amber-300' : 'text-emerald-300'}>
                  {m.operation === 'donner' ? 'reçoit' : 'perd'} {name}
                  {hasRanks && m.rangs !== 1 ? ` (${m.rangs} rangs)` : ''}
                </span>
                {m.duree !== undefined && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">
                    <Clock className="h-3 w-3" />
                    {m.duree} round{m.duree > 1 ? 's' : ''}
                  </span>
                )}
              </li>
            );
          }
          const type = m.type
            ? (system.source.typesDegats.find((t) => t.id === m.type)?.nom ?? m.type)
            : undefined;
          const value =
            m.operation === 'fixer'
              ? `fixé à ${m.valeur}`
              : m.operation === 'ajouter'
                ? `+ ${m.valeur}`
                : `− ${m.valeur}`;
          return (
            <li
              key={i}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm"
            >
              <span className="text-zinc-400">{who(m.entite)}</span>
              <span className="font-medium text-white">
                {attributeName(system, m.attribut)} {value}
              </span>
              {type && (
                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-300">
                  {type}
                </span>
              )}
              {m.brut !== undefined && m.brut !== m.valeur && (
                <span className="text-xs text-zinc-500">
                  (brut {m.brut}, après résistances {m.valeur})
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tables({ tables, system }: { tables: TirageTable[]; system: SystemeCharge }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Tables tirées
      </h4>
      <ul className="space-y-1.5">
        {tables.map((t, i) => {
          const table = system.tables.get(t.table);
          const entry = t.ligne?.entree ? system.entrees.get(t.ligne.entree) : undefined;
          return (
            <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <Table2 className="h-4 w-4 text-zinc-500" />
                <span className="text-zinc-400">{table?.nom ?? t.table}</span>
                <span className="font-semibold tabular-nums text-white">{t.valeur}</span>
                {t.modificateur !== 0 && (
                  <span className="text-xs text-zinc-500">
                    (modificateur {t.modificateur > 0 ? '+' : ''}
                    {t.modificateur})
                  </span>
                )}
                <span className="text-zinc-600">→</span>
                <span className="font-medium text-amber-200">{t.ligne?.nom ?? 'aucune ligne'}</span>
              </p>
              {t.ligne?.description && (
                <p className="mt-1 text-xs text-zinc-400">{t.ligne.description}</p>
              )}
              {(entry || t.horsTable) && (
                <p className="mt-1 text-xs text-zinc-500">
                  {entry && <>Donne : {entry.nom}. </>}
                  {t.horsTable && 'Valeur hors table, ramenée à la ligne extrême.'}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Errors({ errors }: { errors: { ou: string; message: string }[] }) {
  return (
    <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      {errors.map((e, i) => (
        <li key={i} className="flex items-start gap-1.5 break-words">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {e.message} <span className="text-amber-200/60">({e.ou})</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
