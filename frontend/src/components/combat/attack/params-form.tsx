'use client';

/**
 * Formulaire des paramètres d'une action du système (docs/combat.md § 5.2) : un champ par
 * paramètre, généré depuis sa définition (`nombre`, `booleen`, `choix`, `attribut`, `entree`
 * avec ses exemplaires), sa description en info-bulle. Champ partagé par le lanceur d'actions
 * de la fiche, le formulaire d'initiative et la défense active ; le menu d'attaque a ses
 * propres cartes (étape « Préparer »). Aucune clé de jeu.
 */
import type { Action, Fiche, SystemeCharge, Valeur } from '@vtt/rules';
import { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { libelleAttribut } from '@/lib/creation';
import {
  attackerParams,
  attributeOptions,
  choiceOptions,
  entryOptions,
  isChoiceParam,
  paramDescription,
  type ActionParam,
} from '@/lib/combat/params';
import { cn } from '@/lib/utils';
import { HintIcon, Segmented } from './controls';

/** Un paramètre d'action, selon son type. */
export function ParamField({
  fiche,
  parametre: p,
  valeur,
  onValeur,
  compact = false,
}: Readonly<{
  fiche: Fiche;
  parametre: ActionParam;
  valeur: Valeur;
  onValeur: (v: Valeur) => void;
  /** Panneau étroit (menu d'attaque) : libellés plus petits. */
  compact?: boolean;
}>) {
  const id = `param-${useId()}-${p.id}`;
  const label = cn(compact && 'text-[13px]');
  const aide = paramDescription(p);
  const nom = (
    <span className="inline-flex items-center gap-1">
      {p.nom}
      {aide && <HintIcon text={aide} />}
    </span>
  );
  if (isChoiceParam(p))
    return (
      <div className="space-y-2">
        <Label className={label}>{nom}</Label>
        <Segmented
          label={p.nom}
          value={String(valeur)}
          onChange={onValeur}
          options={choiceOptions(p).map((o) => ({
            value: o.valeur,
            label: o.nom,
            hint: o.description,
          }))}
        />
      </div>
    );
  if (p.type === 'booleen')
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className={label}>
          {nom}
        </Label>
        <Switch id={id} checked={valeur === true} onCheckedChange={onValeur} />
      </div>
    );
  if (p.type === 'nombre')
    return (
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={id} className={label}>
          {nom}
        </Label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          value={String(valeur)}
          onChange={(e) => onValeur(Number(e.target.value))}
          className="h-9 w-24 text-right font-mono"
        />
      </div>
    );
  if (p.type === 'attribut') {
    const options = attributeOptions(fiche, p);
    return (
      <div className="space-y-2">
        <Label className={label}>{nom}</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={p.nom}>
          {options.map((cle) => {
            const v = fiche.valeurs.get(cle);
            return (
              <button
                key={cle}
                type="button"
                role="radio"
                aria-checked={valeur === cle}
                onClick={() => onValeur(cle)}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                  valeur === cle
                    ? 'border-primary/60 bg-primary/15 text-primary-strong'
                    : 'border-border-strong text-muted-foreground hover:text-foreground',
                )}
              >
                {libelleAttribut(fiche, cle)}
                {v?.modificateur !== undefined && (
                  <span className="font-mono text-[11px] opacity-80">
                    {v.modificateur >= 0 ? '+' : ''}
                    {v.modificateur}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  if (p.type !== 'entree') return null;
  const options = entryOptions(fiche, p);
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className={label}>
        {nom}
      </Label>
      <select
        id={id}
        value={String(valeur)}
        onChange={(e) => onValeur(e.target.value)}
        className="h-10 w-full rounded-lg border border-input bg-surface-2/60 px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        {(p.facultatif || !options.length) && (
          <option value="">{options.length ? 'Aucune' : 'Aucune disponible'}</option>
        )}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nom}
            {o.rang > 0 ? ` (rang ${o.rang})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Paramètres de l'attaquant pour une action : ceux de la cible (défense active) ne sont jamais
 * demandés, une option dont l'`exige` est faux pour lui est cachée.
 */
export function ParamsForm({
  systeme,
  action,
  fiche,
  values,
  onChange,
  compact = false,
}: Readonly<{
  systeme: SystemeCharge;
  action: Action;
  fiche: Fiche;
  values: Record<string, Valeur>;
  onChange: (id: string, value: Valeur) => void;
  compact?: boolean;
}>) {
  const params = attackerParams(systeme, action, fiche);
  if (!params.length) return null;
  return (
    <div className={cn('grid', compact ? 'gap-3' : 'gap-4')}>
      {params.map((p) => (
        <ParamField
          key={p.id}
          fiche={fiche}
          parametre={p}
          valeur={values[p.id] ?? ''}
          onValeur={(v) => onChange(p.id, v)}
          compact={compact}
        />
      ))}
    </div>
  );
}
