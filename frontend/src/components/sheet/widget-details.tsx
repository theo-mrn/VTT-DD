'use client';

import type { Attribut, Widget } from '@vtt/rules';
import { Check, Pencil, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './context';
import { DialoguePossession } from './possession-dialog';
import { Bloc } from './elements';
import { formaterValeur } from './format';
import { boutonIcone, champ, focus, texte, texteAccent, texteSecondaire } from './styles';

type WidgetDetails = Extract<Widget, { type: 'details' }>;

/** Résumé : entrées uniques (espèce, carrière…) et attributs courts (texte, choix). */
export function WidgetDetails({ widget }: { widget: WidgetDetails }) {
  const { systeme, fiche, json, personnage } = useFiche();
  const [ouverte, setOuverte] = useState<{ entree: string; sorte: string } | null>(null);
  const sortes = widget.sortes.flatMap((id) => {
    const s = systeme.sortes.get(id);
    return s ? [s] : [];
  });
  const attributs = widget.attributs.flatMap((c) => {
    const a = fiche.entite.attributs.get(c);
    return a ? [a] : [];
  });
  const sorteOuverte = ouverte ? systeme.sortes.get(ouverte.sorte) : undefined;

  return (
    <Bloc titre={widget.titre}>
      <dl className="grid grid-cols-1 gap-x-4 gap-y-3 xs:grid-cols-2">
        {sortes.map((s) => {
          const possedees = json.possessions.filter((p) => p.sorte === s.id);
          return (
            <div key={s.id} className="min-w-0">
              <dt className={cn(texteSecondaire, 'text-xs uppercase tracking-wide')}>
                {possedees.length > 1 ? (s.nomPluriel ?? s.nom) : s.nom}
              </dt>
              <dd className="text-sm">
                {possedees.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {possedees.map((p) => (
                      <button
                        key={p.entree}
                        type="button"
                        onClick={() => setOuverte({ entree: p.entree, sorte: s.id })}
                        className={cn(texte, 'rounded text-left hover:underline', focus)}
                      >
                        {p.nom}
                      </button>
                    ))}
                  </span>
                ) : personnage.etat.creation ? (
                  <Link
                    href={`/characters/${personnage.id}/creation`}
                    className={cn(texteAccent, 'rounded hover:underline', focus)}
                  >
                    À choisir
                  </Link>
                ) : (
                  <span className={texteSecondaire}>—</span>
                )}
              </dd>
            </div>
          );
        })}
        {attributs.map((a) => (
          <DetailAttribut key={a.cle} attribut={a} />
        ))}
      </dl>
      {ouverte && sorteOuverte && (
        <DialoguePossession
          entree={ouverte.entree}
          sorte={sorteOuverte}
          onFermer={() => setOuverte(null)}
        />
      )}
    </Bloc>
  );
}

function DetailAttribut({ attribut: a }: { attribut: Attribut }) {
  const { json, lectureSeule, fixerValeurs } = useFiche();
  const v = json.valeurs[a.cle]?.valeur;
  const modifiable = !lectureSeule && (a.nature === 'texte' || a.nature === 'choix');
  const [edition, setEdition] = useState(false);
  const [saisie, setSaisie] = useState('');
  const id = `detail-${a.cle}`;

  const valider = async () => {
    if (saisie !== (typeof v === 'string' ? v : '')) await fixerValeurs({ [a.cle]: saisie });
    setEdition(false);
  };

  return (
    <div className="min-w-0">
      <dt className={cn(texteSecondaire, 'text-xs uppercase tracking-wide')}>
        {edition ? <label htmlFor={id}>{a.nom}</label> : a.nom}
      </dt>
      <dd className="text-sm">
        {edition ? (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void valider();
            }}
          >
            {a.nature === 'choix' ? (
              <select
                id={id}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                className={champ}
                autoFocus
              >
                <option value="">—</option>
                {a.options.map((o) => (
                  <option key={o.valeur} value={o.valeur}>
                    {o.nom}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                value={saisie}
                onChange={(e) => setSaisie(e.target.value)}
                className={champ}
                autoFocus
                onKeyDown={(e) => e.key === 'Escape' && setEdition(false)}
              />
            )}
            <button type="submit" className={cn(boutonIcone, 'h-8 w-8')} aria-label="Enregistrer">
              <Check className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(boutonIcone, 'h-8 w-8')}
              aria-label="Annuler"
              onClick={() => setEdition(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </form>
        ) : (
          <span className="group flex items-center gap-1.5">
            <span className={cn(texte, 'min-w-0 break-words')}>{formaterValeur(a, v)}</span>
            {modifiable && (
              <button
                type="button"
                className={cn(
                  texteSecondaire,
                  'rounded p-1 hover:text-[color:var(--fiche-accent)]',
                  focus,
                )}
                aria-label={`Modifier ${a.nom}`}
                onClick={() => {
                  setSaisie(typeof v === 'string' ? v : '');
                  setEdition(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        )}
      </dd>
    </div>
  );
}
