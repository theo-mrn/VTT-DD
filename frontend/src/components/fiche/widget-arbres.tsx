'use client';

import {
  arbreOuvert,
  chemins,
  essayer,
  type Arbre,
  type ObjetAchetable,
  type Widget,
} from '@vtt/rules';
import { Check, Lock, Undo2 } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { BoutonAchat } from './bouton-achat';
import { useFiche } from './contexte';
import { Bloc, VideFiche } from './elements';
import { derniereLigne } from './possessions';
import { boutonSecondaire, focus, texte, texteAccent, texteSecondaire } from './styles';

type WidgetArbres = Extract<Widget, { type: 'arbres' }>;
type Noeud = Arbre['noeuds'][number];
type Statut = 'acquis' | 'achetable' | 'bloque';

/** Géométrie par défaut de la grille, quand la présentation n'en déclare pas (px). */
const GEOMETRIE = { colonne: 190, ligne: 110, noeud: { largeur: 170, hauteur: 60 } };

export function WidgetArbres({ widget }: { widget: WidgetArbres }) {
  const { systeme, fiche } = useFiche();
  const ouverts = useMemo(
    () =>
      [...systeme.arbres.values()].filter(
        (a) =>
          arbreOuvert(fiche, a) &&
          a.noeuds.some((n) => {
            const e = systeme.entrees.get(n.entree);
            return !!e && !!systeme.sortes.get(e.sorte)?.pour.includes(fiche.etat.type);
          }),
      ),
    [systeme, fiche],
  );
  const [choisi, setChoisi] = useState<string | null>(null);
  const actif = ouverts.find((a) => a.id === choisi) ?? ouverts[0];
  const idOnglets = useId();

  return (
    <Bloc titre={widget.titre}>
      {!actif ? (
        <VideFiche>Aucun arbre ouvert pour l&apos;instant.</VideFiche>
      ) : (
        <>
          {ouverts.length > 1 && (
            <div
              role="tablist"
              aria-label={widget.titre}
              className="mb-3 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]"
            >
              {ouverts.map((a) => (
                <button
                  key={a.id}
                  id={`${idOnglets}-${a.id}`}
                  type="button"
                  role="tab"
                  aria-selected={a.id === actif.id}
                  aria-controls={`${idOnglets}-panneau`}
                  onClick={() => setChoisi(a.id)}
                  className={cn(
                    'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                    a.id === actif.id
                      ? 'bg-[color:color-mix(in_srgb,var(--fiche-accent)_16%,transparent)] text-[color:var(--fiche-accent)]'
                      : 'text-[color:var(--fiche-texte-secondaire)] hover:text-[color:var(--fiche-texte)]',
                    focus,
                  )}
                >
                  {a.nom}
                </button>
              ))}
            </div>
          )}
          <div
            id={`${idOnglets}-panneau`}
            role={ouverts.length > 1 ? 'tabpanel' : undefined}
            aria-labelledby={ouverts.length > 1 ? `${idOnglets}-${actif.id}` : undefined}
          >
            <GrilleArbre key={actif.id} arbre={actif} avecNom={ouverts.length === 1} />
          </div>
        </>
      )}
    </Bloc>
  );
}

function GrilleArbre({ arbre, avecNom }: { arbre: Arbre; avecNom: boolean }) {
  const { systeme, fiche, etat, presentation, achats, lectureSeule, acheter, rembourser } =
    useFiche();
  const g = presentation.arbres ?? GEOMETRIE;
  const [selection, setSelection] = useState<string | null>(null);
  const acquis = new Set(etat.noeuds[arbre.id] ?? []);

  const objets = new Map<string, ObjetAchetable>();
  for (const a of achats)
    for (const o of a.objets)
      if (o.type === 'noeud' && o.arbre === arbre.id && o.noeud) objets.set(o.noeud, o);

  const statut = (n: Noeud): Statut =>
    acquis.has(n.id) ? 'acquis' : objets.get(n.id)?.possible ? 'achetable' : 'bloque';

  const cout = (n: Noeud) => {
    const o = objets.get(n.id);
    if (o) return o.cout;
    const f = systeme.formules.get(chemins.noeud(arbre.id, n.id));
    if (!f) return undefined;
    const r = essayer(fiche, f, {
      variable: (nom) => (nom === 'x' ? n.x : nom === 'y' ? n.y : 0),
    });
    return r.ok ? Number(r.valeur) : undefined;
  };

  const minX = Math.min(...arbre.noeuds.map((n) => n.x));
  const minY = Math.min(...arbre.noeuds.map((n) => n.y));
  const pos = (n: Noeud) => ({ x: (n.x - minX) * g.colonne, y: (n.y - minY) * g.ligne });
  const largeur = Math.max(...arbre.noeuds.map((n) => pos(n).x)) + g.noeud.largeur;
  const hauteur = Math.max(...arbre.noeuds.map((n) => pos(n).y)) + g.noeud.hauteur;
  const parId = new Map(arbre.noeuds.map((n) => [n.id, n]));
  const noeud = selection ? parId.get(selection) : undefined;
  const entreeNoeud = noeud ? systeme.entrees.get(noeud.entree) : undefined;
  const objetNoeud = noeud ? objets.get(noeud.id) : undefined;
  const ligneJournal = noeud ? derniereLigne(etat, `${arbre.id}/${noeud.id}`) : -1;
  const monnaie = objetNoeud
    ? (systeme.monnaies.get(objetNoeud.monnaie)?.nom ?? objetNoeud.monnaie)
    : '';

  return (
    <div className="space-y-3">
      {avecNom && <h3 className={cn(texte, 'text-sm font-semibold')}>{arbre.nom}</h3>}
      {arbre.description && <p className={cn(texteSecondaire, 'text-xs')}>{arbre.description}</p>}
      <div className="overflow-x-auto rounded-xl border border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] p-3">
        <div className="relative" style={{ width: largeur, height: hauteur }}>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={largeur}
            height={hauteur}
          >
            {arbre.liens.map((l, i) => {
              const a = parId.get(l.de);
              const b = parId.get(l.vers);
              if (!a || !b) return null;
              const pa = pos(a);
              const pb = pos(b);
              const actifLien = acquis.has(a.id) && acquis.has(b.id);
              return (
                <line
                  key={i}
                  x1={pa.x + g.noeud.largeur / 2}
                  y1={pa.y + g.noeud.hauteur / 2}
                  x2={pb.x + g.noeud.largeur / 2}
                  y2={pb.y + g.noeud.hauteur / 2}
                  stroke={actifLien ? 'var(--fiche-accent)' : 'var(--fiche-bordure)'}
                  strokeWidth={actifLien ? 4 : 3}
                  strokeDasharray={l.sens === 'simple' ? '6 4' : undefined}
                />
              );
            })}
          </svg>
          {arbre.noeuds.map((n) => {
            const e = systeme.entrees.get(n.entree);
            const s = statut(n);
            const p = pos(n);
            const c = cout(n);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelection(n.id)}
                aria-pressed={selection === n.id}
                aria-label={`${e?.nom ?? n.entree} : ${s === 'acquis' ? 'acquis' : s === 'achetable' ? `achetable${c !== undefined ? ` pour ${c}` : ''}` : 'bloqué'}`}
                className={cn(
                  'absolute flex flex-col justify-center rounded-lg border px-2 py-1 text-left transition-colors',
                  s === 'acquis' &&
                    'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_22%,var(--fiche-carte))]',
                  s === 'achetable' &&
                    'border-[color:color-mix(in_srgb,var(--fiche-accent)_55%,transparent)] bg-[color:var(--fiche-carte)] hover:border-[color:var(--fiche-accent)]',
                  s === 'bloque' &&
                    'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-carte)] opacity-60',
                  selection === n.id && 'ring-2 ring-[color:var(--fiche-accent)]',
                  focus,
                )}
                style={{ left: p.x, top: p.y, width: g.noeud.largeur, height: g.noeud.hauteur }}
              >
                <span className={cn(texte, 'line-clamp-2 text-xs font-medium leading-tight')}>
                  {e?.nom ?? n.entree}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[11px]">
                  {s === 'acquis' ? (
                    <Check className={cn(texteAccent, 'h-3 w-3')} />
                  ) : s === 'bloque' ? (
                    <Lock className={cn(texteSecondaire, 'h-3 w-3')} />
                  ) : null}
                  {c !== undefined && s !== 'acquis' && (
                    <span className={cn(texteSecondaire, 'tabular-nums')}>{c}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {noeud && (
        <div
          aria-live="polite"
          className="space-y-2 rounded-xl border border-[color:var(--fiche-bordure)] p-3"
        >
          <p className={cn(texte, 'text-sm font-semibold')}>{entreeNoeud?.nom ?? noeud.entree}</p>
          {entreeNoeud?.description && (
            <p className={cn(texteSecondaire, 'whitespace-pre-line text-sm')}>
              {entreeNoeud.description}
            </p>
          )}
          {statut(noeud) === 'bloque' && objetNoeud && (
            <p className="text-xs text-red-300">
              {objetNoeud.blocages.map((b) => b.message).join(' ; ')}
            </p>
          )}
          {!lectureSeule && (
            <div className="flex flex-wrap gap-2">
              {objetNoeud && !acquis.has(noeud.id) && (
                <BoutonAchat
                  objet={objetNoeud}
                  libelle={`Acheter ${entreeNoeud?.nom ?? noeud.entree}`}
                  monnaie={monnaie}
                  texteBouton={`Acheter · ${objetNoeud.cout} ${monnaie}`}
                  onAcheter={() => acheter(objetNoeud.achat, objetNoeud.objet)}
                />
              )}
              {acquis.has(noeud.id) && ligneJournal >= 0 && (
                <button
                  type="button"
                  className={boutonSecondaire}
                  onClick={() => void rembourser(ligneJournal)}
                >
                  <Undo2 />
                  Annuler l&apos;achat
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
