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

  it('polices du système : fichiers déclarés (woff2, woff, ttf, otf), rien d’autre', () => {
    const avec = (fichiers: unknown[]) =>
      verifierPresentation(
        { ...valide, theme: { ...valide.theme, polices: { titres: 'Orbitron', fichiers } } },
        systeme,
      );
    const ok = avec([
      { famille: 'Orbitron', fichier: 'Orbitron.woff2', graisse: '400 900' },
      { famille: 'Aurebesh', fichier: 'Aurebesh-Italic.ttf', style: 'italic' },
    ]);
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.presentation.theme?.polices.fichiers).toHaveLength(2);
    expect(avec([{ famille: 'X', fichier: '../secret.ttf' }]).ok).toBe(false);
    expect(avec([{ famille: 'X', fichier: 'police.exe' }]).ok).toBe(false);
  });

  it('carte : l’attribut du déplacement, connu d’un type d’entité', () => {
    const avec = (attribut: string) =>
      verifierPresentation({ ...valide, carte: { deplacement: { attribut } } }, systeme);
    const ok = avec('agilite');
    expect(ok.ok && ok.presentation.carte?.deplacement?.attribut).toBe('agilite');
    const ko = avec('vitesse');
    expect(!ko.ok && ko.erreurs).toEqual([
      { chemin: 'carte/deplacement', message: 'Attribut inconnu : vitesse' },
    ]);
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

  it('vérifie les ressources déclarées : sortes, champs, étiquettes, prix, attributs', () => {
    const ok = verifierPresentation(
      {
        ...valide,
        references: {
          capacites: {
            sections: [
              { titre: 'Espèces', sorte: 'espece' },
              {
                titre: 'Compétences',
                sorte: 'competence',
                groupePar: { champ: 'caracteristique' },
              },
            ],
          },
          marche: { prix: 'valeur', sortes: [{ sorte: 'obligation', colonnes: ['valeur'] }] },
          bestiaire: {
            statistiques: { personnage: [{ titre: 'Profil', attributs: ['vigueur'] }] },
          },
          images: { collections: [{ titre: 'Cartes', dossiers: ['Map'] }] },
        },
      },
      systeme,
    );
    expect(ok.ok).toBe(true);

    const r = verifierPresentation(
      {
        ...valide,
        references: {
          capacites: {
            sections: [
              { titre: 'A', sorte: 'arme' },
              { titre: 'B', sorte: 'talent', etiquette: 'prestige' },
              { titre: 'C', sorte: 'competence', groupePar: { champ: 'poids' } },
            ],
          },
          marche: {
            prix: 'prix',
            sortes: [{ sorte: 'competence', colonnes: ['degats'] }],
            textes: ['tarifs'],
          },
          bestiaire: {
            statistiques: {
              vehicule: [{ titre: 'X', attributs: ['coque'] }],
              personnage: [{ titre: 'Y', attributs: ['FOR'] }],
            },
          },
        },
      },
      systeme,
    );
    expect(!r.ok && r.erreurs.map((e) => `${e.chemin} : ${e.message}`)).toEqual([
      'references/capacites/sections/0 : Sorte inconnue : arme',
      'references/capacites/sections/1 : Aucune entrée talent n’a l’étiquette prestige',
      'references/capacites/sections/2 : Champ inconnu sur competence : poids',
      'references/marche/sortes/0 : Champ inconnu sur competence : degats',
      'references/marche/prix : Aucune sorte du marché n’a le champ prix',
      'references/marche/textes : Texte inconnu : tarifs',
      'references/bestiaire/statistiques/vehicule : Type d’entité inconnu : vehicule',
      'references/bestiaire/statistiques/personnage/0 : Attribut inconnu de personnage : FOR',
    ]);
  });
});
