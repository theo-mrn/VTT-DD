'use client';

import {
  repartirEtape,
  saisirEtape,
  type Attribut,
  type EtapeCreation,
  type EtatEntite,
  type EtatEtape,
  type Fiche,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { afficherModificateur } from '@/lib/creation';
import type { OperationCreation } from '@/lib/personnages';
import { cn } from '@/lib/utils';

type EtapeSaisir = Extract<EtapeCreation, { type: 'saisir' }>;
type EtapeRepartir = Extract<EtapeCreation, { type: 'repartir' }>;

function vises(
  fiche: Fiche,
  e: { attributs?: string[]; groupe?: string },
  filtre: (a: Attribut) => boolean,
) {
  return [...fiche.entite.attributs.values()].filter(
    (a) =>
      filtre(a) &&
      ((e.attributs?.includes(a.cle) ?? false) ||
        (e.groupe !== undefined && a.groupe === e.groupe)),
  );
}

/**
 * Étape « saisir » : un champ par attribut, selon sa nature. La saisie est
 * gardée localement ; l'état n'est mis à jour que si le moteur l'accepte.
 */
export function EtapeSaisir({
  systeme,
  etat,
  fiche,
  etape,
  onEtat,
}: Readonly<{
  systeme: SystemeCharge;
  etat: EtatEntite;
  fiche: Fiche;
  etape: EtapeSaisir;
  /** Nouvel état calculé localement (aperçu) et l'écriture à envoyer au service. */
  onEtat: (e: EtatEntite, op: OperationCreation) => void;
}>) {
  const attributs = vises(fiche, etape, (a) => a.nature !== 'derivee');
  const [local, setLocal] = useState<Record<string, string>>({});
  const [erreurs, setErreurs] = useState<Record<string, string>>({});

  function enregistrer(a: Attribut, v: Valeur) {
    const r = saisirEtape(systeme, etat, etape.id, { [a.cle]: v });
    if (r.ok) {
      setErreurs(({ [a.cle]: _, ...reste }) => reste);
      onEtat(r.etat, { type: 'etape', etape: etape.id, corps: { valeurs: { [a.cle]: v } } });
    } else setErreurs((x) => ({ ...x, [a.cle]: r.erreur }));
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      {attributs.map((a) => {
        const id = `saisir-${a.cle}`;
        const actuel = etat.valeurs[a.cle];
        const large = a.nature === 'texte' && a.multiligne;
        return (
          <div key={a.cle} className={cn('space-y-2', large && 'sm:col-span-2')}>
            <Label htmlFor={id}>{a.nom}</Label>
            {a.nature === 'texte' ? (
              a.multiligne ? (
                <Textarea
                  id={id}
                  defaultValue={typeof actuel === 'string' ? actuel : ''}
                  onBlur={(e) => enregistrer(a, e.target.value)}
                  className="min-h-[120px]"
                />
              ) : (
                <Input
                  id={id}
                  defaultValue={typeof actuel === 'string' ? actuel : ''}
                  onBlur={(e) => enregistrer(a, e.target.value)}
                />
              )
            ) : a.nature === 'choix' ? (
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={a.nom}>
                {a.options.map((o) => (
                  <button
                    key={o.valeur}
                    type="button"
                    role="radio"
                    aria-checked={actuel === o.valeur}
                    onClick={() => enregistrer(a, o.valeur)}
                    className={cn(
                      'h-9 rounded-lg border px-3.5 text-[13px] transition-colors',
                      actuel === o.valeur
                        ? 'border-primary/60 bg-primary/15 text-primary-strong'
                        : 'border-border-strong text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {o.nom}
                  </button>
                ))}
              </div>
            ) : a.nature === 'booleen' ? (
              <Switch
                id={id}
                checked={actuel === true}
                onCheckedChange={(v) => enregistrer(a, v)}
              />
            ) : (
              <Input
                id={id}
                type="number"
                inputMode="numeric"
                value={local[a.cle] ?? (typeof actuel === 'number' ? String(actuel) : '')}
                onChange={(e) => setLocal((x) => ({ ...x, [a.cle]: e.target.value }))}
                onBlur={(e) => {
                  if (e.target.value !== '') enregistrer(a, Number(e.target.value));
                }}
                className="font-mono"
              />
            )}
            {a.description && <p className="text-xs text-subtle">{a.description}</p>}
            {erreurs[a.cle] && <p className="text-xs text-destructive">{erreurs[a.cle]}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** Étape « répartir » : un budget de points, des compteurs par attribut. */
export function EtapeRepartir({
  systeme,
  etat,
  fiche,
  etape,
  statut,
  onEtat,
}: Readonly<{
  systeme: SystemeCharge;
  etat: EtatEntite;
  fiche: Fiche;
  etape: EtapeRepartir;
  statut: EtatEtape | undefined;
  /** Nouvel état calculé localement (aperçu) et l'écriture à envoyer au service. */
  onEtat: (e: EtatEntite, op: OperationCreation) => void;
}>) {
  const [erreur, setErreur] = useState<string | null>(null);
  const attributs = vises(fiche, etape, (a) => a.nature === 'base');
  const budget = statut?.budget ?? 0;
  const depense = statut?.depense ?? 0;

  function changer(a: Attribut & { nature: 'base' }, delta: number) {
    const actuel =
      typeof etat.valeurs[a.cle] === 'number' ? (etat.valeurs[a.cle] as number) : a.defaut;
    const valeurs = { [a.cle]: actuel + delta };
    const r = repartirEtape(systeme, etat, etape.id, valeurs);
    if (r.ok) {
      setErreur(null);
      onEtat(r.etat, { type: 'etape', etape: etape.id, corps: { valeurs } });
    } else setErreur(r.erreur);
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-surface">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-sm font-semibold">Points dépensés</p>
          <p
            className={cn(
              'font-mono text-lg font-semibold',
              depense > budget ? 'text-destructive' : 'text-primary',
            )}
          >
            {depense} / {budget}
          </p>
        </div>
        <Progress
          valeur={budget ? (depense / budget) * 100 : 0}
          ton={depense > budget ? 'danger' : 'primaire'}
        />
      </div>
      {erreur && <p className="text-[13px] text-destructive">{erreur}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {attributs.map((a) => {
          if (a.nature !== 'base') return null;
          const v = fiche.valeurs.get(a.cle);
          return (
            <div
              key={a.cle}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-surface"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.nom}</p>
                {v?.modificateur !== undefined && (
                  <p className="font-mono text-xs text-primary">
                    {afficherModificateur(v.modificateur)}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => changer(a, -1)}
                className="flex size-8 items-center justify-center rounded-lg border border-border-strong text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Diminuer ${a.nom}`}
              >
                <Minus className="size-4" />
              </button>
              <span className="w-8 text-center font-mono text-xl font-semibold tabular">
                {v ? String(v.valeur) : a.defaut}
              </span>
              <button
                type="button"
                onClick={() => changer(a, 1)}
                className="flex size-8 items-center justify-center rounded-lg border border-border-strong text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Augmenter ${a.nom}`}
              >
                <Plus className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
