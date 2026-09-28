import { describe, expect, it } from 'vitest';
import { charger } from '../chargement/index.js';
import { miniSymboles } from '../test/mini-systemes.js';
import { verifierPresentation } from './presentation.js';

const r = charger(miniSymboles);
if (!r.ok) throw new Error();
const systeme = r.systeme;

const valide = {
  format: 1,
  systeme: 'mini-symboles',
  theme: { couleurs: { fond: '#0b0b0c', accent: '#ffe81f' }, polices: { titres: 'Orbitron' } },
  des: {
    sortes: {
      aptitude: { skin: 'kyber_vert', couleur: '#3fbf6a', forme: 'd8' },
      d20: { couleur: '#ffffff', forme: 'd20' },
    },
    glyphes: { base: '●', ameliore: '▲' },
  },
  symboles: {
    succes: { icone: 'check', couleur: '#10b981' },
    succesNets: { icone: 'check', couleur: '#10b981' },
  },
  ressources: { Blessures: { sens: 'montant' } },
  fiches: {
    personnage: {
      widgets: [
        { type: 'attributs', titre: 'Caractéristiques', groupe: 'carac' },
        { type: 'ressources', titre: 'Vitalité', attributs: ['Blessures'] },
        { type: 'possessions', titre: 'Compétences', sorte: 'competence' },
        { type: 'details', titre: 'Détails', sortes: ['espece', 'carriere'] },
        { type: 'competences', titre: 'Talents', sortes: ['competence'], vue: 'progression' },
      ],
    },
  },
  images: { bothan: 'https://exemple.fr/bothan.png' },
};

describe('présentation', () => {
  it('accepte une présentation cohérente', () => {
    expect(verifierPresentation(valide, systeme).ok).toBe(true);
  });

  it('refuse les références inconnues', () => {
    const r = verifierPresentation(
      {
        ...valide,
        des: { sortes: { kyber: { couleur: '#fff', forme: 'd6' } } },
        symboles: { force: { icone: 'x', couleur: '#000' } },
        ressources: { vigueur: { sens: 'montant' } },
        fiches: {
          personnage: {
            widgets: [
              { type: 'attributs', titre: 'X', attributs: ['FOR'] },
              { type: 'possessions', titre: 'Y', sorte: 'arme' },
            ],
          },
        },
        images: { wookiee: 'x' },
      },
      systeme,
    );
    expect(!r.ok && r.erreurs.map((e) => `${e.chemin} : ${e.message}`)).toEqual([
      'des/sortes/kyber : Dé inconnu : kyber',
      'symboles/force : Symbole ou résultat inconnu : force',
      'ressources/vigueur : Ressource inconnue : vigueur',
      'fiches/personnage/0 : Attribut inconnu de personnage : FOR',
      'fiches/personnage/1 : Sorte inconnue : arme',
      'images/wookiee : Entrée ou type d’entité inconnu : wookiee',
    ]);
  });

  it('vérifie les sortes et le champ de filtre du bloc Compétences', () => {
    const r = verifierPresentation(
      {
        ...valide,
        fiches: {
          personnage: {
            widgets: [
              { type: 'competences', titre: 'A', sortes: ['arme'] },
              { type: 'competences', titre: 'B', sortes: ['competence'], filtreChamp: 'poids' },
              {
                type: 'competences',
                titre: 'C',
                sortes: ['competence'],
                filtreChamp: 'caracteristique',
              },
              { type: 'competences', titre: 'D' },
            ],
          },
        },
      },
      systeme,
    );
    expect(!r.ok && r.erreurs.map((e) => `${e.chemin} : ${e.message}`)).toEqual([
      'fiches/personnage/0 : Sorte inconnue : arme',
      'fiches/personnage/1 : Champ inconnu des sortes competence : poids',
    ]);
  });

  it('refuse l’ancien bloc Arbre, remplacé par le bloc Compétences', () => {
    const r = verifierPresentation(
      { ...valide, fiches: { personnage: { widgets: [{ type: 'arbres', titre: 'Talents' }] } } },
      systeme,
    );
    expect(r.ok).toBe(false);
  });
});
