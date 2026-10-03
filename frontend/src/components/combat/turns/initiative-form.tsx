'use client';

/**
 * Paramètres de l'action d'initiative du système (docs/combat.md § 4.4), en formulaire généré :
 * par camp (joueurs surpris, ennemis embusqués) ou pour un participant (l'ancien « override »
 * de compétence). Aucune fiche derrière : les choix sont ceux du système (entrées de la sorte
 * et de l'étiquette demandées, attributs du groupe), et chaque champ peut rester « par défaut »
 * (non envoyé : le serveur prend la valeur de l'action, ou la meilleure pour le personnage).
 */
import type { ActionParams, ActionParamValue, CampaignSide } from '@vtt/contracts';
import type { Action, SystemeCharge } from '@vtt/rules';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SIDE_LABELS, SIDES } from './model';

export type Parametre = Action['parametres'][number];

/** Action d'initiative du système, s'il en déclare une. */
export function initiativeAction(systeme: SystemeCharge | null | undefined): Action | null {
  const id = systeme?.source.initiative?.action;
  return (id && systeme?.actions.get(id)) || null;
}

/** Paramètres demandés à l'acteur (les réactions de la cible n'ont pas de sens ici). */
export function initiativeParams(action: Action | null): Parametre[] {
  return (action?.parametres ?? []).filter(
    (p) => (p as { par?: string }).par !== 'cible',
  ) as Parametre[];
}

const DEFAULT = '';

/** Paramètre à choix (entrée, attribut, option nommée) : une liste déroulante. */
export function isChoiceParam(p: Parametre): boolean {
  const type = (p as { type: string }).type;
  return type === 'entree' || type === 'attribut' || type === 'choix';
}

/**
 * Premier paramètre à choix de l'action d'initiative (la compétence d'un système à créneaux) :
 * celui que l'en-tête propose par camp, comme l'ancienne app. Null : rien à choisir.
 */
export function sideChoiceParam(action: Action | null): Parametre | null {
  return initiativeParams(action).find(isChoiceParam) ?? null;
}

/** Options d'un paramètre à choix, lues dans le système (sans fiche). */
export function entryOptionsOf(systeme: SystemeCharge, p: Parametre) {
  const type = (p as { type: string }).type;
  if (type === 'entree') return entryOptions(systeme, p as Extract<Parametre, { type: 'entree' }>);
  if (type === 'attribut')
    return attributeOptions(systeme, p as Extract<Parametre, { type: 'attribut' }>);
  const options = (p as { options?: unknown }).options;
  return Array.isArray(options)
    ? options.flatMap((o) =>
        o && typeof o === 'object' && typeof (o as { valeur?: unknown }).valeur === 'string'
          ? [
              {
                valeur: (o as { valeur: string }).valeur,
                nom: String((o as { nom?: unknown }).nom ?? (o as { valeur: string }).valeur),
              },
            ]
          : [],
      )
    : [];
}

function entryOptions(systeme: SystemeCharge, p: Extract<Parametre, { type: 'entree' }>) {
  return [...systeme.entrees.values()]
    .filter((e) => e.sorte === p.sorte && (!p.etiquette || e.etiquettes.includes(p.etiquette)))
    .map((e) => ({ valeur: e.id, nom: e.nom }));
}

function attributeOptions(systeme: SystemeCharge, p: Extract<Parametre, { type: 'attribut' }>) {
  const seen = new Map<string, string>();
  for (const entity of systeme.entites.values())
    for (const a of entity.type.attributs) {
      const wanted = p.attributs?.length ? p.attributs.includes(a.cle) : a.groupe === p.groupe;
      if (wanted && !seen.has(a.cle)) seen.set(a.cle, a.nom);
    }
  // Ordre déclaré par le paramètre quand il liste ses attributs
  const keys = p.attributs?.length ? p.attributs.filter((k) => seen.has(k)) : [...seen.keys()];
  return keys.map((k) => ({ valeur: k, nom: seen.get(k)! }));
}

/** Retire une clé (retour à la valeur par défaut). */
function without(params: ActionParams, key: string): ActionParams {
  const { [key]: _removed, ...rest } = params;
  return rest;
}

/** Formulaire des paramètres d'initiative ; `value` ne contient que les choix explicites. */
export function InitiativeParamsForm({
  systeme,
  parametres,
  value,
  onChange,
  idPrefix,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  parametres: readonly Parametre[];
  value: ActionParams;
  onChange(value: ActionParams): void;
  idPrefix: string;
  disabled?: boolean;
}>) {
  const set = (key: string, v: ActionParamValue | undefined) =>
    onChange(v === undefined ? without(value, key) : { ...value, [key]: v });

  if (!parametres.length)
    return (
      <p className="text-[13px] text-muted-foreground">
        L’initiative de ce système ne demande aucun choix.
      </p>
    );

  return (
    <div className="space-y-3">
      {parametres.map((p) => {
        const id = `${idPrefix}-${p.id}`;
        const current = value[p.id];
        if (p.type === 'booleen')
          return (
            <div key={p.id} className="flex items-center justify-between gap-4">
              <Label htmlFor={id} className="text-[13px]">
                {p.nom}
              </Label>
              <Switch
                id={id}
                disabled={disabled}
                checked={current === undefined ? p.defaut : current === true}
                onCheckedChange={(on) => set(p.id, on === p.defaut ? undefined : on)}
              />
            </div>
          );
        if (p.type === 'nombre')
          return (
            <div key={p.id} className="flex items-center justify-between gap-4">
              <Label htmlFor={id} className="text-[13px]">
                {p.nom}
              </Label>
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                disabled={disabled}
                placeholder={String(p.defaut)}
                value={typeof current === 'number' ? String(current) : ''}
                onChange={(e) =>
                  set(p.id, e.target.value === '' ? undefined : Number(e.target.value))
                }
                className="h-9 w-24 text-right font-mono tabular-nums"
              />
            </div>
          );
        const options = entryOptionsOf(systeme, p);
        return (
          <div key={p.id} className="space-y-1.5">
            <Label htmlFor={id} className="text-[13px]">
              {p.nom}
            </Label>
            <SelectField
              id={id}
              disabled={disabled}
              value={typeof current === 'string' ? current : DEFAULT}
              onValueChange={(v) => set(p.id, v === DEFAULT ? undefined : v)}
              options={[{ valeur: DEFAULT, nom: 'Par défaut' }, ...options]}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Paramètres par camp : un onglet par camp présent, chacun son formulaire. */
export function SideParamsForm({
  systeme,
  parametres,
  sides,
  value,
  onChange,
  disabled,
}: Readonly<{
  systeme: SystemeCharge;
  parametres: readonly Parametre[];
  sides: readonly CampaignSide[];
  value: Partial<Record<CampaignSide, ActionParams>>;
  onChange(value: Partial<Record<CampaignSide, ActionParams>>): void;
  disabled?: boolean;
}>) {
  const shown = SIDES.filter((s) => sides.includes(s));
  if (!parametres.length) return null;
  return (
    <div className="space-y-3">
      {shown.map((side) => (
        <fieldset
          key={side}
          className={cn(
            'rounded-xl border border-border bg-surface/60 p-3',
            disabled && 'opacity-60',
          )}
        >
          <legend className="px-1 text-xs font-semibold text-muted-foreground">
            {SIDE_LABELS[side].name}
          </legend>
          <InitiativeParamsForm
            systeme={systeme}
            parametres={parametres}
            value={value[side] ?? {}}
            onChange={(v) => onChange({ ...value, [side]: v })}
            idPrefix={`init-${side}`}
            disabled={disabled}
          />
        </fieldset>
      ))}
    </div>
  );
}
