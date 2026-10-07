/**
 * Effets donnés (docs/combat.md § 19.2) : une entrée qui déclare `donne` engendre, au
 * chargement, l'état qui les porte ; l'action le donne aux cibles, avec sa durée.
 */
import { describe, expect, it } from 'vitest';
import { calculer } from '../calcul/index.js';
import { aleatoireImpose } from '../formules/index.js';
import { executerAction, appliquerModifications } from '../jets/index.js';
import { EtatEntite, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { charger, idEffetsDonnes } from './index.js';

const saisi: SystemeSaisi = {
  ...miniD20,
  effetsDonnes: { sorte: 'etat', champ: 'donne' },
  sortes: [
    ...miniD20.sortes!,
    { id: 'etat', nom: 'État', pour: ['personnage'] },
    {
      id: 'pouvoir',
      nom: 'Pouvoir',
      pour: ['personnage'],
      champs: [
        { id: 'donne', nom: 'Effets donnés', type: 'texte', defaut: '' },
        { id: 'dureeDonne', nom: 'Durée', type: 'formule', des: true },
      ],
    },
  ],
  catalogue: [
    ...miniD20.catalogue!,
    {
      id: 'chant',
      sorte: 'pouvoir',
      nom: 'Chant de guerre',
      description: 'Les alliés gagnent +3 en FOR.',
      champs: { dureeDonne: '1d4' },
      donne: [{ sur: 'attribut', attribut: 'FOR', operation: 'ajouter', valeur: 3 }],
    },
  ],
  actions: [
    {
      id: 'jouer',
      nom: 'Jouer un pouvoir',
      pour: ['personnage'],
      cible: 'personnage',
      parametres: [{ id: 'pouvoir', nom: 'Pouvoir', type: 'entree', sorte: 'pouvoir' }],
      jet: { type: 'numerique', formule: '0' },
      consequences: [
        {
          entite: 'cible',
          entreeCalculee: 'pouvoir.donne',
          operation: 'donner',
          duree: 'pouvoir.dureeDonne',
        },
      ],
    },
  ],
};

const etat = (possessions: { entree: string }[] = []) =>
  EtatEntite.parse({
    type: 'personnage',
    systeme: { id: miniD20.id, version: '1.0.0' },
    valeurs: { niveau: 1, FOR: 10 },
    possessions,
  });

describe('effets donnés', () => {
  it('dépliés en un état nommé comme l’entrée, son identifiant dans le champ', () => {
    const r = charger(saisi);
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    const porte = r.systeme.entrees.get(idEffetsDonnes('chant'));
    expect(porte).toMatchObject({ sorte: 'etat', nom: 'Chant de guerre' });
    expect(r.systeme.entrees.get('chant')?.champs.donne).toBe('chant--effets');
  });

  it('l’action les donne aux cibles pour leur durée', () => {
    const r = charger(saisi);
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    const s = r.systeme;
    const res = executerAction(s, {
      action: 'jouer',
      acteur: calculer(s, etat([{ entree: 'chant' }])),
      cible: calculer(s, etat()),
      parametres: { pouvoir: 'chant' },
      aleatoire: aleatoireImpose([3]),
    });
    if (!res.ok) throw new Error(JSON.stringify(res.erreurs));
    expect(res.resultat.modifications).toEqual([
      expect.objectContaining({ entite: 'cible', entree: 'chant--effets', duree: 3 }),
    ]);
    const cible = calculer(s, etat());
    const apres = calculer(s, appliquerModifications(cible, res.resultat.modifications, 'cible'));
    expect(apres.valeur('FOR')).toBe(13);
  });

  it('refusés sans déclaration du système', () => {
    const { effetsDonnes: _, ...sans } = saisi;
    expect(charger(sans).ok).toBe(false);
  });
});
