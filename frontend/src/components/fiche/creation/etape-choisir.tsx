'use client';

import {
  choisirEtape,
  nouvellePossession,
  type Champ,
  type Entree,
  type EtatEntite,
} from '@vtt/rules';
import { AlertTriangle, Check, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ecritures, type EntreeChoisie } from '@/lib/personnages';
import { cn } from '@/lib/utils';
import { calculerSur, useFiche } from '../contexte';
import { aDesChoix, choixIncomplets, EditeurChoix, type Choix } from '../editeur-choix';
import { normaliser, VideFiche } from '../elements';
import { prerequisRempli } from '../possessions';
import { boutonAccent, champ, focus, texte, texteAccent, texteSecondaire } from '../styles';
import type { Etape } from './assistant';

type ValeurChamp = number | string | boolean;

interface Selection {
  entree: string;
  choix: Choix;
  /** Champs de l'exemplaire modifiés dans l'assistant (valeur d'une Obligation…). */
  champs: Record<string, ValeurChamp>;
}

const RECHERCHE_DES = 8;

/** Étape « choisir » : entrées de la sorte, leurs choix et les champs de chaque exemplaire. */
export function EtapeChoisir({
  etape,
  onSuivante,
}: {
  etape: Etape<'choisir'>;
  onSuivante(): void;
}) {
  const { systeme, etat, fiche, ecrire } = useFiche();
  const sorte = systeme.sortes.get(etape.sorte);
  const catalogue = useMemo(
    () =>
      [...systeme.entrees.values()]
        .filter((e) => e.sorte === etape.sorte)
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    [systeme, etape.sorte],
  );
  const deSorte = (id: string) => systeme.entrees.get(id)?.sorte === etape.sorte;
  const [selection, setSelection] = useState<Selection[]>(() =>
    etat.possessions
      .filter((p) => deSorte(p.entree))
      .map((p) => ({ entree: p.entree, choix: { ...p.choix }, champs: {} })),
  );
  const [recherche, setRecherche] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const unique = etape.max === 1;
  const ids = selection.map((s) => s.entree);

  // Fiche d'aperçu : la sélection possédée, sans ses choix (comme la vérification du moteur)
  const cleSelection = ids.join('|');
  const apercu = useMemo(() => {
    const autres = etat.possessions.filter(
      (p) => systeme.entrees.get(p.entree)?.sorte !== etape.sorte,
    );
    const choisies = cleSelection
      ? cleSelection.split('|').map((id) => ({
          ...(etat.possessions.find((p) => p.entree === id) ?? nouvellePossession(id)),
          choix: {},
        }))
      : [];
    return calculerSur(systeme, { ...etat, possessions: [...autres, ...choisies] }) ?? fiche;
  }, [systeme, etat, fiche, cleSelection, etape.sorte]);

  if (!sorte) return <VideFiche>Sorte inconnue : {etape.sorte}</VideFiche>;

  const basculer = (e: Entree) => {
    setSelection((sel) => {
      if (sel.some((s) => s.entree === e.id)) return sel.filter((s) => s.entree !== e.id);
      const nouvelle: Selection = { entree: e.id, choix: {}, champs: {} };
      if (unique) return [nouvelle];
      return sel.length < etape.max ? [...sel, nouvelle] : sel;
    });
  };
  const modifier = (id: string, maj: Partial<Selection>) =>
    setSelection((sel) => sel.map((s) => (s.entree === id ? { ...s, ...maj } : s)));

  const filtre = normaliser(recherche.trim());
  const visibles = catalogue.filter((e) => !filtre || normaliser(e.nom).includes(filtre));
  const champsModifiables = sorte.champs.filter(
    (c) => c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen',
  );
  const incomplets = selection.flatMap((s) => {
    const e = systeme.entrees.get(s.entree);
    return e ? choixIncomplets(apercu, e, s.choix).map((c) => `${e.nom} : ${c}`) : [];
  });
  const assez = selection.length >= etape.min && selection.length <= etape.max;

  async function valider() {
    setEnvoi(true);
    const entrees: EntreeChoisie[] = selection.map((s) => {
      const e = systeme.entrees.get(s.entree)!;
      const choix = Object.fromEntries(
        Object.entries(s.choix).filter(([k]) => e.choix.some((c) => c.id === k)),
      );
      return { entree: s.entree, ...(Object.keys(choix).length ? { choix } : {}) };
    });
    let ok = await ecrire(ecritures.etape(etape.id, { entrees }), (et: EtatEntite) => {
      const r = choisirEtape(systeme, et, etape.id, entrees);
      return r.ok ? r.etat : null;
    });
    // Choix d'attributs et champs d'exemplaire : enregistrés sur chaque possession
    for (const s of selection) {
      if (!ok) break;
      const e = systeme.entrees.get(s.entree)!;
      const choixAttributs = e.choixAttributs.some((c) => s.choix[c.id]?.length);
      if (!choixAttributs && !Object.keys(s.champs).length) continue;
      ok = await ecrire(
        ecritures.possession({
          entree: s.entree,
          ...(choixAttributs ? { choix: s.choix } : {}),
          ...(Object.keys(s.champs).length ? { champs: s.champs } : {}),
        }),
      );
    }
    setEnvoi(false);
    if (ok) onSuivante();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={cn(texteSecondaire, 'text-sm')}>
          {etape.min === etape.max
            ? `${etape.min} ${etape.min > 1 ? (sorte.nomPluriel ?? sorte.nom) : sorte.nom} à choisir`
            : `Entre ${etape.min} et ${etape.max}`}
          {' · '}
          <span className={cn(assez ? texteAccent : '', 'tabular-nums')}>
            {selection.length} choisi{selection.length > 1 ? 's' : ''}
          </span>
        </p>
        {catalogue.length > RECHERCHE_DES && (
          <div className="relative w-full sm:w-64">
            <Search
              className={cn(texteSecondaire, 'pointer-events-none absolute left-3 top-2.5 h-4 w-4')}
            />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher…"
              aria-label={`Rechercher : ${sorte.nomPluriel ?? sorte.nom}`}
              className={cn(champ, 'pl-9')}
            />
          </div>
        )}
      </div>

      <ul
        role={unique ? 'radiogroup' : 'group'}
        aria-label={etape.nom}
        className="grid max-h-[28rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
      >
        {visibles.map((e) => {
          const retenu = ids.includes(e.id);
          const prerequis = prerequisRempli(fiche, e.id);
          const plein = !unique && !retenu && selection.length >= etape.max;
          return (
            <li key={e.id}>
              <button
                type="button"
                role={unique ? 'radio' : 'checkbox'}
                aria-checked={retenu}
                disabled={plein}
                onClick={() => basculer(e)}
                className={cn(
                  'flex h-full w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  retenu
                    ? 'border-[color:var(--fiche-accent)] bg-[color:color-mix(in_srgb,var(--fiche-accent)_12%,var(--fiche-carte))]'
                    : 'border-[color:var(--fiche-bordure)] bg-[color:var(--fiche-canevas)] hover:border-[color:var(--fiche-accent)]',
                  focus,
                )}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center border',
                      unique ? 'rounded-full' : 'rounded',
                      retenu
                        ? 'border-[color:var(--fiche-accent)] bg-[color:var(--fiche-accent)] text-zinc-950'
                        : 'border-[color:var(--fiche-bordure)]',
                    )}
                  >
                    {retenu && <Check className="h-3 w-3" />}
                  </span>
                  <span className={cn(texte, 'min-w-0 flex-1 truncate text-sm font-medium')}>
                    {e.nom}
                  </span>
                  {!prerequis && (
                    <span title="Prérequis non rempli" className="text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="sr-only">Prérequis non rempli</span>
                    </span>
                  )}
                </span>
                {e.description && (
                  <span className={cn(texteSecondaire, 'line-clamp-3 text-xs leading-relaxed')}>
                    {e.description}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!visibles.length && <VideFiche>Aucun résultat.</VideFiche>}

      {selection.map((s) => {
        const e = systeme.entrees.get(s.entree);
        if (!e || (!aDesChoix(e) && !champsModifiables.length)) return null;
        return (
          <fieldset
            key={s.entree}
            className="space-y-4 rounded-xl border border-[color:var(--fiche-bordure)] p-3"
          >
            <legend className={cn(texteAccent, 'px-1 text-sm font-semibold')}>{e.nom}</legend>
            {aDesChoix(e) && (
              <EditeurChoix
                fiche={apercu}
                entree={e}
                valeur={s.choix}
                onChange={(choix) => modifier(s.entree, { choix })}
                desactive={envoi}
              />
            )}
            {champsModifiables.length > 0 && (
              <ChampsExemplaire
                entree={e}
                champs={champsModifiables}
                valeurs={s.champs}
                onChange={(champs) => modifier(s.entree, { champs })}
              />
            )}
          </fieldset>
        );
      })}

      {incomplets.length > 0 && (
        <p className={cn(texteSecondaire, 'text-xs')}>
          Choix à compléter : {incomplets.join(' ; ')}
        </p>
      )}
      <div className="flex justify-end">
        <button type="button" className={boutonAccent} disabled={!assez || envoi} onClick={valider}>
          Valider cette étape
        </button>
      </div>
    </div>
  );
}

function ChampsExemplaire({
  entree,
  champs,
  valeurs,
  onChange,
}: {
  entree: Entree;
  champs: Champ[];
  valeurs: Record<string, ValeurChamp>;
  onChange(v: Record<string, ValeurChamp>): void;
}) {
  const { etat } = useFiche();
  const possession = etat.possessions.find((p) => p.entree === entree.id);
  const actuelle = (c: Champ): ValeurChamp | undefined => {
    if (c.id in valeurs) return valeurs[c.id];
    const v = possession?.champs[c.id] ?? entree.champs[c.id];
    if (v !== undefined && !Array.isArray(v)) return v;
    return 'defaut' in c && c.defaut !== undefined && typeof c.defaut !== 'object'
      ? c.defaut
      : undefined;
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {champs.map((c) => {
        const id = `champ-${entree.id}-${c.id}`;
        const v = actuelle(c);
        return (
          <div key={c.id} className={cn('space-y-1', c.type === 'texte' && 'sm:col-span-2')}>
            <label htmlFor={id} className={cn(texteSecondaire, 'block text-xs')}>
              {c.nom}
            </label>
            {c.type === 'booleen' ? (
              <input
                id={id}
                type="checkbox"
                checked={v === true}
                onChange={(e) => onChange({ ...valeurs, [c.id]: e.target.checked })}
                className="h-4 w-4 accent-[color:var(--fiche-accent)]"
              />
            ) : c.type === 'nombre' ? (
              <input
                id={id}
                type="number"
                inputMode="numeric"
                value={typeof v === 'number' ? v : ''}
                onChange={(e) =>
                  e.target.value !== '' && onChange({ ...valeurs, [c.id]: Number(e.target.value) })
                }
                className={cn(champ, 'w-32')}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={typeof v === 'string' ? v : ''}
                onChange={(e) => onChange({ ...valeurs, [c.id]: e.target.value })}
                className={champ}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
