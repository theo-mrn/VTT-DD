'use client';

/**
 * Bloc « Situation » de la préparation (docs/combat.md § 5.7, § 12.1, 2) : les paramètres de
 * situation du système (couvert, avantage, cible surprise…, rangés `section: situation` par le
 * moteur), puis ce que sait le combat, en puces lisibles pour l'attaquant et chaque cible.
 *
 * MJ : sous chaque cible, les valeurs de sa fiche que l'action lit (`@cible.X` : Défense,
 * Encaissement…), pour juger d'un coup d'œil. Un joueur ne lit jamais la fiche d'une cible.
 */
import type { Action, Fiche, SystemeCharge, Valeur } from '@vtt/rules';
import { Radar } from 'lucide-react';
import { useMemo } from 'react';
import { Illustration } from '@/components/commun/illustration';
import { targetAttributeKeys } from '@/lib/combat/actions';
import {
  combatSituation,
  situationIconOf,
  type SituationChip,
} from '@/lib/combat/attack-flow-situation';
import {
  choiceOptions,
  isChoiceParam,
  paramDescription,
  type ActionParam,
} from '@/lib/combat/params';
import { STATE_ICONS } from '@/lib/combat/state-icons';
import { targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { HintIcon, SectionTitle, Segmented, SituationPill, Stepper, TogglePill } from './controls';
import { useComputedSheet, type AttackContext } from './use-attack-context';

/** Le bloc a quelque chose à montrer : paramètres de situation, puces du combat, aperçu MJ. */
export function hasSituation(
  ctx: Pick<AttackContext, 'combat' | 'gm'>,
  systeme: SystemeCharge,
  action: Action,
  params: readonly ActionParam[],
  attackerId: string | null,
  targetIds: readonly string[],
): boolean {
  if (params.length) return true;
  const s = combatSituation(ctx.combat, attackerId, targetIds);
  if (!s.inCombat) return false;
  if (s.attacker.length || s.targets.some((t) => t.chips.length)) return true;
  return ctx.gm && targetIds.length > 0 && targetAttributeKeys(systeme, action).length > 0;
}

export function SituationBlock({
  ctx,
  systeme,
  action,
  params,
  values,
  onParam,
  attackerId,
  targetIds,
  disabled,
}: Readonly<{
  ctx: AttackContext;
  systeme: SystemeCharge;
  action: Action;
  /** Paramètres de situation de l'action (section `situation`). */
  params: readonly ActionParam[];
  values: Record<string, Valeur>;
  onParam: (id: string, v: Valeur) => void;
  attackerId: string | null;
  targetIds: readonly string[];
  disabled?: boolean;
}>) {
  const situation = combatSituation(ctx.combat, attackerId, targetIds);
  const insightKeys = useMemo(
    () => (ctx.gm ? targetAttributeKeys(systeme, action) : []),
    [ctx.gm, systeme, action],
  );
  const toggles = params.filter((p) => p.type === 'booleen');
  const choices = params.filter((p) => isChoiceParam(p));
  const numbers = params.filter((p) => p.type === 'nombre');
  const icon = (id: string) => {
    const name = situationIconOf(ctx.presentation, id);
    const Icon = name ? STATE_ICONS[name] : null;
    return Icon ? <Icon className="size-3.5 shrink-0" aria-hidden /> : null;
  };
  const hasCombatInfo =
    situation.attacker.length > 0 || situation.targets.some((t) => t.chips.length > 0);
  if (!hasSituation(ctx, systeme, action, params, attackerId, targetIds)) return null;

  return (
    <section aria-labelledby="attack-situation">
      <SectionTitle icon={<Radar aria-hidden />}>
        <span id="attack-situation">Situation</span>
        {situation.round !== null && (
          <span className="normal-case tracking-normal text-subtle">· round {situation.round}</span>
        )}
      </SectionTitle>

      {params.length > 0 && (
        <div className="mb-4 space-y-3.5">
          {choices.map((p) => (
            <div key={p.id}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                {icon(p.id)}
                {p.nom}
                {paramDescription(p) && <HintIcon text={paramDescription(p)!} />}
              </p>
              <Segmented
                label={p.nom}
                value={String(values[p.id] ?? '')}
                onChange={(v) => onParam(p.id, v)}
                disabled={disabled}
                options={choiceOptions(p).map((o) => ({
                  value: o.valeur,
                  label: o.nom,
                  hint: o.description,
                }))}
              />
            </div>
          ))}
          {toggles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {toggles.map((p) => (
                <TogglePill
                  key={p.id}
                  label={p.nom}
                  icon={icon(p.id)}
                  checked={values[p.id] === true}
                  onChange={(v) => onParam(p.id, v)}
                  disabled={disabled}
                  hint={paramDescription(p)}
                />
              ))}
            </div>
          )}
          {numbers.map((p) => {
            const v = values[p.id];
            const n = typeof v === 'number' ? v : 0;
            return (
              <Stepper
                key={p.id}
                label={
                  <span className="flex items-center gap-1.5">
                    {icon(p.id)}
                    {p.nom}
                  </span>
                }
                name={p.nom}
                value={n}
                display={n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0'}
                marked={n !== 0}
                onChange={(x) => onParam(p.id, x)}
                disabled={disabled}
                hint={paramDescription(p)}
              />
            );
          })}
        </div>
      )}

      {situation.inCombat && (hasCombatInfo || (ctx.gm && insightKeys.length > 0)) && (
        <ul className="space-y-2.5">
          {situation.attacker.length > 0 && (
            <SituationRow
              label="Attaquant"
              chips={situation.attacker}
              portrait={null}
              tone="attacker"
            />
          )}
          {situation.targets.map((t) =>
            t.chips.length || (ctx.gm && insightKeys.length) ? (
              <SituationRow
                key={t.characterId}
                label={targetName(t.characterId, ctx.known)}
                chips={t.chips}
                portrait={ctx.known.get(t.characterId)?.portraitUrl ?? null}
                tone="target"
              >
                {ctx.gm && insightKeys.length > 0 && (
                  <GmTargetInsight ctx={ctx} targetId={t.characterId} keys={insightKeys} />
                )}
              </SituationRow>
            ) : null,
          )}
        </ul>
      )}
    </section>
  );
}

function SituationRow({
  label,
  chips,
  portrait,
  tone,
  children,
}: Readonly<{
  label: string;
  chips: readonly SituationChip[];
  portrait: string | null;
  tone: 'attacker' | 'target';
  children?: React.ReactNode;
}>) {
  return (
    <li className="flex items-start gap-2.5">
      {tone === 'target' ? (
        <Illustration
          largeur={28}
          src={portrait}
          graine={label}
          className="mt-0.5 size-7 shrink-0 rounded-full ring-1 ring-destructive/50"
        />
      ) : (
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold uppercase text-primary">
          Att.
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-[13px] font-medium', tone === 'attacker' && 'sr-only')}>
          {label}
        </p>
        {chips.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {chips.map((c) => (
              <SituationPill key={c.id} chip={c} />
            ))}
          </div>
        )}
        {children}
      </div>
    </li>
  );
}

/** MJ : valeurs de la fiche de la cible que l'action lit (aperçu par cible). */
function GmTargetInsight({
  ctx,
  targetId,
  keys,
}: Readonly<{
  ctx: AttackContext;
  targetId: string;
  keys: readonly string[];
}>) {
  const { fiche } = useComputedSheet(ctx, targetId);
  if (!fiche) return null;
  const items = keys.flatMap((k) => valueOf(fiche, k));
  if (!items.length) return null;
  return (
    <dl className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
      {items.map((i) => (
        <div key={i.key} className="flex items-baseline gap-1">
          <dt className="text-subtle">{i.label}</dt>
          <dd className="font-mono font-semibold tabular-nums">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function valueOf(fiche: Fiche, key: string): { key: string; label: string; value: string }[] {
  const a = fiche.entite.attributs.get(key);
  const v = fiche.valeurs.get(key);
  if (!a || !v || v.valeur === '' || v.valeur === undefined) return [];
  const value =
    a.nature === 'ressource' && typeof v.valeur === 'number' && v.max !== undefined
      ? `${v.valeur} / ${v.max}`
      : String(v.valeur);
  return [{ key, label: a.nom, value }];
}
