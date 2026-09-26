'use client';

import type { Champ, Sorte } from '@vtt/rules';
import { Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useFiche } from './context';
import { EditeurChoix, aDesChoix, type Choix } from './choice-editor';
import { DialogueFiche } from './elements';
import { nomMarque, nomObjet } from './format';
import {
  achatRangSuivant,
  champLisible,
  derniereLigne,
  sorteLibre,
  valeurChamp,
} from './possessions';
import { BoutonAchat } from './purchase-button';
import {
  boutonAccent,
  boutonSecondaire,
  champ as styleChamp,
  pastille,
  texte,
  texteAccent,
  texteSecondaire,
} from './styles';

type ValeurChamp = number | string | boolean;

/** Champs propres à chaque exemplaire, modifiables sur la fiche (valeur, détail…). */
const estModifiable = (c: Champ) =>
  c.type === 'nombre' || c.type === 'texte' || c.type === 'booleen';

/** Détail d'une possession : description, champs, choix, achats et retrait. */
export function DialoguePossession({
  entree: id,
  sorte,
  onFermer,
}: {
  entree: string;
  sorte: Sorte;
  onFermer(): void;
}) {
  const {
    systeme,
    fiche,
    etat,
    json,
    achats,
    lectureSeule,
    acheter,
    rembourser,
    majPossession,
    retirerPossession,
  } = useFiche();
  const entree = systeme.entrees.get(id);
  const p = json.possessions.find((x) => x.entree === id);
  const explicite = etat.possessions.find((x) => x.entree === id);
  const [champs, setChamps] = useState<Record<string, ValeurChamp>>({});
  const [choix, setChoix] = useState<Choix>(() => ({ ...(explicite?.choix ?? {}) }));
  const [envoi, setEnvoi] = useState(false);
  if (!entree) return null;

  const suivant = achatRangSuivant(achats, id);
  const ligne = derniereLigne(etat, id);
  const libre = sorteLibre(systeme, sorte.id);
  const modifiables = explicite ? sorte.champs.filter(estModifiable) : [];
  const champsModifies = Object.keys(champs).length > 0;
  const choixModifies = JSON.stringify(choix) !== JSON.stringify(explicite?.choix ?? {});

  const executer = async (f: () => Promise<boolean>, fermer = false) => {
    setEnvoi(true);
    const ok = await f();
    setEnvoi(false);
    if (ok && fermer) onFermer();
    return ok;
  };

  return (
    <DialogueFiche ouvert onFermer={onFermer} titre={entree.nom} description={sorte.nom} large>
      {entree.description && (
        <p className={cn(texte, 'whitespace-pre-line text-sm leading-relaxed')}>
          {entree.description}
        </p>
      )}

      {(p || entree.etiquettes.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {p && sorte.rangs && (
            <span className={pastille}>
              Rang {p.rang}
              {p.rang > p.achete ? ` (${p.achete} acheté${p.achete > 1 ? 's' : ''})` : ''}
            </span>
          )}
          {p?.marques.map((m) => (
            <span key={m} className={cn(pastille, texteAccent)}>
              {nomMarque(m)}
            </span>
          ))}
          {entree.etiquettes.map((e) => (
            <span key={e} className={pastille}>
              {nomMarque(e)}
            </span>
          ))}
        </div>
      )}

      {p && p.sources.length > 0 && (
        <p className={cn(texteSecondaire, 'text-xs')}>
          Obtenu par : {p.sources.map((s) => nomObjet(systeme, etat.type, { objet: s })).join(', ')}
        </p>
      )}

      {sorte.champs.length > 0 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
          {sorte.champs.map((c) => {
            const v = valeurChamp(etat, entree, c);
            const modifiable = !lectureSeule && modifiables.some((m) => m.id === c.id);
            return (
              <div key={c.id} className="min-w-0">
                <dt className={cn(texteSecondaire, 'text-xs')}>
                  {modifiable ? <label htmlFor={`champ-${c.id}`}>{c.nom}</label> : c.nom}
                </dt>
                <dd className={cn(texte, 'text-sm')}>
                  {modifiable ? (
                    <ChampModifiable
                      id={`champ-${c.id}`}
                      champ={c}
                      valeur={(champs[c.id] ?? v) as ValeurChamp | undefined}
                      onChange={(x) => setChamps((m) => ({ ...m, [c.id]: x }))}
                    />
                  ) : (
                    champLisible(systeme, etat.type, c, v)
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {champsModifies && (
        <button
          type="button"
          className={boutonAccent}
          disabled={envoi}
          onClick={() =>
            executer(async () => {
              const ok = await majPossession({ entree: id, champs });
              if (ok) setChamps({});
              return ok;
            })
          }
        >
          Enregistrer les valeurs
        </button>
      )}

      {explicite && aDesChoix(entree) && (
        <div className="space-y-3 rounded-xl border border-[color:var(--fiche-bordure)] p-3">
          <EditeurChoix
            fiche={fiche}
            entree={entree}
            valeur={choix}
            onChange={setChoix}
            desactive={lectureSeule || envoi}
          />
          {!lectureSeule && choixModifies && (
            <button
              type="button"
              className={boutonAccent}
              disabled={envoi}
              onClick={() => executer(() => majPossession({ entree: id, choix }))}
            >
              Enregistrer les choix
            </button>
          )}
        </div>
      )}

      {!lectureSeule && (
        <div className="flex flex-wrap gap-2 border-t border-[color:var(--fiche-bordure)] pt-4">
          {suivant && (
            <BoutonAchat
              objet={suivant}
              libelle={`Acheter le rang ${suivant.cible}`}
              monnaie={systeme.monnaies.get(suivant.monnaie)?.nom ?? suivant.monnaie}
              texteBouton={`Rang ${suivant.cible} · ${suivant.cout} ${systeme.monnaies.get(suivant.monnaie)?.nom ?? ''}`}
              onAcheter={() => acheter(suivant.achat, suivant.objet)}
            />
          )}
          {ligne >= 0 && (
            <button
              type="button"
              className={boutonSecondaire}
              disabled={envoi}
              onClick={() => executer(() => rembourser(ligne))}
              title={`Rend ${etat.journal[ligne]!.cout} ${systeme.monnaies.get(etat.journal[ligne]!.monnaie)?.nom ?? ''}`}
            >
              <Undo2 />
              Annuler le dernier achat
            </button>
          )}
          {libre && explicite && (
            <button
              type="button"
              className={cn(boutonSecondaire, 'text-red-400 hover:border-red-400')}
              disabled={envoi}
              onClick={() => executer(() => retirerPossession(id), true)}
            >
              <Trash2 />
              Retirer
            </button>
          )}
        </div>
      )}
    </DialogueFiche>
  );
}

function ChampModifiable({
  id,
  champ,
  valeur,
  onChange,
}: {
  id: string;
  champ: Champ;
  valeur: ValeurChamp | undefined;
  onChange(v: ValeurChamp): void;
}) {
  if (champ.type === 'booleen')
    return (
      <input
        id={id}
        type="checkbox"
        checked={valeur === true}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[color:var(--fiche-accent)]"
      />
    );
  if (champ.type === 'nombre')
    return (
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={typeof valeur === 'number' ? valeur : ''}
        onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
        className={cn(styleChamp, 'w-28')}
      />
    );
  return (
    <input
      id={id}
      type="text"
      value={typeof valeur === 'string' ? valeur : ''}
      onChange={(e) => onChange(e.target.value)}
      className={styleChamp}
    />
  );
}
