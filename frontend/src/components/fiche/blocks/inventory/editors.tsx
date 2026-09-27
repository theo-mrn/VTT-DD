'use client';

/**
 * Éditeurs partagés par le détail d'un objet (item-panel) et la configuration d'un objet
 * avant son ajout (item-config) : valeur d'un champ de la sorte, formule en clés nues
 * vérifiée en direct, bonus propres (liste et ajout). Tout vient de la sorte et du système.
 */
import type { Effet, Fiche, Sorte } from '@vtt/rules';
import { Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField, type SelectOption, type SelectOptionGroup } from '@/components/ui/select';
import { Input, styleChampBase } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  attributsBonus,
  effetBonus,
  erreursBonus,
  type BonusPropre,
  type FormuleVerifiee,
  type ValeurChamp,
} from './model';

/**
 * Marque un élément qui traite Échap lui-même (formule en édition, bonus en saisie) : la
 * fenêtre qui le contient ne se ferme pas et ne revient pas en arrière (Radix écoute Échap
 * en capture, avant l'élément).
 */
export const ECHAP_LOCAL = { 'data-echap-local': '' } as const;

/** Échap vient d'un élément qui le traite lui-même (voir `ECHAP_LOCAL`). */
export function echapLocal(e: KeyboardEvent): boolean {
  return e.target instanceof Element && e.target.closest('[data-echap-local]') !== null;
}

type ChampModifiable = Extract<
  Sorte['champs'][number],
  { type: 'nombre' | 'texte' | 'booleen' | 'choix' }
>;

export function estModifiable(champ: Sorte['champs'][number]): champ is ChampModifiable {
  return (
    champ.type === 'nombre' ||
    champ.type === 'texte' ||
    champ.type === 'booleen' ||
    champ.type === 'choix'
  );
}

/**
 * Saisie d'une valeur de champ selon son type. Un nombre illisible n'est pas transmis
 * (`onChange(undefined)`) et le champ se marque invalide.
 */
export function FieldInput({
  id,
  champ,
  valeur,
  onChange,
  onEnter,
  className,
}: {
  id: string;
  champ: ChampModifiable;
  valeur: ValeurChamp | undefined;
  onChange(v: ValeurChamp | undefined): void;
  onEnter?: () => void;
  className?: string;
}) {
  const [texte, setTexte] = useState(valeur === undefined ? '' : String(valeur));
  if (champ.type === 'choix')
    return (
      <SelectField
        id={id}
        value={valeur === undefined ? '' : String(valeur)}
        onValueChange={(v) => onChange(v)}
        className={cn('h-7 w-36 px-2 text-xs', className)}
        placeholder="—"
        options={champ.options.map((o) => ({ valeur: o.valeur, nom: o.nom }))}
      />
    );
  if (champ.type === 'booleen')
    return <Switch id={id} checked={valeur === true} onCheckedChange={(v) => onChange(v)} />;
  if (champ.type === 'nombre') {
    const n = Number(texte.replace(',', '.'));
    const invalide = texte.trim() === '' || !Number.isFinite(n);
    return (
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        aria-invalid={invalide ? true : undefined}
        className={cn('h-7 w-24 px-2 text-right font-mono text-xs tabular-nums', className)}
        value={texte}
        onChange={(e) => {
          setTexte(e.target.value);
          const v = Number(e.target.value.replace(',', '.'));
          onChange(e.target.value.trim() !== '' && Number.isFinite(v) ? v : undefined);
        }}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    );
  }
  return (
    <Input
      id={id}
      type="text"
      maxLength={2000}
      className={cn('h-7 w-40 px-2 text-xs', className)}
      value={valeur === undefined ? '' : String(valeur)}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
    />
  );
}

/**
 * Formule en clés nues (`1d6-CON+8`), vérifiée en direct : erreur lisible sous le champ,
 * sinon aperçu calculé pour le personnage. `verif` vient du modèle (même vérification que
 * le service) ; `null` : rien à dire (champ vide).
 */
export function FormulaField({
  id,
  label,
  labelVisible = false,
  texte,
  onChange,
  verif,
  des,
  cle,
  sorte,
  autoFocus,
  onEscape,
  actions,
}: {
  id: string;
  label: string;
  /** Libellé affiché au-dessus du champ ; sinon lu seulement par les lecteurs d'écran. */
  labelVisible?: boolean;
  texte: string;
  onChange(texte: string): void;
  verif: FormuleVerifiee | null;
  /** Formule de jet : elle peut lancer des dés. */
  des: boolean;
  /** Clé d'attribut prise en exemple dans l'aide et le placeholder. */
  cle: string;
  sorte: Sorte;
  autoFocus?: boolean;
  onEscape?: () => void;
  /** Boutons à droite du champ (Enregistrer, Annuler…). */
  actions?: ReactNode;
}) {
  const erreur = verif && !verif.ok ? verif.erreurs.join(' ; ') : null;
  const champNombre = sorte.champs.find((c) => c.type === 'nombre')?.id;
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className={labelVisible ? 'block text-xs text-muted-foreground' : 'sr-only'}
      >
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id={id}
          autoFocus={autoFocus}
          spellCheck={false}
          autoComplete="off"
          value={texte}
          maxLength={500}
          placeholder={des ? `1d6-${cle}+2` : `${cle}+2`}
          aria-invalid={erreur ? true : undefined}
          aria-describedby={`${id}-aide ${id}-regles`}
          {...(onEscape ? ECHAP_LOCAL : {})}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && onEscape) {
              e.preventDefault();
              e.stopPropagation();
              onEscape();
            }
          }}
          className="h-9 px-2.5 font-mono text-[13px]"
        />
        {actions}
      </div>
      <div id={`${id}-aide`} aria-live="polite" className="min-h-4 text-xs">
        {erreur ? (
          <p role="alert" className="text-destructive">
            {erreur}
          </p>
        ) : verif?.ok ? (
          <p className="text-muted-foreground">
            Pour ce personnage : <span className="font-mono text-foreground">{verif.apercu}</span>
          </p>
        ) : null}
      </div>
      <p id={`${id}-regles`} className="text-[11px] leading-relaxed text-subtle">
        {des ? 'Dés : 2d6, 4d6k3 (garder les 3 meilleurs). ' : ''}
        Clés nues comme au lanceur : {cle} ajoute ce que {cle} apporte à un jet, @{cle} sa valeur
        brute. Opérateurs + − * /, parenthèses, si(condition, alors, sinon).
        {champNombre ? ` Champs de l’objet : source.${champNombre}.` : ''}
      </p>
    </div>
  );
}

/** Bonus propres d'un exemplaire : activer, désactiver, retirer (absents : lecture seule). */
export function BonusPropresListe({
  bonus,
  onBasculer,
  onRetirer,
}: {
  bonus: BonusPropre[];
  onBasculer?: (index: number) => void;
  onRetirer?: (index: number) => void;
}) {
  if (!bonus.length) return null;
  return (
    <ul className="divide-y divide-border rounded-xl border border-border">
      {bonus.map((b) => (
        <li key={b.index} className="flex min-h-10 items-center gap-2 px-3 py-1.5 text-[13px]">
          <span className={cn('min-w-0 flex-1 truncate', !b.actif && 'text-subtle line-through')}>
            {b.texte}
            {b.effet.description && b.effet.description !== b.texte && (
              <span className="ml-1.5 text-xs text-subtle">{b.effet.description}</span>
            )}
          </span>
          {onBasculer && (
            <Switch
              checked={b.actif}
              aria-label={b.actif ? `Désactiver ${b.texte}` : `Activer ${b.texte}`}
              onCheckedChange={() => onBasculer(b.index)}
            />
          )}
          {onRetirer && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Retirer ${b.texte}`}
              onClick={() => onRetirer(b.index)}
            >
              <Trash2 />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Nouveau bonus propre : un attribut numérique du personnage et une valeur (nombre ou
 * formule), vérifiés par le moteur comme le fera le service.
 */
export function BonusForm({
  fiche,
  sorte,
  mj,
  onAjouter,
  onAnnuler,
}: {
  fiche: Fiche;
  sorte: Sorte;
  mj: boolean;
  onAjouter(effet: Effet): void;
  onAnnuler(): void;
}) {
  const id = useId();
  const attributs = useMemo(() => attributsBonus(fiche, mj), [fiche, mj]);
  const [attribut, setAttribut] = useState(attributs[0]?.cle ?? '');
  const [valeur, setValeur] = useState('1');
  const [description, setDescription] = useState('');
  const effet = attribut && valeur.trim() ? effetBonus(attribut, valeur.trim(), description) : null;
  const erreurs = useMemo(
    () => (effet ? erreursBonus(fiche, sorte, effet) : []),
    [effet, fiche, sorte],
  );
  const groupes = [...new Set(attributs.map((x) => x.groupe ?? ''))];
  const valider = () => {
    if (!effet || erreurs.length) return;
    onAjouter(effet);
    setValeur('1');
    setDescription('');
  };

  return (
    // Pas de <form> : ce formulaire vit aussi dans celui de l'ajout d'un objet
    <div
      role="group"
      aria-label="Nouveau bonus"
      {...ECHAP_LOCAL}
      className="mt-3 space-y-2 rounded-xl border border-border p-3"
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
          e.preventDefault();
          valider();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          onAnnuler();
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_7rem]">
        <div className="space-y-1">
          <label htmlFor={`${id}-a`} className="text-xs text-muted-foreground">
            Attribut
          </label>
          <SelectField
            id={`${id}-a`}
            value={attribut}
            onValueChange={setAttribut}
            className="h-9 px-2 text-[13px]"
            options={groupes.flatMap((g): (SelectOption | SelectOptionGroup)[] => {
              const options = attributs
                .filter((x) => (x.groupe ?? '') === g)
                .map((x) => ({ valeur: x.cle, nom: x.nom }));
              return g ? [{ groupe: g, options }] : options;
            })}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-v`} className="text-xs text-muted-foreground">
            Valeur
          </label>
          <Input
            id={`${id}-v`}
            value={valeur}
            spellCheck={false}
            aria-invalid={erreurs.length ? true : undefined}
            aria-describedby={`${id}-e`}
            onChange={(e) => setValeur(e.target.value)}
            className="h-9 px-2 font-mono text-[13px]"
          />
        </div>
      </div>
      <Input
        aria-label="Description (facultative)"
        placeholder="Description (facultative)"
        value={description}
        maxLength={200}
        onChange={(e) => setDescription(e.target.value)}
        className="h-9 px-2 text-[13px]"
      />
      <p
        id={`${id}-e`}
        role={erreurs.length ? 'alert' : undefined}
        className="min-h-4 text-xs text-destructive"
      >
        {erreurs.join(' ; ')}
      </p>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onAnnuler}>
          Annuler
        </Button>
        <Button type="button" size="sm" disabled={!effet || erreurs.length > 0} onClick={valider}>
          <Plus /> Ajouter le bonus
        </Button>
      </div>
    </div>
  );
}
