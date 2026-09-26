'use client';

/**
 * Panneau des actions d'un personnage : liste des actions du système permises
 * à son type d'entité, formulaire des paramètres généré depuis la définition,
 * aperçu du jet calculé localement, puis lancer par le service character
 * (qui fait autorité) et affichage du résultat.
 *
 * Aucune clé de jeu : actions, paramètres, conditions (`exige`), dés et
 * libellés viennent du système chargé et de sa présentation.
 */
import { Ban, Crosshair, Dices, Info, Swords } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  aleatoireGraine,
  chemins,
  executerAction,
  type Action,
  type EtapePool,
  type Fiche,
  type Pool,
  type Presentation,
  type ResultatExecution,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { Bouton, Interrupteur, Message, styleChamp } from '@/components/compte/elements';
import { Input } from '@/components/ui/input';
import { messageErreur } from '@/lib/api';
import { executerActionPersonnage, type PersonnageJet } from '@/lib/jets';
import { cn } from '@/lib/utils';
import {
  accentPresentation,
  apparenceSorte,
  attenuer,
  DeForme,
  sortesAmeliorees,
  texteSur,
} from './apparence';
import { ResultatJet, type JetAffiche } from './resultat-jet';

// ─── Props ───────────────────────────────────────────────────────────────────

/** Cible proposée pour les actions qui en déclarent une. */
export interface CibleAction {
  /** Identifiant du personnage visé, envoyé au serveur (`cibleId`). */
  id: string;
  nom: string;
  /**
   * Fiche calculée de la cible (`calculer(systeme, cible.etat)`) : elle permet
   * l'aperçu du jet et les options de réaction de la cible. Facultative.
   */
  fiche?: Fiche;
  /** Type d'entité, quand la fiche n'est pas fournie (filtre des cibles valides). */
  type?: string;
}

export interface PanneauActionsProps {
  /** Personnage qui agit (route `POST /v1/characters/:id/actions/:action`). */
  personnageId: string;
  /** Système chargé (`charger`). */
  systeme: SystemeCharge;
  /** Présentation vérifiée du système (couleurs des dés, icônes) ; facultative. */
  presentation?: Presentation | null;
  /**
   * Fiche de l'acteur calculée localement (`calculer(systeme, personnage.etat)`) :
   * sert à griser les actions et options indisponibles et à l'aperçu du jet.
   * Le serveur recalcule tout et fait autorité.
   */
  fiche: Fiche;
  /** Nom de l'acteur, affiché dans les conséquences. */
  nom?: string;
  /** Cibles possibles ; seules celles du type attendu par l'action sont proposées. */
  cibles?: CibleAction[];
  /** Restreint la liste à ces actions (bloc `actions` de la présentation). */
  actions?: string[];
  /**
   * Appelé quand le serveur a appliqué les conséquences : acteur à jour, et
   * cible à jour si elle a été modifiée.
   */
  onApplique?(personnage: PersonnageJet, cible?: PersonnageJet): void;
  className?: string;
}

type Parametre = Action['parametres'][number];

// ─── Règles lues localement ──────────────────────────────────────────────────

/** Condition compilée (`exige`) vraie pour cette fiche ; vraie s'il n'y en a pas. */
function conditionRemplie(systeme: SystemeCharge, fiche: Fiche, chemin: string): boolean {
  const f = systeme.formules.get(chemin);
  return !f || fiche.evaluer(f, {}, false) === true;
}

/**
 * Paramètre proposé : une option réservée (`exige`) n'apparaît que si le
 * décideur la remplit. Une réaction de la cible n'est proposée que si sa fiche
 * est connue (ou si elle n'est pas réservée).
 */
function parametreVisible(
  systeme: SystemeCharge,
  action: Action,
  p: Parametre,
  acteur: Fiche,
  cible: Fiche | undefined,
): boolean {
  const chemin = chemins.action(action.id, `parametres/${p.id}/exige`);
  if (p.par === 'cible') {
    if (!action.cible) return false;
    if (!systeme.formules.has(chemin)) return true;
    return !!cible && conditionRemplie(systeme, cible, chemin);
  }
  return conditionRemplie(systeme, acteur, chemin);
}

interface OptionEntree {
  id: string;
  nom: string;
  rang: number;
  possedee: boolean;
}

/** Entrées proposées pour un paramètre `entree` (possédées et actives d'abord). */
function optionsEntree(
  systeme: SystemeCharge,
  fiche: Fiche,
  p: Extract<Parametre, { type: 'entree' }>,
): OptionEntree[] {
  const options: OptionEntree[] = [];
  for (const e of systeme.entrees.values()) {
    if (e.sorte !== p.sorte) continue;
    if (p.etiquette && !e.etiquettes.includes(p.etiquette)) continue;
    const possession = fiche.possessions.get(e.id);
    if (possession && !possession.actif) continue;
    if (!possession && p.possedee) continue;
    options.push({ id: e.id, nom: e.nom, rang: possession?.rang ?? 0, possedee: !!possession });
  }
  const tri = (a: OptionEntree, b: OptionEntree) => a.nom.localeCompare(b.nom, 'fr');
  return [
    ...options.filter((o) => o.possedee).sort(tri),
    ...options.filter((o) => !o.possedee).sort(tri),
  ];
}

/** Attributs proposés pour un paramètre `attribut` (liste explicite ou groupe). */
function optionsAttribut(fiche: Fiche, p: Extract<Parametre, { type: 'attribut' }>) {
  return [...fiche.entite.attributs.values()]
    .filter(
      (a) => p.attributs?.includes(a.cle) || (p.groupe !== undefined && a.groupe === p.groupe),
    )
    .map((a) => ({ cle: a.cle, nom: a.nom, valeur: fiche.valeur(a.cle) }));
}

function valeursInitiales(
  systeme: SystemeCharge,
  action: Action | undefined,
  fiche: Fiche,
): Record<string, Valeur> {
  const v: Record<string, Valeur> = {};
  for (const p of action?.parametres ?? []) {
    if (p.type === 'nombre' || p.type === 'booleen') v[p.id] = p.defaut;
    else if (p.type === 'attribut') v[p.id] = optionsAttribut(fiche, p)[0]?.cle ?? '';
    else {
      // Entrée : la première possédée, sinon rien (choix explicite)
      const premiere = optionsEntree(systeme, fiche, p)[0];
      v[p.id] = !p.facultatif && premiere?.possedee ? premiere.id : '';
    }
  }
  return v;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function PanneauActions({
  personnageId,
  systeme,
  presentation,
  fiche,
  nom,
  cibles = [],
  actions: restriction,
  onApplique,
  className,
}: PanneauActionsProps) {
  const accent = accentPresentation(presentation);

  const actions = useMemo(
    () =>
      [...systeme.actions.values()]
        .filter((a) => a.pour.includes(fiche.etat.type))
        .filter((a) => !restriction || restriction.includes(a.id))
        .map((a) => ({
          action: a,
          disponible: conditionRemplie(systeme, fiche, chemins.action(a.id, 'exige')),
        })),
    [systeme, fiche, restriction],
  );

  const [selection, setSelection] = useState<string | undefined>(
    () => actions.find((a) => a.disponible)?.action.id,
  );
  const action = actions.find((a) => a.action.id === selection)?.action;
  const [valeurs, setValeurs] = useState<Record<string, Valeur>>(() =>
    valeursInitiales(systeme, action, fiche),
  );
  const [cibleId, setCibleId] = useState('');
  const [appliquer, setAppliquer] = useState(true);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [dernier, setDernier] = useState<{ jet: JetAffiche; cible?: string } | null>(null);

  const choisir = (id: string) => {
    const a = systeme.actions.get(id);
    setSelection(id);
    setValeurs(valeursInitiales(systeme, a, fiche));
    const valides = ciblesValides(a);
    setCibleId(valides.length === 1 ? valides[0]!.id : '');
    setErreur(null);
  };

  function ciblesValides(a: Action | undefined): CibleAction[] {
    if (!a?.cible) return [];
    return cibles.filter((c) => {
      const type = c.fiche?.etat.type ?? c.type;
      return type === undefined || a.cible!.includes(type);
    });
  }

  const proposees = ciblesValides(action);
  const cible = proposees.find((c) => c.id === cibleId);
  const visibles = (action?.parametres ?? []).filter((p) =>
    parametreVisible(systeme, action!, p, fiche, cible?.fiche),
  );

  /** Paramètres envoyés : seulement ceux proposés, sans les entrées facultatives omises. */
  const parametres: Record<string, Valeur> = {};
  for (const p of visibles) {
    const v = valeurs[p.id];
    if (v === undefined || (p.type === 'entree' && v === '')) continue;
    parametres[p.id] = v;
  }
  const signature = JSON.stringify(parametres);

  const manques: string[] = [];
  for (const p of visibles) {
    if (p.type === 'entree' && !p.facultatif && !parametres[p.id]) manques.push(p.nom);
    if (p.type === 'attribut' && !parametres[p.id]) manques.push(p.nom);
  }
  if (action?.cible && !cible) manques.push('Cible');

  // Aperçu : l'action exécutée localement avec des dés fictifs, pour lire le pool et les refus
  const apercu = useMemo((): ResultatExecution | null => {
    if (!action || manques.length) return null;
    if (action.cible && !cible?.fiche) return null;
    try {
      return executerAction(systeme, {
        action: action.id,
        acteur: fiche,
        ...(action.cible && cible?.fiche ? { cible: cible.fiche } : {}),
        parametres,
        aleatoire: aleatoireGraine('apercu'),
      });
    } catch {
      return null;
    }
    // Recalcul seulement quand les valeurs envoyées changent (signature)
  }, [systeme, action, fiche, cible, signature, manques.length]);

  const lancer = async () => {
    if (!action) return;
    setEnvoi(true);
    setErreur(null);
    const applique = appliquer && aDesConsequences(action);
    try {
      const r = await executerActionPersonnage(personnageId, action.id, {
        parametres,
        ...(action.cible && cible ? { cibleId: cible.id } : {}),
        ...(applique ? { appliquer: true } : {}),
      });
      setDernier({ jet: { sorte: 'action', resultat: r.resultat, applique }, cible: cible?.nom });
      if (r.personnage) onApplique?.(r.personnage, r.cible);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setEnvoi(false);
    }
  };

  if (actions.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-800 px-4 py-6 text-center text-sm text-zinc-500">
        Aucune action disponible pour ce type d’entité.
      </p>
    );
  }

  return (
    <div className={cn('grid gap-4 md:grid-cols-[13rem_minmax(0,1fr)]', className)}>
      <nav aria-label="Actions" className="flex flex-col gap-1">
        {actions
          .filter((x) => x.disponible)
          .map(({ action: a }) => (
            <BoutonAction
              key={a.id}
              action={a}
              disponible
              choisie={a.id === selection}
              accent={accent}
              onChoisir={() => choisir(a.id)}
            />
          ))}
        {actions.some((x) => !x.disponible) && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none px-1 py-1 text-xs text-zinc-500 hover:text-zinc-300">
              {actions.filter((x) => !x.disponible).length} action(s) indisponible(s)
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              {actions
                .filter((x) => !x.disponible)
                .map(({ action: a }) => (
                  <BoutonAction
                    key={a.id}
                    action={a}
                    disponible={false}
                    choisie={false}
                    accent={accent}
                    exige={systeme.formules.get(chemins.action(a.id, 'exige'))?.texte}
                    onChoisir={() => choisir(a.id)}
                  />
                ))}
            </div>
          </details>
        )}
      </nav>

      {action ? (
        <div className="min-w-0 space-y-4">
          <header className="space-y-1">
            <h3 className="font-semibold text-white">{action.nom}</h3>
            {action.description && (
              <p className="line-clamp-3 text-sm text-zinc-400" title={action.description}>
                {action.description}
              </p>
            )}
          </header>

          {action.cible && (
            <Champ libelle="Cible" icone={<Crosshair className="h-3.5 w-3.5" />}>
              {proposees.length ? (
                <select
                  value={cibleId}
                  onChange={(e) => setCibleId(e.target.value)}
                  className={styleSelect}
                >
                  <option value="">Choisir une cible…</option>
                  {proposees.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-zinc-500">Aucune cible disponible.</p>
              )}
            </Champ>
          )}

          <Parametres
            systeme={systeme}
            fiche={fiche}
            parametres={visibles.filter((p) => p.par !== 'cible')}
            valeurs={valeurs}
            onChange={(id, v) => setValeurs((x) => ({ ...x, [id]: v }))}
          />

          {visibles.some((p) => p.par === 'cible') && (
            <fieldset className="space-y-3 rounded-lg border border-zinc-800 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Réaction de la cible
              </legend>
              <Parametres
                systeme={systeme}
                fiche={cible?.fiche ?? fiche}
                parametres={visibles.filter((p) => p.par === 'cible')}
                valeurs={valeurs}
                onChange={(id, v) => setValeurs((x) => ({ ...x, [id]: v }))}
              />
            </fieldset>
          )}

          <Apercu
            action={action}
            apercu={apercu}
            systeme={systeme}
            presentation={presentation}
            sansCible={!!action.cible && !!cible && !cible.fiche}
          />

          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            {aDesConsequences(action) && (
              <Interrupteur
                actif={appliquer}
                onChange={setAppliquer}
                label="Appliquer les conséquences"
                description="Le serveur tire le jet et applique ses conséquences en une fois. Sinon, le résultat est seulement affiché."
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Bouton
                onClick={lancer}
                chargement={envoi}
                disabled={manques.length > 0}
                style={{ backgroundColor: accent, color: texteSur(accent) }}
              >
                <Dices />
                Lancer
              </Bouton>
              {manques.length > 0 && (
                <span className="text-xs text-zinc-500">À choisir : {manques.join(', ')}</span>
              )}
            </div>
          </div>

          {erreur && <Message>{erreur}</Message>}

          {dernier &&
            dernier.jet.sorte === 'action' &&
            dernier.jet.resultat.action === action.id && (
              <ResultatJet
                jet={dernier.jet}
                systeme={systeme}
                presentation={presentation}
                noms={{ acteur: nom, cible: dernier.cible }}
              />
            )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Choisissez une action.</p>
      )}
    </div>
  );
}

function BoutonAction({
  action,
  disponible,
  choisie,
  accent,
  exige,
  onChoisir,
}: {
  action: Action;
  disponible: boolean;
  choisie: boolean;
  accent: string;
  /** Condition non remplie, affichée au survol. */
  exige?: string;
  onChoisir(): void;
}) {
  return (
    <button
      type="button"
      disabled={!disponible}
      onClick={onChoisir}
      title={disponible ? action.description : `Condition non remplie : ${exige ?? ''}`}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        choisie
          ? 'text-white'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700',
        !disponible && 'cursor-not-allowed opacity-40 hover:border-zinc-800',
      )}
      style={choisie ? { borderColor: accent, backgroundColor: attenuer(accent, 12) } : undefined}
    >
      {!disponible ? (
        <Ban className="h-4 w-4 shrink-0 text-zinc-500" />
      ) : action.cible ? (
        <Swords className="h-4 w-4 shrink-0 text-zinc-500" />
      ) : (
        <Dices className="h-4 w-4 shrink-0 text-zinc-500" />
      )}
      <span className="min-w-0 truncate">{action.nom}</span>
    </button>
  );
}

function aDesConsequences(action: Action): boolean {
  return action.consequences.length > 0 || action.tables.length > 0;
}

// ─── Formulaire des paramètres ───────────────────────────────────────────────

const styleSelect = cn(
  'h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 text-sm text-white',
  'focus-visible:border-[#c9a965] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a965]/40',
);

function Champ({
  libelle,
  icone,
  children,
}: {
  libelle: string;
  icone?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-sm text-zinc-300">
        {icone}
        {libelle}
      </span>
      {children}
    </label>
  );
}

function Parametres({
  systeme,
  fiche,
  parametres,
  valeurs,
  onChange,
}: {
  systeme: SystemeCharge;
  fiche: Fiche;
  parametres: Parametre[];
  valeurs: Record<string, Valeur>;
  onChange(id: string, v: Valeur): void;
}) {
  if (!parametres.length) return null;
  const booleens = parametres.filter((p) => p.type === 'booleen');
  const autres = parametres.filter((p) => p.type !== 'booleen');
  return (
    <div className="space-y-3">
      {autres.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {autres.map((p) => (
            <ChampParametre
              key={p.id}
              systeme={systeme}
              fiche={fiche}
              p={p}
              valeur={valeurs[p.id]}
              onChange={(v) => onChange(p.id, v)}
            />
          ))}
        </div>
      )}
      {booleens.map((p) => (
        <Interrupteur
          key={p.id}
          actif={valeurs[p.id] === true}
          onChange={(v) => onChange(p.id, v)}
          label={p.nom}
        />
      ))}
    </div>
  );
}

function ChampParametre({
  systeme,
  fiche,
  p,
  valeur,
  onChange,
}: {
  systeme: SystemeCharge;
  fiche: Fiche;
  p: Exclude<Parametre, { type: 'booleen' }>;
  valeur: Valeur | undefined;
  onChange(v: Valeur): void;
}) {
  if (p.type === 'nombre') {
    return (
      <Champ libelle={p.nom}>
        <Input
          type="number"
          step={1}
          value={typeof valeur === 'number' ? valeur : p.defaut}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            onChange(Number.isFinite(n) ? n : p.defaut);
          }}
          className={styleChamp}
        />
      </Champ>
    );
  }
  if (p.type === 'attribut') {
    const options = optionsAttribut(fiche, p);
    return (
      <Champ libelle={p.nom}>
        <select
          value={String(valeur ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={styleSelect}
        >
          {options.map((o) => (
            <option key={o.cle} value={o.cle}>
              {o.nom} ({String(o.valeur)})
            </option>
          ))}
        </select>
      </Champ>
    );
  }
  const options = optionsEntree(systeme, fiche, p);
  const possedees = options.filter((o) => o.possedee);
  const autres = options.filter((o) => !o.possedee);
  const aRangs = !!systeme.sortes.get(p.sorte)?.rangs;
  const libelle = (o: OptionEntree) => (aRangs ? `${o.nom} (${o.rang})` : o.nom);
  const sorte = systeme.sortes.get(p.sorte);
  return (
    <Champ libelle={p.nom}>
      <select
        value={String(valeur ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={styleSelect}
      >
        <option value="">{p.facultatif ? 'Aucune' : `Choisir : ${sorte?.nom ?? p.sorte}…`}</option>
        {autres.length > 0 && possedees.length > 0 ? (
          <>
            <optgroup label="Possédées">
              {possedees.map((o) => (
                <option key={o.id} value={o.id}>
                  {libelle(o)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Autres">
              {autres.map((o) => (
                <option key={o.id} value={o.id}>
                  {libelle(o)}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          options.map((o) => (
            <option key={o.id} value={o.id}>
              {libelle(o)}
            </option>
          ))
        )}
      </select>
      {options.length === 0 && (
        <span className="text-xs text-zinc-500">
          Aucune entrée « {sorte?.nomPluriel ?? sorte?.nom ?? p.sorte} » disponible.
        </span>
      )}
    </Champ>
  );
}

// ─── Aperçu du jet ───────────────────────────────────────────────────────────

function Apercu({
  action,
  apercu,
  systeme,
  presentation,
  sansCible,
}: {
  action: Action;
  apercu: ResultatExecution | null;
  systeme: SystemeCharge;
  presentation?: Presentation | null;
  sansCible: boolean;
}) {
  const refus = apercu && !apercu.ok ? apercu.erreurs : [];
  const jet = apercu?.ok ? apercu.resultat.jet : null;
  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Aperçu du jet
      </h4>
      {jet?.type === 'symboles' && (
        <>
          <ApercuPool pool={jet.pool} systeme={systeme} presentation={presentation} />
          <EtapesEffets etapes={jet.construction} systeme={systeme} presentation={presentation} />
        </>
      )}
      {jet?.type === 'numerique' && (
        <div className="space-y-1 text-sm">
          <p className="break-words font-mono text-xs text-zinc-300">
            {action.jet.type === 'numerique' && action.jet.formule}
          </p>
          {jet.bonus.map((b, i) => (
            <p key={i} className="text-xs text-zinc-400">
              {b.nom} : {b.valeur >= 0 ? `+ ${b.valeur}` : `− ${-b.valeur}`}
            </p>
          ))}
        </div>
      )}
      {!apercu && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Info className="h-3.5 w-3.5" />
          {sansCible
            ? 'Aperçu indisponible : la fiche de la cible n’est pas chargée.'
            : 'Complétez les paramètres pour voir le jet.'}
        </p>
      )}
      {refus.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-300">
          {refus.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pool en glyphes de la présentation (dé de base / dé amélioré), sinon en formes de dé. */
export function ApercuPool({
  pool,
  systeme,
  presentation,
}: {
  pool: Pool;
  systeme: SystemeCharge;
  presentation?: Presentation | null;
}) {
  const glyphes = presentation?.des?.glyphes;
  const ameliores = useMemo(() => sortesAmeliorees(systeme), [systeme]);
  if (!pool.length) return <p className="text-sm text-zinc-500">Aucun dé</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {pool.map((p) => {
        const a = apparenceSorte(p.de, systeme, presentation);
        return (
          <span
            key={p.de}
            className="inline-flex items-center gap-1.5"
            title={`${p.nombre} × ${a.nom}`}
          >
            {glyphes ? (
              <span className="text-lg leading-none tracking-tight" style={{ color: a.couleur }}>
                {(ameliores.has(p.de) ? glyphes.ameliore : glyphes.base).repeat(p.nombre)}
              </span>
            ) : (
              Array.from({ length: p.nombre }, (_, i) => (
                <DeForme key={i} forme={a.forme} couleur={a.couleur} taille={18} plein />
              ))
            )}
            <span className="text-xs text-zinc-400">{a.court}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Dés ajoutés, améliorés ou retirés par les possessions (talents, équipement…). */
function EtapesEffets({
  etapes,
  systeme,
  presentation,
}: {
  etapes: EtapePool[];
  systeme: SystemeCharge;
  presentation?: Presentation | null;
}) {
  const effets = etapes.filter((e) => e.source !== 'action' && e.nombre > 0);
  if (!effets.length) return null;
  const nom = (de: string) => apparenceSorte(de, systeme, presentation).court;
  return (
    <ul className="space-y-0.5 text-xs text-zinc-500">
      {effets.map((e, i) => (
        <li key={i}>
          {e.nom} :{' '}
          {e.operation === 'ajouter'
            ? `+ ${e.nombre} ${nom(e.de)}`
            : e.operation === 'retirer'
              ? `− ${e.nombre} ${nom(e.de)}`
              : `${e.nombre} ${nom(e.de)} → ${nom(e.vers ?? e.de)}`}
        </li>
      ))}
    </ul>
  );
}
