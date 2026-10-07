'use client';

/**
 * Écran 2 du menu d'attaque (docs/combat.md § 12.1) : seulement si l'attaque touche, l'étape des
 * dégâts demande les paramètres choisis après le jet (`RollStep.params`, `etape: apres`).
 *
 * Le jet est rappelé en une ligne, comme le dernier jet du lanceur (« TOUCHÉ 17 · Gobelin ») ;
 * puis les armes en tuiles (celles du type d'attaque choisi d'abord), les autres entrées (sorts
 * à dés), et « Dégâts libres » (les nombres de l'étape : dés, faces, modificateur). Un clic
 * lance les dégâts ; touches 1 à 9 sur les tuiles.
 */
import { useTranslations } from 'next-intl';
import type { Attack } from '@vtt/contracts';
import type { Action, Fiche, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { Dices } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DesDuJet } from '@/components/des/resultat-jet';
import { hasSuccessRule } from '@/lib/combat/actions';
import { summarizeTarget, type TargetSummary } from '@/lib/combat/attack-flow-result';
import {
  afterRollParams,
  defaultParamValue,
  paramDescription,
  type ActionParam,
  type EntryParam,
} from '@/lib/combat/params';
import { targetName } from '@/lib/combat/view';
import { cn } from '@/lib/utils';
import { Stepper, TogglePill } from './controls';
import { LaunchButton, Stagger } from './launch';
import { OUTCOME_STYLE, rollGroups } from './outcome';
import type { AttackContext } from './use-attack-context';
import { EntryPicker, entryCardCount } from './weapon-cards';

export function StepDamage({
  attack,
  stepParams,
  ctx,
  systeme,
  presentation,
  fiche,
  launching,
  onLaunch,
}: Readonly<{
  attack: Attack;
  /** Paramètres que l'étape demande. */
  stepParams: readonly string[];
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  launching: boolean;
  onLaunch: (params: Record<string, Valeur>) => void;
}>) {
  const t = useTranslations();
  const action = systeme.actions.get(attack.action.id) as Action | undefined;
  const params = useMemo(
    () =>
      action
        ? afterRollParams(systeme, action, fiche).filter((p) => stepParams.includes(p.id))
        : [],
    [systeme, action, fiche, stepParams],
  );
  const [values, setValues] = useState<Record<string, Valeur>>(() =>
    Object.fromEntries(
      params.map((p) => [p.id, p.type === 'entree' ? '' : defaultParamValue(fiche, p)]),
    ),
  );
  if (!action) return null;

  const entries = params.filter((p): p is EntryParam => p.type === 'entree');
  const numbers = params.filter((p) => p.type === 'nombre');
  const toggles = params.filter((p) => p.type === 'booleen');

  /** Tous les paramètres de l'étape : la source choisie, les autres entrées vides. */
  const launch = (patch: Record<string, Valeur>) =>
    onLaunch(
      Object.fromEntries(params.map((p: ActionParam) => [p.id, launchValue(p, patch, values)])),
    );

  // Type d'attaque choisi au jet : les armes qui s'en servent d'abord
  const declared = new Set(Object.values(attack.params).filter((v) => typeof v === 'string'));
  const successRule = hasSuccessRule(action);
  const hits = attack.targets
    .map((t) => summarizeTarget(attack, t, { successRule }))
    .filter((s) => s.hit !== false);

  // Raccourcis : les tuiles de chaque entrée à la suite
  let next = 1;
  const shortcuts = entries.map((p) => {
    const first = next;
    next += entryCardCount(systeme, fiche, action, p);
    return first <= 9 ? first : null;
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <ul className="flex flex-col items-center gap-1.5" aria-label={t('combat.attack.attackRoll')}>
        {hits.map((s) => (
          <RecapLine key={s.characterId} summary={s} name={targetName(s.characterId, ctx.known)} />
        ))}
      </ul>

      {toggles.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5">
          {toggles.map((p) => (
            <TogglePill
              key={p.id}
              label={p.nom}
              checked={values[p.id] === true}
              onChange={(v) => setValues((x) => ({ ...x, [p.id]: v }))}
              disabled={launching}
              hint={paramDescription(p)}
            />
          ))}
        </div>
      )}

      {entries.map((p, i) => (
        <EntryPicker
          key={p.id}
          systeme={systeme}
          presentation={presentation}
          fiche={fiche}
          action={action}
          param={p}
          value=""
          mode="launch"
          firstShortcut={shortcuts[i] ?? null}
          prefer={(entree) =>
            Object.values(entree.champs).some((v) => typeof v === 'string' && declared.has(v))
          }
          onChange={(v) => v && launch({ [p.id]: v })}
          disabled={launching}
        />
      ))}

      {numbers.length > 0 && (
        <Stagger index={2}>
          <section
            aria-label={t('combat.attack.freeDamage')}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-surface sm:p-4"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border-strong bg-surface-3 text-primary">
                <Dices className="size-[1.125rem]" aria-hidden />
              </span>
              <span className="flex-1 text-sm font-semibold">{t('combat.attack.freeDamage')}</span>
              <LaunchButton busy={launching} onClick={() => launch({})}>
                {t('combat.attack.roll')}
              </LaunchButton>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {numbers.map((p) => (
                <Stepper
                  key={p.id}
                  label={p.nom}
                  value={typeof values[p.id] === 'number' ? (values[p.id] as number) : 0}
                  onChange={(v) => setValues((x) => ({ ...x, [p.id]: v }))}
                  disabled={launching}
                  hint={paramDescription(p)}
                />
              ))}
            </div>
          </section>
        </Stagger>
      )}
    </div>
  );
}

/** Le jet d'attaque en une ligne, comme « Dernier jet » du lanceur. */
function RecapLine({ summary: s, name }: Readonly<{ summary: TargetSummary; name: string }>) {
  const style = s.outcome ? OUTCOME_STYLE[s.outcome.tone] : null;
  const fig = s.figure;
  return (
    <li className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 rounded-full border border-border bg-surface-2/50 py-1 pl-3 pr-2">
      {s.outcome && style && (
        <span className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider">
          <style.icon className={cn('size-3.5', style.tint)} strokeWidth={2.5} aria-hidden />
          <span className={style.text}>{s.outcome.label}</span>
        </span>
      )}
      {fig?.kind === 'numeric' && (
        <>
          <span className="font-mono text-base font-semibold leading-none tabular">
            {fig.total}
          </span>
          <DesDuJet taille="xs" groupes={rollGroups(fig.roll)} />
        </>
      )}
      <span className="text-[13px] text-muted-foreground">{name}</span>
    </li>
  );
}

/** Valeur lancée d'un paramètre : celle choisie, vide pour une autre entrée, sinon l'actuelle. */
function launchValue(
  p: ActionParam,
  patch: Record<string, Valeur>,
  values: Readonly<Record<string, Valeur>>,
): Valeur {
  if (p.id in patch) return patch[p.id]!;
  return p.type === 'entree' ? '' : values[p.id]!;
}
