'use client';

/** Étapes qui fixent des valeurs d'attributs : répartir, tirer, saisir. */
import {
  attributsVises,
  chemins,
  essayer,
  repartirEtape,
  saisirEtape,
  variables,
  type Attribut,
  type EtatEtape,
  type Fiche,
  type Valeur,
} from '@vtt/rules';
import { Dices, Minus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { ecritures } from '@/lib/characters';
import { cn } from '@/lib/utils';
import { useFiche } from '../context';
import { VideFiche } from '../elements';
import { formaterNombre, formaterValeur } from '../format';
import {
  boutonAccent,
  boutonIcone,
  boutonSecondaire,
  caseValeur,
  champ,
  focus,
  texte,
  texteAccent,
  texteSecondaire,
} from '../styles';
import type { Etape } from './assistant';

type Base = Extract<Attribut, { nature: 'base' }>;
const estBase = (a: Attribut): a is Base => a.nature === 'base';

/** Évalue une formule d'étape (budget, coût, bornes) ; undefined si absente ou en erreur. */
function formuleEtape(
  fiche: Fiche,
  etape: string,
  champ: string,
  vars?: Record<string, Valeur>,
): number | undefined {
  const f = fiche.systeme.formules.get(chemins.etape(fiche.etat.type, etape, champ));
  if (!f) return undefined;
  const r = essayer(fiche, f, vars ? { variable: variables(vars) } : {});
  return r.ok ? Number(r.valeur) : undefined;
}

const valeurBase = (fiche: Fiche, a: Base) => {
  const v = fiche.etat.valeurs[a.cle];
  return typeof v === 'number' ? v : a.defaut;
};

// ─── Répartir ────────────────────────────────────────────────────────────────

export function EtapeRepartir({
  etape,
  etat: examen,
  onSuivante,
}: {
  etape: Etape<'repartir'>;
  etat: EtatEtape;
  onSuivante(): void;
}) {
  const { systeme, fiche, ecrire } = useFiche();
  const attributs = attributsVises(fiche.entite, etape, estBase).filter(estBase);
  const [valeurs, setValeurs] = useState<Record<string, number>>(() =>
    Object.fromEntries(attributs.map((a) => [a.cle, valeurBase(fiche, a)])),
  );
  const [envoi, setEnvoi] = useState(false);

  const budget = formuleEtape(fiche, etape.id, 'budget') ?? examen.budget;
  const min = formuleEtape(fiche, etape.id, 'min');
  const max = formuleEtape(fiche, etape.id, 'max');
  const cout = (v: number) => formuleEtape(fiche, etape.id, 'cout', { valeur: v }) ?? 0;
  const depense = attributs.reduce((s, a) => s + cout(valeurs[a.cle] ?? 0), 0);
  const reste = budget !== undefined ? budget - depense : undefined;

  async function valider() {
    setEnvoi(true);
    const ok = await ecrire(ecritures.etape(etape.id, { valeurs }), (e) => {
      const r = repartirEtape(systeme, e, etape.id, valeurs);
      return r.ok ? r.etat : null;
    });
    setEnvoi(false);
    if (ok) onSuivante();
  }

  if (!attributs.length) return <VideFiche>Aucun attribut à répartir.</VideFiche>;

  return (
    <div className="space-y-4">
      {reste !== undefined && (
        <p
          role="status"
          className={cn('text-sm', reste < 0 ? 'text-red-400' : texte)}
          aria-live="polite"
        >
          Points restants :{' '}
          <strong className={cn('tabular-nums', reste >= 0 && texteAccent)}>
            {formaterNombre(reste)}
          </strong>{' '}
          <span className={texteSecondaire}>sur {formaterNombre(budget ?? 0)}</span>
        </p>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {attributs.map((a) => {
          const v = valeurs[a.cle] ?? 0;
          const surcout = cout(v + 1) - cout(v);
          const plus =
            (max === undefined || v + 1 <= max) && (reste === undefined || surcout <= reste);
          const moins = min === undefined || v - 1 >= min;
          return (
            <li key={a.cle} className={cn(caseValeur, 'flex items-center gap-3 px-3 py-2')}>
              <span className="min-w-0 flex-1">
                <span className={cn(texte, 'block truncate text-sm')}>{a.nom}</span>
                <span className={cn(texteSecondaire, 'block text-xs tabular-nums')}>
                  coût {formaterNombre(cout(v))}
                </span>
              </span>
              <button
                type="button"
                className={boutonIcone}
                disabled={!moins || envoi}
                aria-label={`${a.nom} : retirer 1`}
                onClick={() => setValeurs((m) => ({ ...m, [a.cle]: v - 1 }))}
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                className={cn(texte, 'w-8 text-center text-lg font-semibold tabular-nums')}
                aria-live="polite"
              >
                {v}
              </span>
              <button
                type="button"
                className={boutonIcone}
                disabled={!plus || envoi}
                aria-label={`${a.nom} : ajouter 1`}
                onClick={() => setValeurs((m) => ({ ...m, [a.cle]: v + 1 }))}
              >
                <Plus className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex justify-end">
        <button
          type="button"
          className={boutonAccent}
          disabled={envoi || (reste !== undefined && reste < 0)}
          onClick={valider}
        >
          Valider la répartition
        </button>
      </div>
    </div>
  );
}

// ─── Tirer ───────────────────────────────────────────────────────────────────

/**
 * Tirage fait par le serveur (générateur cryptographique). En attribution
 * libre, les valeurs tirées peuvent ensuite être échangées entre attributs.
 */
export function EtapeTirer({ etape }: { etape: Etape<'tirer'> }) {
  const { fiche, ecrire, fixerValeurs } = useFiche();
  const attributs = attributsVises(fiche.entite, etape, estBase).filter(estBase);
  const tires = attributs.every((a) => typeof fiche.etat.valeurs[a.cle] === 'number');
  const valeursTirees = attributs.map((a) => valeurBase(fiche, a));
  // Attribution libre : indice de la valeur tirée retenue pour chaque attribut
  const [affectation, setAffectation] = useState<number[]>(() => attributs.map((_, i) => i));
  const [envoi, setEnvoi] = useState(false);
  const permutation = new Set(affectation).size === attributs.length;
  const modifiee = affectation.some((x, i) => x !== i);

  async function tirer() {
    setEnvoi(true);
    await ecrire(ecritures.etape(etape.id, {}));
    setEnvoi(false);
  }

  async function reattribuer() {
    setEnvoi(true);
    await fixerValeurs(
      Object.fromEntries(attributs.map((a, i) => [a.cle, valeursTirees[affectation[i]!]!])),
    );
    setEnvoi(false);
  }

  if (!attributs.length) return <VideFiche>Aucun attribut à tirer.</VideFiche>;

  return (
    <div className="space-y-4">
      <p className={cn(texteSecondaire, 'text-sm')}>
        Formule <code className={texte}>{etape.formule}</code>
        {etape.contrainte && (
          <>
            {' '}
            · contrainte <code className={texte}>{etape.contrainte}</code>
            {etape.relancer ? ' (relancé automatiquement)' : ''}
          </>
        )}
        {' · '}
        {etape.essais} essai{etape.essais > 1 ? 's' : ''}
        {' · '}
        {etape.attribution === 'ordre' ? 'valeurs attribuées dans l’ordre' : 'répartition libre'}
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attributs.map((a, i) => (
          <li key={a.cle} className={cn(caseValeur, 'px-3 py-2 text-center')}>
            <label
              htmlFor={`tirage-${a.cle}`}
              className={cn(texteSecondaire, 'block text-xs uppercase tracking-wide')}
            >
              {a.abrege ?? a.nom}
            </label>
            {tires && etape.attribution === 'libre' ? (
              <select
                id={`tirage-${a.cle}`}
                value={affectation[i]}
                onChange={(e) =>
                  setAffectation((af) => af.map((x, j) => (j === i ? Number(e.target.value) : x)))
                }
                className={cn(champ, 'mt-1 h-8 text-center')}
              >
                {valeursTirees.map((v, j) => (
                  <option key={j} value={j}>
                    {v} (n°{j + 1})
                  </option>
                ))}
              </select>
            ) : (
              <span
                id={`tirage-${a.cle}`}
                className={cn(texte, 'block text-2xl font-semibold tabular-nums')}
              >
                {tires ? formaterValeur(a, fiche.etat.valeurs[a.cle]) : '—'}
              </span>
            )}
          </li>
        ))}
      </ul>

      {!permutation && (
        <p className="text-xs text-red-300">Chaque valeur tirée ne peut servir qu&apos;une fois.</p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        {tires && etape.attribution === 'libre' && modifiee && (
          <button
            type="button"
            className={boutonSecondaire}
            disabled={!permutation || envoi}
            onClick={reattribuer}
          >
            Enregistrer la répartition
          </button>
        )}
        <button type="button" className={boutonAccent} disabled={envoi} onClick={tirer}>
          <Dices />
          {tires ? 'Tirer à nouveau' : 'Tirer'}
        </button>
      </div>
    </div>
  );
}

// ─── Saisir ──────────────────────────────────────────────────────────────────

export function EtapeSaisir({ etape, onSuivante }: { etape: Etape<'saisir'>; onSuivante(): void }) {
  const { systeme, fiche, json, ecrire } = useFiche();
  const attributs = attributsVises(fiche.entite, etape, (a) => a.nature !== 'derivee');
  const [valeurs, setValeurs] = useState<Record<string, Valeur | ''>>(() =>
    Object.fromEntries(
      attributs.map((a) => {
        const v = fiche.etat.valeurs[a.cle];
        if (v !== undefined) return [a.cle, v];
        switch (a.nature) {
          case 'texte':
            return [a.cle, a.defaut];
          case 'booleen':
            return [a.cle, a.defaut];
          case 'choix':
            return [a.cle, a.defaut ?? ''];
          case 'base':
            return [a.cle, a.defaut];
          default:
            return [a.cle, json.valeurs[a.cle]?.valeur ?? ''];
        }
      }),
    ),
  );
  const [envoi, setEnvoi] = useState(false);

  async function valider(e: FormEvent) {
    e.preventDefault();
    const corps: Record<string, Valeur> = {};
    for (const a of attributs) {
      const v = valeurs[a.cle];
      if (v === undefined || (v === '' && a.nature !== 'texte')) continue;
      corps[a.cle] = v;
    }
    setEnvoi(true);
    const ok = await ecrire(ecritures.etape(etape.id, { valeurs: corps }), (et) => {
      const r = saisirEtape(systeme, et, etape.id, corps);
      return r.ok ? r.etat : null;
    });
    setEnvoi(false);
    if (ok) onSuivante();
  }

  if (!attributs.length) return <VideFiche>Aucune valeur à saisir.</VideFiche>;

  return (
    <form onSubmit={valider} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {attributs.map((a) => {
          const id = `saisie-${a.cle}`;
          const v = valeurs[a.cle];
          const large = a.nature === 'texte' && a.multiligne;
          const maj = (x: Valeur | '') => setValeurs((m) => ({ ...m, [a.cle]: x }));
          return (
            <div key={a.cle} className={cn('space-y-1', large && 'sm:col-span-2')}>
              <label htmlFor={id} className={cn(texte, 'block text-sm')}>
                {a.nom}
              </label>
              {a.description && <p className={cn(texteSecondaire, 'text-xs')}>{a.description}</p>}
              {a.nature === 'texte' ? (
                large ? (
                  <textarea
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => maj(e.target.value)}
                    rows={4}
                    className={cn(champ, 'h-auto py-2')}
                  />
                ) : (
                  <input
                    id={id}
                    value={typeof v === 'string' ? v : ''}
                    onChange={(e) => maj(e.target.value)}
                    className={champ}
                  />
                )
              ) : a.nature === 'choix' ? (
                <select
                  id={id}
                  value={typeof v === 'string' ? v : ''}
                  onChange={(e) => maj(e.target.value)}
                  className={champ}
                  required
                >
                  <option value="" disabled>
                    Choisir…
                  </option>
                  {a.options.map((o) => (
                    <option key={o.valeur} value={o.valeur}>
                      {o.nom}
                    </option>
                  ))}
                </select>
              ) : a.nature === 'booleen' ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={v === true}
                  onChange={(e) => maj(e.target.checked)}
                  className={cn('h-5 w-5 accent-[color:var(--fiche-accent)]', focus)}
                />
              ) : (
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  value={typeof v === 'number' ? v : ''}
                  onChange={(e) => maj(e.target.value === '' ? '' : Number(e.target.value))}
                  className={cn(champ, 'w-32')}
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="submit" className={boutonAccent} disabled={envoi}>
          Valider cette étape
        </button>
      </div>
    </form>
  );
}
