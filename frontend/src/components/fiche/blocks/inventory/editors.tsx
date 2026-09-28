'use client';

/**
 * Éditeurs partagés par le détail d'un objet (item-panel) et la configuration d'un objet
 * avant son ajout (item-config) : valeur d'un champ de la sorte, formule en clés nues
 * vérifiée en direct, liste des bonus propres (leur saisie : bonus-editor). Tout vient de la
 * sorte et du système.
 */
import type { Sorte } from '@vtt/rules';
import { Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { ECHAP_LOCAL } from '../../bonus-editor/escape';
import type { BonusPropre, FormuleVerifiee, ValeurChamp } from './model';

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
