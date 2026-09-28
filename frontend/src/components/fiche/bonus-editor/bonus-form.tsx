'use client';

/**
 * Saisie d'un bonus propre (objet de l'inventaire, compétence, talent) : un attribut
 * numérique du personnage et une valeur, vérifiés par le moteur comme le fera le service.
 */
import type { Effet, Fiche, Sorte } from '@vtt/rules';
import { Plus } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField, type SelectOption, type SelectOptionGroup } from '@/components/ui/select';
import { ECHAP_LOCAL } from './escape';
import { attributsBonus, effetBonus, erreursBonus } from './model';

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
