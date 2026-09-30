'use client';

/**
 * Écran des dégâts (docs/combat.md § 12.1) : seulement si l'attaque touche, l'étape demande les
 * paramètres choisis après le jet (`RollStep.params`, `etape: apres`). Le jet est rappelé en une
 * ligne (« Touché : 17 contre Gobelin ») ; puis les armes de l'inventaire en cartes (celles du
 * type d'attaque choisi d'abord), les autres entrées (sorts à dés), et « Dégâts libres » (les
 * nombres de l'étape : dés, faces, modificateur). Un clic lance les dégâts.
 */
import type { Attack } from '@vtt/contracts';
import type { Action, Fiche, Presentation, SystemeCharge, Valeur } from '@vtt/rules';
import { Dices } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { hasSuccessRule } from '@/lib/combat/actions';
import { summarizeTarget } from '@/lib/combat/attack-flow-result';
import {
  afterRollParams,
  defaultParamValue,
  paramDescription,
  type ActionParam,
  type EntryParam,
} from '@/lib/combat/params';
import { targetName } from '@/lib/combat/view';
import { SectionTitle, Stepper, ToggleTile } from './controls';
import type { AttackContext } from './use-attack-context';
import { EntryPicker } from './weapon-cards';

export function StepDamage({
  attack,
  stepParams,
  ctx,
  systeme,
  presentation,
  fiche,
  launching,
  onLaunch,
}: {
  attack: Attack;
  /** Paramètres que l'étape demande. */
  stepParams: readonly string[];
  ctx: AttackContext;
  systeme: SystemeCharge;
  presentation: Presentation | null;
  fiche: Fiche;
  launching: boolean;
  onLaunch: (params: Record<string, Valeur>) => void;
}) {
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
  const others = params.filter(
    (p) => p.type !== 'entree' && p.type !== 'nombre' && p.type !== 'booleen',
  );

  /** Tous les paramètres de l'étape : la source choisie, les autres entrées vides. */
  const launch = (patch: Record<string, Valeur>) =>
    onLaunch(
      Object.fromEntries(
        params.map((p: ActionParam) => [
          p.id,
          p.id in patch ? patch[p.id]! : p.type === 'entree' ? '' : values[p.id]!,
        ]),
      ),
    );

  // Type d'attaque choisi au jet : les armes qui s'en servent d'abord
  const declared = new Set(Object.values(attack.params).filter((v) => typeof v === 'string'));
  const successRule = hasSuccessRule(action);
  const hits = attack.targets
    .map((t) => ({ t, s: summarizeTarget(attack, t, { successRule }) }))
    .filter((x) => x.s.hit);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <ul className="space-y-1">
        {hits.map(({ t, s }) => (
          <li key={t.characterId} className="text-[14px] text-muted-foreground">
            <span className="font-semibold text-foreground">{s.outcome?.label ?? 'Touché'}</span>
            {s.figure?.kind === 'numeric' ? ` : ${s.figure.total}` : ''} contre{' '}
            {targetName(t.characterId, ctx.known)}
          </li>
        ))}
      </ul>

      {toggles.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {toggles.map((p) => (
            <ToggleTile
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

      {entries.map((p) => (
        <EntryPicker
          key={p.id}
          systeme={systeme}
          presentation={presentation}
          fiche={fiche}
          action={action}
          param={p}
          value=""
          hideNone
          prefer={(entree) =>
            Object.values(entree.champs).some((v) => typeof v === 'string' && declared.has(v))
          }
          onChange={(v) => v && launch({ [p.id]: v })}
          disabled={launching}
        />
      ))}

      {(numbers.length > 0 || others.length > 0) && (
        <section className="rounded-2xl border border-border bg-surface/60 p-4">
          <SectionTitle icon={<Dices aria-hidden />}>Dégâts libres</SectionTitle>
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
          <Button
            className="mt-3"
            loading={launching}
            onClick={() => launch({})}
            disabled={launching}
          >
            <Dices /> Lancer les dégâts libres
          </Button>
        </section>
      )}
    </div>
  );
}
