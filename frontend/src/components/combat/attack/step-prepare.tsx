'use client';

/**
 * Étape « Préparer » du menu d'attaque (docs/combat.md § 12.1, 2) : l'action choisie, ses
 * cartes d'arme et ses autres paramètres, les compteurs du pool (un par dé du système, la
 * valeur de la fiche, un point sur une valeur forcée, « Réinitialiser »), puis à côté la
 * situation, le mode de jet, « caché » pour le MJ et l'aperçu. Le grand bouton « Lancer
 * l'attaque » est au pied de la fenêtre (Entrée).
 *
 * Les compteurs forcés sont les ajustements libres de la déclaration (`adjustments`) : hors
 * règles, appliqués après les effets et marqués « ajusté à la main » dans le rapport.
 */
import type { AttackRollMode } from '@vtt/contracts';
import type { Action, Fiche, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import {
  ChevronDown,
  Dices,
  Info,
  RotateCcw,
  SlidersHorizontal,
  Swords,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  multitargetOf,
  poolCounts,
  previewRoll,
  type ActionGroup,
  type RollPreview,
} from '@/lib/combat/actions';
import { hasAdjustments, type FreeAdjustments } from '@/lib/combat/attack-flow';
import {
  attackerParams,
  attributeOptions,
  choiceOptions,
  isAfterRoll,
  isChoiceParam,
  paramDescription,
  paramSection,
  type ActionParam,
} from '@/lib/combat/params';
import { cn } from '@/lib/utils';
import { SectionTitle, Segmented, Stepper, ToggleTile } from './controls';
import { PreviewBox } from './preview';
import { SituationBlock } from './situation-block';
import type { AttackContext } from './use-attack-context';
import { EntryPicker } from './weapon-cards';

export function StepPrepare({
  ctx,
  systeme,
  presentation,
  fiche,
  action,
  groups,
  values,
  onParam,
  attackerId,
  targetIds,
  preview,
  adjustments,
  onAdjustment,
  onResetAdjustments,
  rollMode,
  actionRollMode,
  onRollMode,
  hidden,
  onHidden,
  canChangeAction,
  onChangeAction,
  onLaunch,
  disabled,
}: {
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  action: Action;
  groups: readonly ActionGroup[];
  values: Record<string, Valeur>;
  onParam: (id: string, v: Valeur) => void;
  attackerId: string | null;
  targetIds: readonly string[];
  preview: RollPreview | null;
  adjustments: FreeAdjustments;
  onAdjustment: (die: string | null, value: number) => void;
  onResetAdjustments: () => void;
  rollMode: AttackRollMode;
  actionRollMode: AttackRollMode;
  onRollMode: (m: AttackRollMode) => void;
  hidden: boolean;
  onHidden: (h: boolean) => void;
  canChangeAction: boolean;
  onChangeAction: () => void;
  /** Lance l'attaque avec ces valeurs (clic sur une carte du type d'attaque). */
  onLaunch: (patch: Record<string, Valeur>) => void;
  disabled?: boolean;
}) {
  const params = attackerParams(systeme, action, fiche);
  const situation = params.filter((p) => paramSection(p) === 'situation');
  const main = params.filter((p) => paramSection(p) !== 'situation');
  const entries = main.filter((p) => p.type === 'entree');
  const options = main.filter((p) => p.type !== 'entree');
  const group = groups.find((g) => g.actions.some((a) => a.id === action.id));

  // Action dont l'arme se choisit après le jet : de grandes cartes, une par type d'attaque ;
  // le reste (situation, options, bonus au total) replié
  const card = action.parametres.some(isAfterRoll)
    ? main.find((p) => p.type === 'attribut' || isChoiceParam(p))
    : undefined;
  if (card) {
    const own = new Set(choiceOptions(card).flatMap((o) => o.parametres ?? []));
    const rest = options.filter((p) => p !== card && !own.has(p.id));
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl font-semibold">{action.nom}</h3>
          {action.description && (
            <Info className="size-4 text-subtle" aria-label={action.description}>
              <title>{action.description}</title>
            </Info>
          )}
          {canChangeAction && (
            <Button variant="ghost" size="sm" onClick={onChangeAction} className="ml-auto">
              Changer d’action
            </Button>
          )}
        </div>
        <AttackCards
          systeme={systeme}
          fiche={fiche}
          action={action}
          param={card}
          params={main}
          values={values}
          onParam={onParam}
          onLaunch={onLaunch}
          disabled={disabled}
        />
        <details className="group rounded-2xl border border-border bg-surface/60">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] font-medium text-muted-foreground hover:text-foreground">
            <ChevronDown
              className="size-4 transition-transform group-open:rotate-180"
              aria-hidden
            />
            Situation et options
          </summary>
          <div className="space-y-5 px-4 pb-4">
            {rest.length > 0 && (
              <OptionsSection
                fiche={fiche}
                params={rest}
                values={values}
                onParam={onParam}
                disabled={disabled}
              />
            )}
            <SituationBlock
              ctx={ctx}
              systeme={systeme}
              action={action}
              params={situation}
              values={values}
              onParam={onParam}
              attackerId={attackerId}
              targetIds={targetIds}
              disabled={disabled}
            />
            {targetIds.length > 1 && (
              <Segmented
                label="Mode de jet"
                value={rollMode}
                onChange={(v) => onRollMode(v as AttackRollMode)}
                disabled={disabled}
                options={[
                  { value: 'per_target', label: 'Un jet par cible' },
                  { value: 'shared', label: 'Jet commun' },
                ]}
              />
            )}
            {ctx.gm && (
              <ToggleTile
                label="Jet caché aux joueurs"
                checked={hidden}
                onChange={onHidden}
                disabled={disabled}
              />
            )}
            <DicePool
              systeme={systeme}
              presentation={presentation}
              action={action}
              preview={preview}
              adjustments={adjustments}
              onAdjustment={onAdjustment}
              onReset={onResetAdjustments}
              disabled={disabled}
            />
          </div>
        </details>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:gap-8">
      <div className="min-w-0 space-y-6">
        <ActionSummary
          systeme={systeme}
          action={action}
          group={group?.title ?? null}
          canChange={canChangeAction}
          onChange={onChangeAction}
        />
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
              onChange={(v) => onParam(p.id, v)}
              disabled={disabled}
            />
          ) : null,
        )}
        {options.length > 0 && (
          <OptionsSection
            fiche={fiche}
            params={options}
            values={values}
            onParam={onParam}
            disabled={disabled}
          />
        )}
        <DicePool
          systeme={systeme}
          presentation={presentation}
          action={action}
          preview={preview}
          adjustments={adjustments}
          onAdjustment={onAdjustment}
          onReset={onResetAdjustments}
          disabled={disabled}
        />
      </div>

      <aside className="min-w-0 space-y-4 lg:sticky lg:top-0 lg:self-start">
        <SituationBlock
          ctx={ctx}
          systeme={systeme}
          action={action}
          params={situation}
          values={values}
          onParam={onParam}
          attackerId={attackerId}
          targetIds={targetIds}
          disabled={disabled}
        />
        {(targetIds.length > 1 || ctx.gm) && (
          <section className="space-y-3 rounded-2xl border border-border bg-surface/60 p-4">
            {targetIds.length > 1 && (
              <div>
                <SectionTitle icon={<Users aria-hidden />}>Plusieurs cibles</SectionTitle>
                <Segmented
                  label="Mode de jet"
                  value={rollMode}
                  onChange={(v) => onRollMode(v as AttackRollMode)}
                  disabled={disabled}
                  options={(
                    [
                      ['per_target', 'Un jet par cible'],
                      ['shared', 'Jet commun'],
                    ] as const
                  ).map(([value, label]) => ({
                    value,
                    label,
                    ...(actionRollMode === value ? { meta: 'proposé' } : {}),
                  }))}
                />
              </div>
            )}
            {ctx.gm && (
              <ToggleTile
                label="Jet caché aux joueurs"
                checked={hidden}
                onChange={onHidden}
                disabled={disabled}
                hint="Les joueurs ne voient ni le jet ni son issue."
              />
            )}
          </section>
        )}
        <PreviewBox preview={preview} presentation={presentation} />
      </aside>
    </div>
  );
}

function ActionSummary({
  systeme,
  action,
  group,
  canChange,
  onChange,
}: {
  systeme: SystemeCharge;
  action: Action;
  group: string | null;
  canChange: boolean;
  onChange: () => void;
}) {
  const [more, setMore] = useState(false);
  const long = (action.description?.length ?? 0) > 180;
  // Ce que l'action déclare : type de dégâts, plusieurs cibles
  const damageType = action.typeDegats
    ? (systeme.source.typesDegats.find((t) => t.id === action.typeDegats)?.nom ?? null)
    : null;
  const multi = multitargetOf(action);
  const facts = [
    ...(damageType ? [`Dégâts : ${damageType}`] : []),
    ...(action.multicible
      ? [multi.rollMode === 'shared' ? 'Zone : jet commun' : 'Un jet par cible']
      : []),
    ...(multi.max < 50 ? [`${multi.max} cible${multi.max > 1 ? 's' : ''} au plus`] : []),
  ];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {group && (
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {group}
          </p>
        )}
        <h3 className="font-display text-2xl font-semibold leading-tight tracking-tight">
          {action.nom}
        </h3>
        {facts.length > 0 && (
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <Badge key={f} taille="md">
                {f}
              </Badge>
            ))}
          </p>
        )}
        {action.description && (
          <p
            className={cn(
              'mt-1 max-w-prose whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground',
              !more && 'line-clamp-2',
            )}
          >
            {action.description}
          </p>
        )}
        {long && (
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            aria-expanded={more}
            className="mt-0.5 inline-flex items-center gap-1 rounded text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <ChevronDown
              className={cn('size-3.5 transition-transform', more && 'rotate-180')}
              aria-hidden
            />
            {more ? 'Moins' : 'Lire la suite'}
          </button>
        )}
      </div>
      {canChange && (
        <Button variant="secondary" size="sm" onClick={onChange} className="shrink-0">
          Changer d’action
        </Button>
      )}
    </div>
  );
}

/** Options de l'action : bascules, nombres, choix, attributs. */
function OptionsSection({
  fiche,
  params,
  values,
  onParam,
  disabled,
}: {
  fiche: Fiche;
  params: readonly ActionParam[];
  values: Record<string, Valeur>;
  onParam: (id: string, v: Valeur) => void;
  disabled?: boolean | undefined;
}) {
  const toggles = params.filter((p) => p.type === 'booleen');
  const numbers = params.filter((p) => p.type === 'nombre');
  const choices = params.filter((p) => p.type === 'attribut' || isChoiceParam(p));
  return (
    <section>
      <SectionTitle icon={<SlidersHorizontal aria-hidden />}>Options</SectionTitle>
      <div className="space-y-4">
        {choices.map((p) => (
          <div key={p.id}>
            <p className="mb-1.5 text-[13px] text-muted-foreground">{p.nom}</p>
            <Segmented
              label={p.nom}
              value={String(values[p.id] ?? '')}
              onChange={(v) => onParam(p.id, v)}
              disabled={disabled}
              options={
                p.type === 'attribut'
                  ? attributeOptions(fiche, p).map((cle) => {
                      const m = fiche.valeurs.get(cle)?.modificateur;
                      return {
                        value: cle,
                        label: fiche.entite.attributs.get(cle)?.nom ?? cle,
                        meta: m === undefined ? undefined : `${m >= 0 ? '+' : ''}${m}`,
                      };
                    })
                  : choiceOptions(p).map((o) => ({
                      value: o.valeur,
                      label: o.nom,
                      hint: o.description,
                    }))
              }
            />
          </div>
        ))}
        {numbers.length > 0 && (
          <div className="grid gap-2 xl:grid-cols-2">
            {numbers.map((p) => (
              <Stepper
                key={p.id}
                label={p.nom}
                value={typeof values[p.id] === 'number' ? (values[p.id] as number) : 0}
                onChange={(v) => onParam(p.id, v)}
                disabled={disabled}
                hint={paramDescription(p)}
              />
            ))}
          </div>
        )}
        {toggles.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {toggles.map((p) => (
              <ToggleTile
                key={p.id}
                label={p.nom}
                checked={values[p.id] === true}
                onChange={(v) => onParam(p.id, v)}
                disabled={disabled}
                hint={paramDescription(p)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * Pool de dés (ancienne page, A13) : un compteur par dé du système, à la valeur de la fiche ;
 * le changer ajoute ou retire des dés hors règles. Jet numérique : un bonus au total.
 */
function DicePool({
  systeme,
  presentation,
  action,
  preview,
  adjustments,
  onAdjustment,
  onReset,
  disabled,
}: {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  action: Action;
  preview: RollPreview | null;
  adjustments: FreeAdjustments;
  onAdjustment: (die: string | null, value: number) => void;
  onReset: () => void;
  disabled?: boolean | undefined;
}) {
  const adjusted = hasAdjustments(adjustments);
  const header = (
    <SectionTitle
      icon={<Dices aria-hidden />}
      hint="Hors règles : appliqué après les effets, signalé au MJ dans le rapport."
      action={
        adjusted ? (
          <span className="flex items-center gap-2">
            <Badge ton="alerte">ajusté à la main</Badge>
            <Button type="button" variant="ghost" size="xs" onClick={onReset} disabled={disabled}>
              <RotateCcw /> Réinitialiser
            </Button>
          </span>
        ) : undefined
      }
    >
      {action.jet.type === 'numerique' ? 'Jet' : 'Pool de dés'}
    </SectionTitle>
  );

  if (action.jet.type === 'numerique')
    return (
      <section>
        {header}
        <Stepper
          label="Bonus au total"
          value={adjustments.bonus}
          display={adjustments.bonus > 0 ? `+${adjustments.bonus}` : String(adjustments.bonus)}
          min={-100}
          max={100}
          marked={adjustments.bonus !== 0}
          onChange={(v) => onAdjustment(null, v)}
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
      <div className="grid gap-2 sm:grid-cols-2">
        {dice.map((d) => {
          const look = presentation?.des?.sortes[d.id];
          const auto = counts[d.id] ?? (d.id in counts ? null : 0);
          const delta = adjustments.dice[d.id] ?? 0;
          const known = auto !== null;
          const value = known ? Math.max(0, auto + delta) : delta;
          const display = known
            ? String(value)
            : delta
              ? `?${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
              : '?';
          return (
            <Stepper
              key={d.id}
              label={look?.court ?? d.nom}
              swatch={look?.couleur}
              value={value}
              display={display}
              min={known ? 0 : -20}
              max={known ? 20 : 20}
              marked={delta !== 0}
              hint={
                known
                  ? `${auto} d’après la fiche${delta ? `, ${delta > 0 ? '+' : ''}${delta} à la main` : ''}`
                  : 'Dépend de la cible'
              }
              onChange={(v) => onAdjustment(d.id, known ? v - auto : v)}
              disabled={disabled}
            />
          );
        })}
      </div>
    </section>
  );
}

/**
 * Cartes du type d'attaque (écran 1, comme l'ancienne page) : une par option (Contact,
 * Distance, Magie : nom complet), avec son jet (« 1d20 + 5 ») ; un clic lance l'attaque. Une
 * option à paramètres propres (« Libre » : dés, faces, modificateur) les montre, puis se lance.
 */
function AttackCards({
  systeme,
  fiche,
  action,
  param,
  params,
  values,
  onParam,
  onLaunch,
  disabled,
}: {
  systeme: SystemeCharge;
  fiche: Fiche;
  action: Action;
  param: ActionParam;
  params: readonly ActionParam[];
  values: Record<string, Valeur>;
  onParam: (id: string, v: Valeur) => void;
  onLaunch: (patch: Record<string, Valeur>) => void;
  disabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const options =
    param.type === 'attribut'
      ? attributeOptions(fiche, param).map((cle) => ({
          valeur: cle,
          nom: fiche.entite.attributs.get(cle)?.nom ?? cle,
          parametres: [] as string[],
        }))
      : choiceOptions(param).map((o) => ({ ...o, parametres: o.parametres ?? [] }));
  const formula = (v: string) => {
    const p = previewRoll(systeme, action, fiche, { ...values, [param.id]: v });
    return p?.kind === 'numeric' ? p.formula : null;
  };
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const own = params.filter((p) => o.parametres.includes(p.id));
        const expanded = open === o.valeur && own.length > 0;
        return (
          <div
            key={o.valeur}
            className={cn(
              'rounded-2xl border bg-surface/60 transition-colors',
              expanded ? 'border-primary/60' : 'border-border hover:border-primary/50',
            )}
          >
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (own.length) {
                  onParam(param.id, o.valeur);
                  setOpen(expanded ? null : o.valeur);
                } else onLaunch({ [param.id]: o.valeur });
              }}
              className="flex w-full flex-col items-start gap-1 rounded-2xl px-5 py-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <span className="font-display text-2xl font-semibold">{o.nom}</span>
              {!own.length && (
                <span className="font-mono text-lg text-muted-foreground">
                  {formula(o.valeur) ?? ''}
                </span>
              )}
            </button>
            {expanded && (
              <div className="space-y-3 px-5 pb-5">
                <div className="grid gap-2 sm:grid-cols-3">
                  {own.map((p) => (
                    <Stepper
                      key={p.id}
                      label={p.nom}
                      value={typeof values[p.id] === 'number' ? (values[p.id] as number) : 0}
                      onChange={(v) => onParam(p.id, v)}
                      disabled={disabled}
                    />
                  ))}
                </div>
                <Button
                  disabled={disabled}
                  onClick={() => onLaunch({ [param.id]: o.valeur })}
                  className="w-full"
                >
                  <Swords /> {formula(o.valeur) ?? 'Lancer'}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
