'use client';

import type { Widget } from '@vtt/rules';
import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './context';
import { Bloc, VideFiche } from './elements';
import { boutonAccent, boutonSecondaire, champ, texte } from './styles';

type WidgetTexte = Extract<Widget, { type: 'texte' }>;

/** Texte libre (historique, motivation…), modifiable si l'attribut est saisissable. */
export function WidgetTexte({ widget }: { widget: WidgetTexte }) {
  const { fiche, json, lectureSeule, fixerValeurs } = useFiche();
  const a = fiche.entite.attributs.get(widget.attribut);
  const brut = json.valeurs[widget.attribut]?.valeur;
  const valeur = typeof brut === 'string' ? brut : brut === undefined ? '' : String(brut);
  const [saisie, setSaisie] = useState(valeur);
  const [envoi, setEnvoi] = useState(false);
  const id = useId();
  const modifiable = !lectureSeule && a?.nature === 'texte';
  const modifie = saisie !== valeur;

  useEffect(() => setSaisie(valeur), [valeur]);

  return (
    <Bloc titre={widget.titre}>
      {modifiable ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setEnvoi(true);
            await fixerValeurs({ [widget.attribut]: saisie });
            setEnvoi(false);
          }}
        >
          <label htmlFor={id} className="sr-only">
            {widget.titre}
          </label>
          <textarea
            id={id}
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            rows={5}
            placeholder={a?.description ?? `${widget.titre}…`}
            className={cn(champ, 'h-auto min-h-28 resize-y py-2 leading-relaxed')}
          />
          {modifie && (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={boutonSecondaire}
                onClick={() => setSaisie(valeur)}
                disabled={envoi}
              >
                Annuler
              </button>
              <button type="submit" className={boutonAccent} disabled={envoi}>
                Enregistrer
              </button>
            </div>
          )}
        </form>
      ) : valeur ? (
        <p className={cn(texte, 'whitespace-pre-line text-sm leading-relaxed')}>{valeur}</p>
      ) : (
        <VideFiche>Rien d&apos;écrit pour l&apos;instant.</VideFiche>
      )}
    </Bloc>
  );
}
