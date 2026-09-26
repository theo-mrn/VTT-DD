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
  apparenceSorte,
  apparenceSymbole,
  attenuer,
  BadgeSymbole,
  DeForme,
  IconeSymbole,
} from './apparence';

/** Jet à afficher : une action exécutée par le serveur, ou un lancer libre. */
export type JetAffiche =
  | {
      sorte: 'action';
      resultat: ResultatAction;
      /** Les modifications ont été appliquées par le serveur (`appliquer: true`). */
      applique?: boolean;
    }
  | { sorte: 'symboles'; pool: Pool; lancer: LancerSymboles }
  | { sorte: 'formule'; texte: string; valeur: number; jets: JetDes[] };

export interface ResultatJetProps {
  jet: JetAffiche;
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  /** Noms affichés pour l'acteur et la cible dans les conséquences. */
  noms?: { acteur?: string; cible?: string };
  /** Masque les explications et les dés (historique). */
  compact?: boolean;
  className?: string;
}

// ─── Résumé d'une ligne (historique) ─────────────────────────────────────────

/** Résumé textuel d'un jet, pour l'historique. */
export function resumerJet(jet: JetAffiche, systeme: SystemeCharge): string {
  const resultatsVisibles = (resultats: Record<string, number>) =>
    (systeme.source.des?.resultats ?? [])
      .filter((r) => r.visible && (resultats[r.cle] ?? 0) !== 0)
      .map((r) => `${r.nom} ${resultats[r.cle]}`)
      .join(', ') || 'aucun résultat';
  switch (jet.sorte) {
    case 'formule':
      return `${jet.texte} = ${jet.valeur}`;
    case 'symboles':
      return resultatsVisibles(jet.lancer.resultats);
    case 'action': {
      const nom = systeme.actions.get(jet.resultat.action)?.nom ?? jet.resultat.action;
      const r = jet.resultat;
      const detail =
        r.jet.type === 'numerique' ? `${r.jet.total}` : resultatsVisibles(r.jet.resultats);
      return `${nom} : ${detail} (${r.reussi ? 'réussite' : 'échec'})`;
    }
  }
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function ResultatJet({
  jet,
  systeme,
  presentation,
  noms,
  compact = false,
  className,
}: ResultatJetProps) {
  const action = jet.sorte === 'action' ? systeme.actions.get(jet.resultat.action) : undefined;
  const titre =
    jet.sorte === 'action'
      ? (action?.nom ?? jet.resultat.action)
      : jet.sorte === 'formule'
        ? jet.texte
        : 'Lancer libre';

  return (
    <div
      className={cn('space-y-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4', className)}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-2 font-semibold text-white">
          <Dices className="h-4 w-4 shrink-0 text-zinc-500" />
          <span className="truncate">{titre}</span>
        </h3>
        {jet.sorte === 'action' && <Statut resultat={jet.resultat} />}
      </header>

      {jet.sorte === 'formule' && (
        <JetNumerique
          total={jet.valeur}
          jets={jet.jets}
          systeme={systeme}
          presentation={presentation}
          compact={compact}
        />
      )}

      {jet.sorte === 'symboles' && (
        <JetSymboles
          des={jet.lancer.des}
          resultats={jet.lancer.resultats}
          symboles={jet.lancer.symboles}
          systeme={systeme}
          presentation={presentation}
          compact={compact}
        />
      )}

      {jet.sorte === 'action' &&
        (jet.resultat.jet.type === 'numerique' ? (
          <JetNumerique
            total={jet.resultat.jet.total}
            jets={jet.resultat.jet.jets}
            formule={jet.resultat.jet.formule}
            naturel={jet.resultat.jet.naturel}
            bonus={jet.resultat.jet.bonus}
            systeme={systeme}
            presentation={presentation}
            compact={compact}
          />
        ) : (
          <JetSymboles
            des={jet.resultat.jet.des}
            resultats={jet.resultat.jet.resultats}
            symboles={jet.resultat.jet.symboles}
            systeme={systeme}
            presentation={presentation}
            compact={compact}
          />
        ))}

      {jet.sorte === 'action' && jet.resultat.modifications.length > 0 && (
        <Modifications
          modifications={jet.resultat.modifications}
          applique={!!jet.applique}
          systeme={systeme}
          noms={noms}
        />
      )}

      {jet.sorte === 'action' && jet.resultat.tables.length > 0 && (
        <Tables tables={jet.resultat.tables} systeme={systeme} />
      )}

      {!compact && jet.sorte === 'symboles' && jet.lancer.erreurs.length > 0 && (
        <Erreurs erreurs={jet.lancer.erreurs} />
      )}

      {!compact && jet.sorte === 'action' && (
        <>
          {jet.resultat.erreurs.length > 0 && <Erreurs erreurs={jet.resultat.erreurs} />}
          {jet.resultat.explications.length > 0 && (
            <details className="group rounded-lg border border-zinc-800 bg-zinc-900/50">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200">
                Explications
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <ol className="space-y-1 border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400">
                {jet.resultat.explications.map((e, i) => (
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

function Pastille({
  couleur,
  icone,
  children,
}: {
  couleur: string;
  icone: ReactNode;
  children: ReactNode;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
      style={{
        color: couleur,
        borderColor: attenuer(couleur, 45),
        backgroundColor: attenuer(couleur, 12),
      }}
    >
      {icone}
      {children}
    </span>
  );
}

function Statut({ resultat }: { resultat: ResultatAction }) {
  const j = resultat.jet;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {j.type === 'numerique' && j.critique && (
        <Pastille couleur="#f59e0b" icone={<Crown className="h-3.5 w-3.5" />}>
          Critique
        </Pastille>
      )}
      {j.type === 'numerique' && j.fumble && (
        <Pastille couleur="#a855f7" icone={<Skull className="h-3.5 w-3.5" />}>
          Échec critique
        </Pastille>
      )}
      {resultat.reussi ? (
        <Pastille couleur="#10b981" icone={<CircleCheck className="h-3.5 w-3.5" />}>
          Réussite
        </Pastille>
      ) : (
        <Pastille couleur="#ef4444" icone={<CircleX className="h-3.5 w-3.5" />}>
          Échec
        </Pastille>
      )}
    </div>
  );
}

// ─── Jet numérique ───────────────────────────────────────────────────────────

/** Dés d'un jet numérique : dés écartés barrés, explosions marquées. */
export function DesNumeriques({
  jets,
  systeme,
  presentation,
  taille = 40,
}: {
  jets: JetDes[];
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  taille?: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {jets.map((j, i) => {
        const a = apparenceSorte(`d${j.faces}`, systeme, presentation);
        return (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-500">d{j.faces}</span>
            {j.des.map((d, k) => (
              <span key={k} className="relative">
                <DeForme
                  forme={a.forme}
                  couleur={a.couleur}
                  taille={taille}
                  plein={d.garde}
                  className={cn(!d.garde && 'opacity-40')}
                  titre={`${d.valeur}${d.garde ? '' : ' (écarté)'}${d.explosion ? ' (explosion)' : ''}`}
                >
                  <span className={cn(!d.garde && 'line-through')}>{d.valeur}</span>
                </DeForme>
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

function JetNumerique({
  total,
  jets,
  formule,
  naturel,
  bonus,
  systeme,
  presentation,
  compact,
}: {
  total: number;
  jets: JetDes[];
  formule?: string;
  naturel?: number;
  bonus?: { nom: string; valeur: number }[];
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  compact: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="text-4xl font-bold tabular-nums text-white">{total}</span>
        {naturel !== undefined && jets.length > 0 && (
          <span className="pb-1 text-sm text-zinc-400">naturel {naturel}</span>
        )}
      </div>
      {!compact && jets.length > 0 && (
        <DesNumeriques jets={jets} systeme={systeme} presentation={presentation} />
      )}
      {!compact && (formule || (bonus && bonus.length > 0)) && (
        <div className="space-y-1 text-xs text-zinc-500">
          {formule && <p className="break-words font-mono">{formule}</p>}
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
export function DesSymboles({
  des,
  systeme,
  presentation,
  taille = 46,
}: {
  des: DeSymbole[];
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  taille?: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {des.map((d, i) => {
        const a = apparenceSorte(d.de, systeme, presentation);
        const symboles = Object.entries(d.symboles);
        const titre = `${a.nom}, face ${d.face} : ${
          symboles
            .map(([s, n]) => `${apparenceSymbole(s, systeme, presentation).nom} ×${n}`)
            .join(', ') || 'vierge'
        }`;
        return (
          <DeForme key={i} forme={a.forme} couleur={a.couleur} taille={taille} titre={titre}>
            {symboles.length === 0 ? (
              <span className="opacity-40">—</span>
            ) : (
              symboles.flatMap(([s, n]) =>
                Array.from({ length: Math.min(n, 3) }, (_, k) => (
                  <IconeSymbole
                    key={`${s}-${k}`}
                    apparence={apparenceSymbole(s, systeme, presentation)}
                    taille={Math.round(taille * (symboles.length + n > 2 ? 0.26 : 0.36))}
                  />
                )),
              )
            )}
          </DeForme>
        );
      })}
    </div>
  );
}

function JetSymboles({
  des,
  resultats,
  symboles,
  systeme,
  presentation,
  compact,
}: {
  des: DeSymbole[];
  resultats: Record<string, number>;
  symboles: Record<string, number>;
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  compact: boolean;
}) {
  const lus = (systeme.source.des?.resultats ?? []).filter(
    (r) => r.visible && (resultats[r.cle] ?? 0) !== 0,
  );
  const sortis = (systeme.source.des?.symboles ?? []).filter((s) => (symboles[s.id] ?? 0) > 0);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {lus.length ? (
          lus.map((r) => (
            <BadgeSymbole
              key={r.cle}
              apparence={apparenceSymbole(r.cle, systeme, presentation)}
              valeur={resultats[r.cle] ?? 0}
            />
          ))
        ) : (
          <span className="text-sm text-zinc-500">Aucun résultat net</span>
        )}
      </div>
      {!compact && des.length > 0 && (
        <DesSymboles des={des} systeme={systeme} presentation={presentation} />
      )}
      {!compact && sortis.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
          <span>Symboles bruts :</span>
          {sortis.map((s) => (
            <span key={s.id} className="inline-flex items-center gap-1">
              <IconeSymbole apparence={apparenceSymbole(s.id, systeme, presentation)} taille={12} />
              {symboles[s.id]}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// ─── Conséquences et tables ──────────────────────────────────────────────────

function nomAttribut(systeme: SystemeCharge, cle: string): string {
  for (const e of systeme.entites.values()) {
    const a = e.attributs.get(cle);
    if (a) return a.nom;
  }
  return cle;
}

function Modifications({
  modifications,
  applique,
  systeme,
  noms,
}: {
  modifications: Modification[];
  applique: boolean;
  systeme: SystemeCharge;
  noms?: { acteur?: string; cible?: string };
}) {
  const qui = (e: 'acteur' | 'cible') =>
    e === 'cible' ? (noms?.cible ?? 'Cible') : (noms?.acteur ?? 'Acteur');
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {applique ? 'Conséquences appliquées' : 'Conséquences proposées'}
      </h4>
      <ul className="space-y-1.5">
        {modifications.map((m, i) => {
          if ('entree' in m) {
            const nom = systeme.entrees.get(m.entree)?.nom ?? m.entree;
            const aRangs = !!systeme.sortes.get(systeme.entrees.get(m.entree)?.sorte ?? '')?.rangs;
            return (
              <li
                key={i}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm"
              >
                <span className="text-zinc-400">{qui(m.entite)}</span>
                <span className={m.operation === 'donner' ? 'text-amber-300' : 'text-emerald-300'}>
                  {m.operation === 'donner' ? 'reçoit' : 'perd'} {nom}
                  {aRangs && m.rangs !== 1 ? ` (${m.rangs} rangs)` : ''}
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
            ? (systeme.source.typesDegats.find((t) => t.id === m.type)?.nom ?? m.type)
            : undefined;
          const valeur =
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
              <span className="text-zinc-400">{qui(m.entite)}</span>
              <span className="font-medium text-white">
                {nomAttribut(systeme, m.attribut)} {valeur}
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

function Tables({ tables, systeme }: { tables: TirageTable[]; systeme: SystemeCharge }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Tables tirées
      </h4>
      <ul className="space-y-1.5">
        {tables.map((t, i) => {
          const table = systeme.tables.get(t.table);
          const entree = t.ligne?.entree ? systeme.entrees.get(t.ligne.entree) : undefined;
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
              {(entree || t.horsTable) && (
                <p className="mt-1 text-xs text-zinc-500">
                  {entree && <>Donne : {entree.nom}. </>}
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

function Erreurs({ erreurs }: { erreurs: { ou: string; message: string }[] }) {
  return (
    <ul className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
      {erreurs.map((e, i) => (
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
