'use client';

/**
 * Écran 1 du menu d'attaque (docs/combat.md § 12.1) : ce qui part au clic.
 *
 * - Plusieurs actions : une rangée d'onglets (l'action retenue, puis les autres), sans étape.
 * - Action dont l'arme se choisit après le jet (D&D, Nooblies) : de grandes cartes, une par type
 *   d'attaque (« Contact », « Distance », « Magie », nom complet) avec son jet (« 1d20 + 5 ») ;
 *   un clic lance. Une option à paramètres propres (« Libre » : dés, faces, modificateur) se
 *   déplie, puis se lance.
 * - Autre action (Star Wars…) : l'arme en tuiles, les choix, le pool ; « Lancer » au pied.
 * - « Situation et options » replié (fermé) : options de l'action, situation du combat, mode de
 *   jet, jet caché (MJ), ajustements libres ; une pastille dit combien sont réglés.
 *
 * Les compteurs forcés sont les ajustements libres de la déclaration (`adjustments`) : hors
 * règles, appliqués après les effets et marqués « ajusté à la main » dans le rapport.
 */
import { useTranslations } from 'next-intl';
import type { AttackRollMode } from '@vtt/contracts';
import type { Action, Fiche, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { ChevronDown, Crosshair, Dices, RotateCcw, SlidersHorizontal, Target } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Fragment, useEffect, useRef, useState } from 'react';
import { EtatVide } from '@/components/commun/page';
import { Message } from '@/components/compte/elements';
import { FOCUS } from '@/components/des/tactile';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { poolCounts, previewRoll, type ActionGroup, type RollPreview } from '@/lib/combat/actions';
import { hasAdjustments, type AttackDraft } from '@/lib/combat/attack-flow';
import { attackMenu } from '@/lib/combat/attack-menu-store';
import {
  attackerParams,
  attributeOptions,
  choiceOptions,
  defaultParamValue,
  isChoiceParam,
  paramDescription,
  paramSection,
  typeCardParam,
  type ActionParam,
} from '@/lib/combat/params';
import { cn } from '@/lib/utils';
import { HintIcon, SectionTitle, Segmented, Stepper, ToggleTile } from './controls';
import { LaunchButton, Stagger, TypeCard } from './launch';
import { hasSituation, SituationBlock } from './situation-block';
import type { AttackContext } from './use-attack-context';
import type { AttackModel } from './use-attack-model';
import { EntryPicker } from './weapon-cards';

interface TypeOption {
  valeur: string;
  nom: string;
  parametres: string[];
}

function typeOptions(fiche: Fiche, param: ActionParam): TypeOption[] {
  return param.type === 'attribut'
    ? attributeOptions(fiche, param).map((cle) => ({
        valeur: cle,
        nom: fiche.entite.attributs.get(cle)?.nom ?? cle,
        parametres: [],
      }))
    : choiceOptions(param).map((o) => ({ ...o, parametres: o.parametres ?? [] }));
}

const setParam = (id: string, value: Valeur) =>
  attackMenu.dispatch({ type: 'setParam', id, value });

/** Cartes du type d'attaque, saisie bloquée (envoi, déclaration), et ce qui empêche de lancer. */
function composeState(model: AttackModel, systeme: SystemeCharge, fiche: Fiche) {
  const action = model.action;
  return {
    card: action ? typeCardParam(systeme, action, fiche) : null,
    disabled: model.busy || !model.composing,
    reason: !model.busy ? model.disabledReason : null,
  };
}

export function StepCompose({
  ctx,
  model,
  draft,
  error,
  canAim,
  onAim,
}: Readonly<{
  ctx: AttackContext;
  model: AttackModel;
  draft: AttackDraft;
  /** Refus de la dernière déclaration. */
  error: string | null;
  canAim: boolean;
  onAim: () => void;
}>) {
  const t = useTranslations();
  const { systeme, fiche, action } = model;
  const presentation = ctx.presentation;
  if (!systeme || !fiche) return null;
  if (!model.groups.length)
    return (
      <EtatVide
        icone={Target}
        titre={t('combat.attack.noAction')}
        className="mx-auto max-w-md py-10"
      />
    );

  const { card, disabled, reason } = composeState(model, systeme, fiche);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      {model.actions.length > 1 && (
        <ActionTabs
          groups={model.groups}
          selected={action}
          numbered={!card}
          onChoose={model.choose}
          disabled={disabled}
        />
      )}

      {reason && (
        <Notice
          reason={reason}
          aim={canAim && !draft.targetIds.length && !model.blocked ? onAim : null}
          noTarget={!draft.targetIds.length && !model.blocked}
        />
      )}
      {error && <Message>{error}</Message>}

      {action && card && (
        <TypeCards
          systeme={systeme}
          fiche={fiche}
          action={action}
          param={card}
          values={draft.params}
          onLaunch={(patch) => void model.submit(patch)}
          disabled={disabled || Boolean(model.disabledReason)}
        />
      )}
      {action && !card && (
        <GenericBody
          systeme={systeme}
          presentation={presentation}
          fiche={fiche}
          action={action}
          draft={draft}
          preview={model.preview}
          disabled={disabled}
        />
      )}

      {action && (
        <OptionsDisclosure
          ctx={ctx}
          systeme={systeme}
          presentation={presentation}
          fiche={fiche}
          action={action}
          card={card}
          draft={draft}
          preview={model.preview}
          rollMode={model.rollMode}
          actionRollMode={model.multi.rollMode}
          hidden={model.hidden}
          disabled={disabled}
        />
      )}
    </div>
  );
}

// ─── Onglets des actions ─────────────────────────────────────────────────────

function ActionTabs({
  groups,
  selected,
  numbered,
  onChoose,
  disabled,
}: Readonly<{
  groups: readonly ActionGroup[];
  selected: Action | null;
  /** Touches 1 à 9 sur les onglets (pas de cartes à lancer sur cet écran). */
  numbered: boolean;
  onChoose: (a: Action) => void;
  disabled: boolean;
}>) {
  const t = useTranslations();
  let index = 0;
  return (
    <div className="flex items-start gap-2">
      <div
        role="tablist"
        aria-label={t('combat.stages.action')}
        className="flex min-w-0 flex-1 flex-wrap gap-1.5"
      >
        {groups.map((g, gi) => (
          <Fragment key={g.id}>
            {gi > 0 && <span aria-hidden className="mx-1 my-1.5 w-px self-stretch bg-border" />}
            {g.actions.map((a) => {
              const i = index++;
              const on = a.id === selected?.id;
              const shortcut = numbered && i < 9 ? i + 1 : null;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  data-shortcut={shortcut ?? undefined}
                  aria-keyshortcuts={shortcut ? String(shortcut) : undefined}
                  disabled={disabled}
                  onClick={() => !on && onChoose(a)}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors max-sm:min-h-11',
                    'disabled:opacity-50',
                    FOCUS,
                    on
                      ? 'border-primary/60 bg-primary/15 font-medium text-primary-strong'
                      : 'border-border-strong text-muted-foreground hover:border-primary/30 hover:text-foreground',
                  )}
                >
                  {a.nom}
                  {shortcut && (
                    <Kbd aria-hidden className="max-sm:hidden">
                      {shortcut}
                    </Kbd>
                  )}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      {selected?.description && (
        <span className="pt-2">
          <HintIcon text={selected.description} />
        </span>
      )}
    </div>
  );
}

/** Pourquoi rien ne part (pas de cible, pas son tour…), et de quoi y remédier. */
function Notice({
  reason,
  aim,
  noTarget,
}: Readonly<{
  reason: string;
  aim: (() => void) | null;
  noTarget: boolean;
}>) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-border-strong px-3 py-2 text-[13px] text-muted-foreground"
    >
      <span className="flex items-center gap-2">
        {noTarget && <Crosshair className="size-4 text-destructive" aria-hidden />}
        {reason}
      </span>
      {aim && (
        <Button size="xs" variant="secondary" onClick={aim}>
          <Crosshair /> Viser sur la carte
          <Kbd className="ml-0.5">V</Kbd>
        </Button>
      )}
    </div>
  );
}

// ─── Cartes du type d'attaque ────────────────────────────────────────────────

const GRID_COLS: Record<number, string> = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
};

function TypeCards({
  systeme,
  fiche,
  action,
  param,
  values,
  onLaunch,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  fiche: Fiche;
  action: Action;
  param: ActionParam;
  values: Record<string, Valeur>;
  onLaunch: (patch: Record<string, Valeur>) => void;
  disabled: boolean;
}>) {
  const t = useTranslations();
  const reduced = useReducedMotion();
  const options = typeOptions(fiche, param);
  const current = String(values[param.id] ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const launchRef = useRef<HTMLButtonElement>(null);
  const expanded = options.find((o) => o.valeur === open && o.parametres.length) ?? null;
  const own = expanded
    ? attackerParams(systeme, action, fiche).filter((p) => expanded.parametres.includes(p.id))
    : [];
  const formula = (v: string) => {
    const p = previewRoll(systeme, action, fiche, { ...values, [param.id]: v });
    return p?.kind === 'numeric' ? p.formula : null;
  };

  // Option dépliée : le focus sur « Lancer » (Entrée lance)
  useEffect(() => {
    if (expanded) launchRef.current?.focus({ preventScroll: true });
  }, [expanded]);

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'grid grid-cols-2 gap-3 sm:gap-4',
          GRID_COLS[Math.min(options.length, 4)] ?? 'lg:grid-cols-4',
        )}
      >
        {options.map((o, i) => (
          <Stagger key={o.valeur} index={i}>
            <TypeCard
              title={o.nom}
              formula={formula(o.valeur)}
              shortcut={i < 9 ? i + 1 : null}
              active={o.valeur === current && !expanded}
              expanded={o.parametres.length ? expanded?.valeur === o.valeur : undefined}
              disabled={disabled}
              onClick={() => {
                if (o.parametres.length) {
                  setParam(param.id, o.valeur);
                  setOpen((x) => (x === o.valeur ? null : o.valeur));
                } else onLaunch({ [param.id]: o.valeur });
              }}
            />
          </Stagger>
        ))}
      </div>
      <AnimatePresence initial={false}>
        {expanded && own.length > 0 && (
          <motion.div
            key={expanded.valeur}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-card p-3 shadow-surface sm:flex-row sm:items-center sm:p-4"
          >
            <div className="grid flex-1 gap-2 sm:grid-cols-3">
              {own.map((p) => (
                <Stepper
                  key={p.id}
                  label={p.nom}
                  value={typeof values[p.id] === 'number' ? (values[p.id] as number) : 0}
                  onChange={(v) => setParam(p.id, v)}
                  disabled={disabled}
                  hint={paramDescription(p)}
                />
              ))}
            </div>
            <LaunchButton
              ref={launchRef}
              size="lg"
              disabled={disabled}
              onClick={() => onLaunch({ [param.id]: expanded.valeur })}
            >
              <span className="font-mono normal-case tracking-normal">
                {formula(expanded.valeur) ?? t('combat.attack.roll')}
              </span>
            </LaunchButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Autre action : arme en tuiles, choix, pool ──────────────────────────────

function GenericBody({
  systeme,
  presentation,
  fiche,
  action,
  draft,
  preview,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  draft: AttackDraft;
  preview: RollPreview | null;
  disabled: boolean;
}>) {
  const main = attackerParams(systeme, action, fiche).filter(
    (p) => paramSection(p) !== 'situation',
  );
  const entries = main.filter((p) => p.type === 'entree');
  const choices = main.filter((p) => p.type === 'attribut' || isChoiceParam(p));
  const values = draft.params;
  return (
    <div className="space-y-6">
      {entries.map((p) =>
        p.type === 'entree' ? (
          <EntryPicker
            key={p.id}
            systeme={systeme}
            presentation={presentation}
            fiche={fiche}
            action={action}
            param={p}
            value={String(values[p.id] ?? '')}
            onChange={(v) => setParam(p.id, v)}
            disabled={disabled}
          />
        ) : null,
      )}
      {choices.map((p) => (
        <ChoiceField key={p.id} fiche={fiche} param={p} values={values} disabled={disabled} />
      ))}
      {action.jet.type !== 'numerique' && (
        <DicePool
          systeme={systeme}
          presentation={presentation}
          action={action}
          preview={preview}
          draft={draft}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function ChoiceField({
  fiche,
  param: p,
  values,
  disabled,
}: Readonly<{
  fiche: Fiche;
  param: ActionParam;
  values: Record<string, Valeur>;
  disabled: boolean;
}>) {
  return (
    <section>
      <SectionTitle hint={paramDescription(p)}>{p.nom}</SectionTitle>
      <Segmented
        label={p.nom}
        value={String(values[p.id] ?? '')}
        onChange={(v) => setParam(p.id, v)}
        disabled={disabled}
        options={
          p.type === 'attribut'
            ? attributeOptions(fiche, p).map((cle) => {
                const m = fiche.valeurs.get(cle)?.modificateur;
                return {
                  value: cle,
                  label: fiche.entite.attributs.get(cle)?.nom ?? cle,
                  meta: m === undefined ? undefined : signe(m),
                };
              })
            : choiceOptions(p).map((o) => ({ value: o.valeur, label: o.nom, hint: o.description }))
        }
      />
    </section>
  );
}

// ─── Situation et options (replié) ───────────────────────────────────────────

/** Nombre de réglages qui s'écartent du défaut (pastille du bouton replié). */
function changedCount(
  fiche: Fiche,
  action: Action,
  params: readonly ActionParam[],
  draft: AttackDraft,
): number {
  let n = hasAdjustments(draft.adjustments) ? 1 : 0;
  for (const p of params) {
    const v = draft.params[p.id];
    if (v !== undefined && v !== defaultParamValue(fiche, p, action)) n++;
  }
  return n;
}

/** Pastilles du bouton replié : réglages modifiés, jet caché. */
function DisclosureBadges({ count, hidden }: Readonly<{ count: number; hidden: boolean }>) {
  const t = useTranslations();
  return (
    <>
      {count > 0 && (
        <Badge ton="primaire" aria-label={t('combat.attack.setCount', { count })}>
          {count}
        </Badge>
      )}
      {hidden && <Badge>{t('combat.attack.hiddenShort')}</Badge>}
    </>
  );
}

/** Mode de jet (plusieurs cibles) et jet caché aux joueurs (MJ). */
function RollModeRow({
  targets,
  gm,
  rollMode,
  actionRollMode,
  hidden,
  disabled,
}: Readonly<{
  targets: number;
  gm: boolean;
  rollMode: AttackRollMode;
  actionRollMode: AttackRollMode;
  hidden: boolean;
  disabled: boolean;
}>) {
  const t = useTranslations();
  if (!(targets > 1 || gm)) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {targets > 1 && (
        <Segmented
          label={t('combat.attack.rollMode')}
          value={rollMode}
          onChange={(v) =>
            attackMenu.dispatch({ type: 'setRollMode', rollMode: v as AttackRollMode })
          }
          disabled={disabled}
          options={(
            [
              ['per_target', t('combat.attack.rollPerTarget')],
              ['shared', t('combat.attack.rollShared')],
            ] as const
          ).map(([value, label]) => ({
            value,
            label,
            ...(actionRollMode === value ? { meta: t('combat.attack.suggested') } : {}),
          }))}
        />
      )}
      {gm && (
        <div className="min-w-[14rem]">
          <ToggleTile
            label={t('combat.attack.hiddenRoll')}
            checked={hidden}
            onChange={(h) =>
              attackMenu.dispatch({
                type: 'setVisibility',
                visibility: h ? 'gm' : 'public',
              })
            }
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

function OptionsDisclosure({
  ctx,
  systeme,
  presentation,
  fiche,
  action,
  card,
  draft,
  preview,
  rollMode,
  actionRollMode,
  hidden,
  disabled,
}: Readonly<{
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  card: ActionParam | null;
  draft: AttackDraft;
  preview: RollPreview | null;
  rollMode: AttackRollMode;
  actionRollMode: AttackRollMode;
  hidden: boolean;
  disabled: boolean;
}>) {
  const t = useTranslations();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const params = attackerParams(systeme, action, fiche);
  const situation = params.filter((p) => paramSection(p) === 'situation');
  // Paramètres propres aux options des cartes (dés du jet « Libre ») : avec leur carte
  const own = new Set(card ? choiceOptions(card).flatMap((o) => o.parametres ?? []) : []);
  const options = params.filter(
    (p) =>
      paramSection(p) !== 'situation' &&
      p !== card &&
      !own.has(p.id) &&
      (p.type === 'booleen' || p.type === 'nombre' || (card && p.type !== 'entree')),
  );
  const numericJet = action.jet.type === 'numerique';
  const count = changedCount(fiche, action, [...options, ...situation], draft);
  const n = draft.targetIds.length;
  const showSituation = hasSituation(
    ctx,
    systeme,
    action,
    situation,
    draft.attackerId,
    draft.targetIds,
  );
  if (!options.length && !showSituation && n < 2 && !ctx.gm && !numericJet) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface/60">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="attack-options"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex min-h-11 w-full items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground',
          FOCUS,
        )}
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        <span className="flex-1">{t('combat.attack.situationOptions')}</span>
        <DisclosureBadges count={count} hidden={hidden} />
        <ChevronDown
          className={cn(
            'size-4 transition-transform duration-200 motion-reduce:transition-none',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="attack-options"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-5 border-t border-border px-4 pb-4 pt-4"
          >
            {(options.length > 0 || showSituation) && (
              <div
                className={cn(
                  'grid gap-5',
                  options.length > 0 && showSituation && 'lg:grid-cols-2 lg:gap-8',
                )}
              >
                {options.length > 0 && (
                  <OptionsSection
                    fiche={fiche}
                    params={options}
                    values={draft.params}
                    disabled={disabled}
                  />
                )}
                <SituationBlock
                  ctx={ctx}
                  systeme={systeme}
                  action={action}
                  params={situation}
                  values={draft.params}
                  onParam={setParam}
                  attackerId={draft.attackerId}
                  targetIds={draft.targetIds}
                  disabled={disabled}
                />
              </div>
            )}
            <RollModeRow
              targets={n}
              gm={ctx.gm}
              rollMode={rollMode}
              actionRollMode={actionRollMode}
              hidden={hidden}
              disabled={disabled}
            />
            {numericJet && (
              <DicePool
                systeme={systeme}
                presentation={presentation}
                action={action}
                preview={preview}
                draft={draft}
                disabled={disabled}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Options de l'action : bascules, nombres, choix. */
function OptionsSection({
  fiche,
  params,
  values,
  disabled,
}: Readonly<{
  fiche: Fiche;
  params: readonly ActionParam[];
  values: Record<string, Valeur>;
  disabled: boolean;
}>) {
  const t = useTranslations();
  const toggles = params.filter((p) => p.type === 'booleen');
  const numbers = params.filter((p) => p.type === 'nombre');
  const choices = params.filter((p) => p.type === 'attribut' || isChoiceParam(p));
  return (
    <section>
      <SectionTitle icon={<SlidersHorizontal aria-hidden />}>
        {t('combat.attack.options')}
      </SectionTitle>
      <div className="space-y-3">
        {choices.map((p) => (
          <ChoiceField key={p.id} fiche={fiche} param={p} values={values} disabled={disabled} />
        ))}
        {toggles.length > 0 && (
          <div className="grid gap-2">
            {toggles.map((p) => (
              <ToggleTile
                key={p.id}
                label={p.nom}
                checked={values[p.id] === true}
                onChange={(v) => setParam(p.id, v)}
                disabled={disabled}
                hint={paramDescription(p)}
              />
            ))}
          </div>
        )}
        {numbers.map((p) => (
          <Stepper
            key={p.id}
            label={p.nom}
            value={typeof values[p.id] === 'number' ? (values[p.id] as number) : 0}
            onChange={(v) => setParam(p.id, v)}
            disabled={disabled}
            hint={paramDescription(p)}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Pool de dés (ancienne page) : un compteur par dé du système, à la valeur de la fiche ; le
 * changer ajoute ou retire des dés hors règles. Jet numérique : un bonus au total.
 */
function DicePool({
  systeme,
  presentation,
  action,
  preview,
  draft,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  presentation: Presentation | null;
  action: Action;
  preview: RollPreview | null;
  draft: AttackDraft;
  disabled: boolean;
}>) {
  const t = useTranslations();
  const adjustments = draft.adjustments;
  const adjusted = hasAdjustments(adjustments);
  const set = (die: string | null, value: number) =>
    attackMenu.dispatch({ type: 'setAdjustment', die, value });
  const header = (
    <SectionTitle
      icon={<Dices aria-hidden />}
      hint={t('combat.attack.offRules')}
      action={
        adjusted ? (
          <span className="flex items-center gap-2">
            <Badge ton="alerte">{t('combat.attack.adjusted')}</Badge>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => attackMenu.dispatch({ type: 'resetAdjustments' })}
              disabled={disabled}
            >
              <RotateCcw /> Réinitialiser
            </Button>
          </span>
        ) : undefined
      }
    >
      {action.jet.type === 'numerique'
        ? t('combat.attack.totalBonus')
        : t('combat.attack.dicePool')}
    </SectionTitle>
  );

  if (action.jet.type === 'numerique')
    return (
      <section>
        {header}
        <Stepper
          label={t('combat.attack.totalBonus')}
          value={adjustments.bonus}
          display={adjustments.bonus > 0 ? `+${adjustments.bonus}` : String(adjustments.bonus)}
          min={-100}
          max={100}
          marked={adjustments.bonus !== 0}
          onChange={(v) => set(null, v)}
          disabled={disabled}
          className="sm:max-w-sm"
        />
      </section>
    );

  const counts = poolCounts(preview);
  const dice = systeme.source.des?.sortes ?? [];
  if (!dice.length) return null;
  return (
    <section>
      {header}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {dice.map((d) => {
          const look = presentation?.des?.sortes[d.id];
          const auto = counts[d.id] ?? (d.id in counts ? null : 0);
          const delta = adjustments.dice[d.id] ?? 0;
          const known = auto !== null;
          const value = known ? Math.max(0, auto + delta) : delta;
          const display = known ? String(value) : inconnu(delta);
          let hint: string | null = t('combat.attack.dependsOnTarget');
          if (known)
            hint = delta ? t('combat.attack.adjustedHint', { auto, delta: signe(delta) }) : null;
          return (
            <Stepper
              key={d.id}
              label={look?.court ?? d.nom}
              swatch={look?.couleur}
              value={value}
              display={display}
              min={known ? 0 : -20}
              max={20}
              marked={delta !== 0}
              hint={hint}
              onChange={(v) => set(d.id, known ? v - auto : v)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </section>
  );
}

const signe = (n: number) => `${n >= 0 ? '+' : ''}${n}`;

/** Compteur qui dépend de la cible : « ? », ou l'ajustement à la main (« ?+2 », « ?−1 »). */
function inconnu(delta: number): string {
  if (!delta) return '?';
  return `?${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}
