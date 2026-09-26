'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { BedDouble, Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './contexte';
import { Bloc, Explication, VideFiche } from './elements';
import { formaterNombre } from './format';
import { boutonIcone, boutonSecondaire, caseValeur, champ, texte, texteSecondaire } from './styles';

type WidgetRessources = Extract<Widget, { type: 'ressources' }>;
type Ressource = Extract<Attribut, { nature: 'ressource' }>;
export type Sens = 'descendant' | 'montant';

/**
 * Sens d'une jauge : celui de la présentation, sinon déduit de la récupération
 * (une ressource qui se récupère vers son maximum part pleine et descend).
 */
export function sensRessource(sensPresentation: Sens | undefined, a: Ressource): Sens {
  return sensPresentation ?? (a.recuperation === 'max' ? 'descendant' : 'montant');
}

export function WidgetRessources({ widget }: { widget: WidgetRessources }) {
  const { fiche, lectureSeule, repos } = useFiche();
  const [repos_, setRepos] = useState(false);
  const ressources = widget.attributs
    .map((c) => fiche.entite.attributs.get(c))
    .filter((a): a is Ressource => a?.nature === 'ressource');

  return (
    <Bloc
      titre={widget.titre}
      action={
        !lectureSeule && ressources.length ? (
          <button
            type="button"
            className={cn(boutonSecondaire, 'min-h-8 px-2.5 text-xs')}
            disabled={repos_}
            onClick={async () => {
              setRepos(true);
              await repos(ressources.map((a) => a.cle));
              setRepos(false);
            }}
            title="Ramène chaque ressource de ce bloc à sa valeur de repos"
          >
            <BedDouble />
            Repos
          </button>
        ) : undefined
      }
    >
      {ressources.length ? (
        <div className="space-y-3">
          {ressources.map((a) => (
            <LigneRessource key={a.cle} attribut={a} />
          ))}
        </div>
      ) : (
        <VideFiche>Aucune ressource.</VideFiche>
      )}
    </Bloc>
  );
}

function LigneRessource({ attribut: a }: { attribut: Ressource }) {
  const { json, presentation, lectureSeule, fixerValeurs } = useFiche();
  const v = json.valeurs[a.cle];
  const valeur = typeof v?.valeur === 'number' ? v.valeur : 0;
  const min = v?.min ?? 0;
  const max = v?.max ?? 0;
  const apparence = presentation.ressources[a.cle];
  const sens = sensRessource(apparence?.sens, a);
  const couleur = apparence?.couleur ?? 'var(--fiche-accent)';
  const etendue = max - min;
  const part = etendue > 0 ? Math.min(1, Math.max(0, (valeur - min) / etendue)) : 0;
  // Alerte : jauge descendante presque vide, ou jauge montante au seuil (ou au-delà)
  const alerte = sens === 'descendant' ? part <= 0.25 : valeur >= max && max > min;
  const depasse = valeur > max;
  const [saisie, setSaisie] = useState(String(valeur));
  const id = `ressource-${a.cle}`;

  useEffect(() => setSaisie(String(valeur)), [valeur]);

  const borner = (n: number) => Math.max(min, a.plafonnee ? Math.min(max, n) : n);
  const fixer = (n: number) => {
    const b = borner(Math.round(n));
    setSaisie(String(b));
    if (b !== valeur) void fixerValeurs({ [a.cle]: b });
  };

  return (
    <div className={cn(caseValeur, 'p-3')}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <label
          htmlFor={lectureSeule ? undefined : id}
          className={cn(texte, 'text-sm font-medium')}
          title={a.description}
        >
          {a.nom}
        </label>
        <Explication titre={a.nom} detail={v?.detail} className="w-auto rounded">
          <span className={cn(texte, 'text-sm tabular-nums')}>
            <span className="text-base font-semibold">{formaterNombre(valeur)}</span>
            <span className={texteSecondaire}> / {formaterNombre(max)}</span>
          </span>
        </Explication>
      </div>
      <div
        role="meter"
        aria-label={`${a.nom}${sens === 'montant' ? ' (se remplit)' : ''}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={valeur}
        aria-valuetext={`${formaterNombre(valeur)} sur ${formaterNombre(max)}${depasse ? ', seuil dépassé' : ''}`}
        className="h-3 overflow-hidden rounded-full bg-[color:var(--fiche-carte)] ring-1 ring-[color:var(--fiche-bordure)]"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-300',
            depasse && 'animate-pulse',
          )}
          style={{
            width: `${part * 100}%`,
            background: alerte ? '#ef4444' : couleur,
          }}
        />
      </div>
      {!lectureSeule && (
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className={boutonIcone}
            aria-label={`${a.nom} : retirer 1`}
            disabled={valeur <= min}
            onClick={() => fixer(valeur - 1)}
          >
            <Minus className="h-4 w-4" />
          </button>
          <input
            id={id}
            type="number"
            inputMode="numeric"
            value={saisie}
            min={min}
            max={a.plafonnee ? max : undefined}
            onChange={(e) => setSaisie(e.target.value)}
            onBlur={() => {
              const n = Number(saisie);
              if (saisie.trim() === '' || !Number.isFinite(n)) setSaisie(String(valeur));
              else fixer(n);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className={cn(champ, 'w-20 text-center tabular-nums')}
          />
          <button
            type="button"
            className={boutonIcone}
            aria-label={`${a.nom} : ajouter 1`}
            disabled={a.plafonnee && valeur >= max}
            onClick={() => fixer(valeur + 1)}
          >
            <Plus className="h-4 w-4" />
          </button>
          <span className={cn(texteSecondaire, 'ml-auto text-xs')}>
            {sens === 'montant' ? 'se remplit' : 'se vide'}
            {depasse ? ' · seuil dépassé' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
