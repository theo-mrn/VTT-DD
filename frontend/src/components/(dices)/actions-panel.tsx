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
import { AppButton, Switch, Message, styleChamp } from '@/components/account/elements';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api';
import { notifyRollsChanged } from '@/lib/dice';
import { runCharacterAction, type RollCharacter } from '@/lib/rolls';
import { cn } from '@/lib/utils';
import {
  presentationAccent,
  kindAppearance,
  dim,
  ShapedDie,
  upgradedKinds,
  textOn,
} from './appearance';
import { RollResult, type DisplayedRoll } from './roll-result';

// ─── Props ───────────────────────────────────────────────────────────────────

/** Cible proposée pour les actions qui en déclarent une. */
export interface ActionTarget {
  /** Identifiant du personnage visé, envoyé au serveur (`cibleId`). */
  id: string;
  name: string;
  /**
   * Fiche calculée de la cible (`calculer(systeme, cible.etat)`) : elle permet
   * l'aperçu du jet et les options de réaction de la cible. Facultative.
   */
  sheet?: Fiche;
  /** Type d'entité, quand la fiche n'est pas fournie (filtre des cibles valides). */
  type?: string;
}

export interface ActionsPanelProps {
  /** Personnage qui agit (route `POST /v1/characters/:id/actions/:action`). */
  characterId: string;
  /** Système chargé (`charger`). */
  system: SystemeCharge;
  /** Présentation vérifiée du système (couleurs des dés, icônes) ; facultative. */
  presentation?: Presentation | null;
  /**
   * Fiche de l'acteur calculée localement (`calculer(systeme, personnage.etat)`) :
   * sert à griser les actions et options indisponibles et à l'aperçu du jet.
   * Le serveur recalcule tout et fait autorité.
   */
  sheet: Fiche;
  /** Nom de l'acteur, affiché dans les conséquences. */
  name?: string;
  /** Cibles possibles ; seules celles du type attendu par l'action sont proposées. */
  targets?: ActionTarget[];
  /** Restreint la liste à ces actions (bloc `actions` de la présentation). */
  actions?: string[];
  /**
   * Appelé quand le serveur a appliqué les conséquences : acteur à jour, et
   * cible à jour si elle a été modifiée.
   */
  onApplied?(character: RollCharacter, target?: RollCharacter): void;
  /** Campagne où le jet apparaît dans l'historique des dés (table de jeu). */
  campaignId?: string;
  className?: string;
}

type Parameter = Action['parametres'][number];

// ─── Règles lues localement ──────────────────────────────────────────────────

/** Condition compilée (`exige`) vraie pour cette fiche ; vraie s'il n'y en a pas. */
function conditionMet(system: SystemeCharge, sheet: Fiche, path: string): boolean {
  const f = system.formules.get(path);
  return !f || sheet.evaluer(f, {}, false) === true;
}

/**
 * Paramètre proposé : une option réservée (`exige`) n'apparaît que si le
 * décideur la remplit. Une réaction de la cible n'est proposée que si sa fiche
 * est connue (ou si elle n'est pas réservée).
 */
function parameterVisible(
  system: SystemeCharge,
  action: Action,
  p: Parameter,
  actor: Fiche,
  target: Fiche | undefined,
): boolean {
  const path = chemins.action(action.id, `parametres/${p.id}/exige`);
  if (p.par === 'cible') {
    if (!action.cible) return false;
    if (!system.formules.has(path)) return true;
    return !!target && conditionMet(system, target, path);
  }
  return conditionMet(system, actor, path);
}

interface EntryOption {
  id: string;
  name: string;
  rank: number;
  owned: boolean;
}

/** Entrées proposées pour un paramètre `entree` (possédées et actives d'abord). */
function entryOptions(
  system: SystemeCharge,
  sheet: Fiche,
  p: Extract<Parameter, { type: 'entree' }>,
): EntryOption[] {
  const options: EntryOption[] = [];
  for (const e of system.entrees.values()) {
    if (e.sorte !== p.sorte) continue;
    if (p.etiquette && !e.etiquettes.includes(p.etiquette)) continue;
    const possession = sheet.possessions.get(e.id);
    if (possession && !possession.actif) continue;
    if (!possession && p.possedee) continue;
    options.push({ id: e.id, name: e.nom, rank: possession?.rang ?? 0, owned: !!possession });
  }
  const tri = (a: EntryOption, b: EntryOption) => a.name.localeCompare(b.name, 'fr');
  return [
    ...options.filter((o) => o.owned).sort(tri),
    ...options.filter((o) => !o.owned).sort(tri),
  ];
}

/** Attributs proposés pour un paramètre `attribut` (liste explicite ou groupe). */
function attributeOptions(sheet: Fiche, p: Extract<Parameter, { type: 'attribut' }>) {
  return [...sheet.entite.attributs.values()]
    .filter(
      (a) => p.attributs?.includes(a.cle) || (p.groupe !== undefined && a.groupe === p.groupe),
    )
    .map((a) => ({ key: a.cle, name: a.nom, value: sheet.valeur(a.cle) }));
}

function initialValues(
  system: SystemeCharge,
  action: Action | undefined,
  sheet: Fiche,
): Record<string, Valeur> {
  const v: Record<string, Valeur> = {};
  for (const p of action?.parametres ?? []) {
    if (p.type === 'nombre' || p.type === 'booleen') v[p.id] = p.defaut;
    else if (p.type === 'attribut') v[p.id] = attributeOptions(sheet, p)[0]?.key ?? '';
    else {
      // Entrée : la première possédée, sinon rien (choix explicite)
      const premiere = entryOptions(system, sheet, p)[0];
      v[p.id] = !p.facultatif && premiere?.owned ? premiere.id : '';
    }
  }
  return v;
}

// ─── Composant ───────────────────────────────────────────────────────────────

export function ActionsPanel({
  characterId,
  system,
  presentation,
  sheet,
  name,
  targets = [],
  actions: restriction,
  onApplied,
  campaignId,
  className,
}: ActionsPanelProps) {
  const accent = presentationAccent(presentation);

  const actions = useMemo(
    () =>
      [...system.actions.values()]
        .filter((a) => a.pour.includes(sheet.etat.type))
        .filter((a) => !restriction || restriction.includes(a.id))
        .map((a) => ({
          action: a,
          available: conditionMet(system, sheet, chemins.action(a.id, 'exige')),
        })),
    [system, sheet, restriction],
  );

  const [selection, setSelection] = useState<string | undefined>(
    () => actions.find((a) => a.available)?.action.id,
  );
  const action = actions.find((a) => a.action.id === selection)?.action;
  const [values, setValues] = useState<Record<string, Valeur>>(() =>
    initialValues(system, action, sheet),
  );
  const [targetId, setTargetId] = useState('');
  const [apply, setApply] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dernier, setDernier] = useState<{ roll: DisplayedRoll; target?: string } | null>(null);

  const choose = (id: string) => {
    const a = system.actions.get(id);
    setSelection(id);
    setValues(initialValues(system, a, sheet));
    const valid = validTargets(a);
    setTargetId(valid.length === 1 ? valid[0]!.id : '');
    setError(null);
  };

  function validTargets(a: Action | undefined): ActionTarget[] {
    if (!a?.cible) return [];
    return targets.filter((c) => {
      const type = c.sheet?.etat.type ?? c.type;
      return type === undefined || a.cible!.includes(type);
    });
  }

  const offered = validTargets(action);
  const target = offered.find((c) => c.id === targetId);
  const visible = (action?.parametres ?? []).filter((p) =>
    parameterVisible(system, action!, p, sheet, target?.sheet),
  );

  /** Paramètres envoyés : seulement ceux proposés, sans les entrées facultatives omises. */
  const parameters: Record<string, Valeur> = {};
  for (const p of visible) {
    const v = values[p.id];
    if (v === undefined || (p.type === 'entree' && v === '')) continue;
    parameters[p.id] = v;
  }
  const signature = JSON.stringify(parameters);

  const missing: string[] = [];
  for (const p of visible) {
    if (p.type === 'entree' && !p.facultatif && !parameters[p.id]) missing.push(p.nom);
    if (p.type === 'attribut' && !parameters[p.id]) missing.push(p.nom);
  }
  if (action?.cible && !target) missing.push('Cible');

  // Aperçu : l'action exécutée localement avec des dés fictifs, pour lire le pool et les refus
  const preview = useMemo((): ResultatExecution | null => {
    if (!action || missing.length) return null;
    if (action.cible && !target?.sheet) return null;
    try {
      return executerAction(system, {
        action: action.id,
        acteur: sheet,
        ...(action.cible && target?.sheet ? { cible: target.sheet } : {}),
        parametres: parameters,
        aleatoire: aleatoireGraine('apercu'),
      });
    } catch {
      return null;
    }
    // Recalcul seulement quand les valeurs envoyées changent (signature)
  }, [system, action, sheet, target, signature, missing.length]);

  const roll = async () => {
    if (!action) return;
    setSending(true);
    setError(null);
    const applied = apply && hasConsequences(action);
    try {
      const r = await runCharacterAction(characterId, action.id, {
        parametres: parameters,
        ...(action.cible && target ? { cibleId: target.id } : {}),
        ...(applied ? { appliquer: true } : {}),
        ...(campaignId ? { campaignId } : {}),
      });
      setDernier({ roll: { kind: 'action', result: r.resultat, applied }, target: target?.name });
      // Character transmet le jet au service des dés : les historiques ouverts se relisent
      notifyRollsChanged();
      if (r.personnage) onApplied?.(r.personnage, r.cible);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSending(false);
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
          .filter((x) => x.available)
          .map(({ action: a }) => (
            <ActionButton
              key={a.id}
              action={a}
              available
              chosen={a.id === selection}
              accent={accent}
              onChoose={() => choose(a.id)}
            />
          ))}
        {actions.some((x) => !x.available) && (
          <details className="group mt-1">
            <summary className="cursor-pointer list-none px-1 py-1 text-xs text-zinc-500 hover:text-zinc-300">
              {actions.filter((x) => !x.available).length} action(s) indisponible(s)
            </summary>
            <div className="mt-1 flex flex-col gap-1">
              {actions
                .filter((x) => !x.available)
                .map(({ action: a }) => (
                  <ActionButton
                    key={a.id}
                    action={a}
                    available={false}
                    chosen={false}
                    accent={accent}
                    requires={system.formules.get(chemins.action(a.id, 'exige'))?.texte}
                    onChoose={() => choose(a.id)}
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
            <Field label="Cible" icon={<Crosshair className="h-3.5 w-3.5" />}>
              {offered.length ? (
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className={styleSelect}
                >
                  <option value="">Choisir une cible…</option>
                  {offered.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-zinc-500">Aucune cible disponible.</p>
              )}
            </Field>
          )}

          <Parameters
            system={system}
            sheet={sheet}
            parameters={visible.filter((p) => p.par !== 'cible')}
            values={values}
            onChange={(id, v) => setValues((x) => ({ ...x, [id]: v }))}
          />

          {visible.some((p) => p.par === 'cible') && (
            <fieldset className="space-y-3 rounded-lg border border-zinc-800 p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Réaction de la cible
              </legend>
              <Parameters
                system={system}
                sheet={target?.sheet ?? sheet}
                parameters={visible.filter((p) => p.par === 'cible')}
                values={values}
                onChange={(id, v) => setValues((x) => ({ ...x, [id]: v }))}
              />
            </fieldset>
          )}

          <Preview
            action={action}
            preview={preview}
            system={system}
            presentation={presentation}
            noTarget={!!action.cible && !!target && !target.sheet}
          />

          <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            {hasConsequences(action) && (
              <Switch
                active={apply}
                onChange={setApply}
                label="Appliquer les conséquences"
                description="Le serveur tire le jet et applique ses conséquences en une fois. Sinon, le résultat est seulement affiché."
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <AppButton
                onClick={roll}
                loading={sending}
                disabled={missing.length > 0}
                style={{ backgroundColor: accent, color: textOn(accent) }}
              >
                <Dices />
                Lancer
              </AppButton>
              {missing.length > 0 && (
                <span className="text-xs text-zinc-500">À choisir : {missing.join(', ')}</span>
              )}
            </div>
          </div>

          {error && <Message>{error}</Message>}

          {dernier &&
            dernier.roll.kind === 'action' &&
            dernier.roll.result.action === action.id && (
              <RollResult
                roll={dernier.roll}
                system={system}
                presentation={presentation}
                names={{ actor: name, target: dernier.target }}
              />
            )}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Choisissez une action.</p>
      )}
    </div>
  );
}

function ActionButton({
  action,
  available,
  chosen,
  accent,
  requires,
  onChoose,
}: {
  action: Action;
  available: boolean;
  chosen: boolean;
  accent: string;
  /** Condition non remplie, affichée au survol. */
  requires?: string;
  onChoose(): void;
}) {
  return (
    <button
      type="button"
      disabled={!available}
      onClick={onChoose}
      title={available ? action.description : `Condition non remplie : ${requires ?? ''}`}
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
        chosen
          ? 'text-white'
          : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700',
        !available && 'cursor-not-allowed opacity-40 hover:border-zinc-800',
      )}
      style={chosen ? { borderColor: accent, backgroundColor: dim(accent, 12) } : undefined}
    >
      {!available ? (
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

function hasConsequences(action: Action): boolean {
  return action.consequences.length > 0 || action.tables.length > 0;
}

// ─── Formulaire des paramètres ───────────────────────────────────────────────

const styleSelect = cn(
  'h-10 w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 text-sm text-white',
  'focus-visible:border-[#c9a965] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#c9a965]/40',
);

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-1.5 text-sm text-zinc-300">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function Parameters({
  system,
  sheet,
  parameters,
  values,
  onChange,
}: {
  system: SystemeCharge;
  sheet: Fiche;
  parameters: Parameter[];
  values: Record<string, Valeur>;
  onChange(id: string, v: Valeur): void;
}) {
  if (!parameters.length) return null;
  const booleans = parameters.filter((p) => p.type === 'booleen');
  const others = parameters.filter((p) => p.type !== 'booleen');
  return (
    <div className="space-y-3">
      {others.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {others.map((p) => (
            <ParameterField
              key={p.id}
              system={system}
              sheet={sheet}
              p={p}
              value={values[p.id]}
              onChange={(v) => onChange(p.id, v)}
            />
          ))}
        </div>
      )}
      {booleans.map((p) => (
        <Switch
          key={p.id}
          active={values[p.id] === true}
          onChange={(v) => onChange(p.id, v)}
          label={p.nom}
        />
      ))}
    </div>
  );
}

function ParameterField({
  system,
  sheet,
  p,
  value,
  onChange,
}: {
  system: SystemeCharge;
  sheet: Fiche;
  p: Exclude<Parameter, { type: 'booleen' }>;
  value: Valeur | undefined;
  onChange(v: Valeur): void;
}) {
  if (p.type === 'nombre') {
    return (
      <Field label={p.nom}>
        <Input
          type="number"
          step={1}
          value={typeof value === 'number' ? value : p.defaut}
          onChange={(e) => {
            const n = e.target.valueAsNumber;
            onChange(Number.isFinite(n) ? n : p.defaut);
          }}
          className={styleChamp}
        />
      </Field>
    );
  }
  if (p.type === 'attribut') {
    const options = attributeOptions(sheet, p);
    return (
      <Field label={p.nom}>
        <select
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={styleSelect}
        >
          {options.map((o) => (
            <option key={o.key} value={o.key}>
              {o.name} ({String(o.value)})
            </option>
          ))}
        </select>
      </Field>
    );
  }
  const options = entryOptions(system, sheet, p);
  const owned = options.filter((o) => o.owned);
  const others = options.filter((o) => !o.owned);
  const hasRanks = !!system.sortes.get(p.sorte)?.rangs;
  const label = (o: EntryOption) => (hasRanks ? `${o.name} (${o.rank})` : o.name);
  const kind = system.sortes.get(p.sorte);
  return (
    <Field label={p.nom}>
      <select
        value={String(value ?? '')}
        onChange={(e) => onChange(e.target.value)}
        className={styleSelect}
      >
        <option value="">{p.facultatif ? 'Aucune' : `Choisir : ${kind?.nom ?? p.sorte}…`}</option>
        {others.length > 0 && owned.length > 0 ? (
          <>
            <optgroup label="Possédées">
              {owned.map((o) => (
                <option key={o.id} value={o.id}>
                  {label(o)}
                </option>
              ))}
            </optgroup>
            <optgroup label="Autres">
              {others.map((o) => (
                <option key={o.id} value={o.id}>
                  {label(o)}
                </option>
              ))}
            </optgroup>
          </>
        ) : (
          options.map((o) => (
            <option key={o.id} value={o.id}>
              {label(o)}
            </option>
          ))
        )}
      </select>
      {options.length === 0 && (
        <span className="text-xs text-zinc-500">
          Aucune entrée « {kind?.nomPluriel ?? kind?.nom ?? p.sorte} » disponible.
        </span>
      )}
    </Field>
  );
}

// ─── Aperçu du jet ───────────────────────────────────────────────────────────

function Preview({
  action,
  preview,
  system,
  presentation,
  noTarget,
}: {
  action: Action;
  preview: ResultatExecution | null;
  system: SystemeCharge;
  presentation?: Presentation | null;
  noTarget: boolean;
}) {
  const reject = preview && !preview.ok ? preview.erreurs : [];
  const roll = preview?.ok ? preview.resultat.jet : null;
  return (
    <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
        Aperçu du jet
      </h4>
      {roll?.type === 'symboles' && (
        <>
          <PoolPreview pool={roll.pool} system={system} presentation={presentation} />
          <EffectSteps steps={roll.construction} system={system} presentation={presentation} />
        </>
      )}
      {roll?.type === 'numerique' && (
        <div className="space-y-1 text-sm">
          <p className="break-words font-mono text-xs text-zinc-300">
            {action.jet.type === 'numerique' && action.jet.formule}
          </p>
          {roll.bonus.map((b, i) => (
            <p key={i} className="text-xs text-zinc-400">
              {b.nom} : {b.valeur >= 0 ? `+ ${b.valeur}` : `− ${-b.valeur}`}
            </p>
          ))}
        </div>
      )}
      {!preview && (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <Info className="h-3.5 w-3.5" />
          {noTarget
            ? 'Aperçu indisponible : la fiche de la cible n’est pas chargée.'
            : 'Complétez les paramètres pour voir le jet.'}
        </p>
      )}
      {reject.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-300">
          {reject.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Pool en glyphes de la présentation (dé de base / dé amélioré), sinon en formes de dé. */
export function PoolPreview({
  pool,
  system,
  presentation,
}: {
  pool: Pool;
  system: SystemeCharge;
  presentation?: Presentation | null;
}) {
  const glyphs = presentation?.des?.glyphes;
  const upgraded = useMemo(() => upgradedKinds(system), [system]);
  if (!pool.length) return <p className="text-sm text-zinc-500">Aucun dé</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {pool.map((p) => {
        const a = kindAppearance(p.de, system, presentation);
        return (
          <span
            key={p.de}
            className="inline-flex items-center gap-1.5"
            title={`${p.nombre} × ${a.name}`}
          >
            {glyphs ? (
              <span className="text-lg leading-none tracking-tight" style={{ color: a.color }}>
                {(upgraded.has(p.de) ? glyphs.ameliore : glyphs.base).repeat(p.nombre)}
              </span>
            ) : (
              Array.from({ length: p.nombre }, (_, i) => (
                <ShapedDie key={i} shape={a.shape} color={a.color} size={18} filled />
              ))
            )}
            <span className="text-xs text-zinc-400">{a.short}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Dés ajoutés, améliorés ou retirés par les possessions (talents, équipement…). */
function EffectSteps({
  steps,
  system,
  presentation,
}: {
  steps: EtapePool[];
  system: SystemeCharge;
  presentation?: Presentation | null;
}) {
  const effects = steps.filter((e) => e.source !== 'action' && e.nombre > 0);
  if (!effects.length) return null;
  const name = (die: string) => kindAppearance(die, system, presentation).short;
  return (
    <ul className="space-y-0.5 text-xs text-zinc-500">
      {effects.map((e, i) => (
        <li key={i}>
          {e.nom} :{' '}
          {e.operation === 'ajouter'
            ? `+ ${e.nombre} ${name(e.de)}`
            : e.operation === 'retirer'
              ? `− ${e.nombre} ${name(e.de)}`
              : `${e.nombre} ${name(e.de)} → ${name(e.vers ?? e.de)}`}
        </li>
      ))}
    </ul>
  );
}
