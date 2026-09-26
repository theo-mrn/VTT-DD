import { describe, expect, it } from 'vitest';
import type { SystemeSaisi } from '../schema/index.js';
import { miniD20, miniSymboles } from '../test/mini-systemes.js';
import { charger } from './charger.js';

const erreurs = (s: unknown) => {
  const r = charger(s);
  return r.ok ? [] : r.erreurs.map((e) => `${e.chemin} : ${e.message}`);
};

/** Copie profonde du mini d20 modifiée par `f`. */
const variante = (f: (s: SystemeSaisi & Record<string, any>) => void): SystemeSaisi => {
  const s = structuredClone(miniD20) as SystemeSaisi & Record<string, any>;
  f(s);
  return s;
};

describe('chargement', () => {
  it('charge les systèmes de référence', () => {
    expect(erreurs(miniD20)).toEqual([]);
    expect(erreurs(miniSymboles)).toEqual([]);
  });

  it('ordonne les attributs par dépendances', () => {
    const r = charger(miniD20);
    if (!r.ok) throw new Error();
    const ordre = r.systeme.entites.get('personnage')!.ordre;
    expect(ordre.indexOf('DEX')).toBeLessThan(ordre.indexOf('Defense'));
    expect(ordre.indexOf('PV_Max')).toBeLessThan(ordre.indexOf('PV'));
    expect(ordre.indexOf('niveau')).toBeLessThan(ordre.indexOf('Contact'));
  });

  it('refuse une forme invalide avec son chemin', () => {
    expect(erreurs({ format: 1, id: 'x', version: '1', nom: 'X', entites: [] })).toEqual([
      'version : Version au format x.y.z',
      'entites : Too small: expected array to have >=1 items',
    ]);
    expect(erreurs(variante((s) => (s.entites[0].attributs[0].cle = 'F-O-R')))[0]).toContain(
      'Lettres, chiffres',
    );
  });

  it('signale les formules invalides à leur chemin exact', () => {
    const e = erreurs(
      variante((s) => {
        s.entites[0].attributs[4].formule = '10 + mod(@DEXX)';
        s.achats[0].cout = 'cible +';
      }),
    );
    expect(e).toEqual([
      'entites/personnage/Defense/formule : Attribut inconnu : @DEXX',
      'achats/carac/cout : Formule incomplète',
    ]);
  });

  it('détecte les dépendances circulaires, y compris via un effet', () => {
    expect(
      erreurs(
        variante((s) => {
          s.entites[0].attributs.push(
            { cle: 'A', nom: 'A', nature: 'derivee', formule: '@B' },
            { cle: 'B', nom: 'B', nature: 'derivee', formule: '@A + 1' },
          );
        }),
      ),
    ).toEqual(['entites/personnage : Dépendance circulaire : A → B → A']);

    expect(
      erreurs(
        variante((s) => {
          s.catalogue.push({
            id: 'boucle',
            sorte: 'don',
            nom: 'Boucle',
            effets: [
              { sur: 'attribut', attribut: 'DEX', operation: 'ajouter', valeur: '@Defense' },
            ],
          });
        }),
      ),
    ).toEqual(['entites/personnage : Dépendance circulaire : DEX → Defense → DEX']);
  });

  it('vérifie les références croisées', () => {
    const e = erreurs(
      variante((s) => {
        s.catalogue.push({ id: 'x', sorte: 'inconnue', nom: 'X' });
        s.catalogue.push({
          id: 'y',
          sorte: 'objet',
          nom: 'Y',
          champs: { bonus: 'deux', poids: 3 },
        });
        s.catalogue.push({ id: 'elfe', sorte: 'race', nom: 'Doublon' });
        s.achats.push({
          id: 'z',
          nom: 'Z',
          obtient: { type: 'rang', sorte: 'objet' },
          monnaie: 'or',
          cout: 1,
        });
        s.actions[0].consequences.push({
          entite: 'cible',
          attribut: 'Defense',
          operation: 'retirer',
          valeur: 1,
        });
        s.catalogue.push({
          id: 'w',
          sorte: 'don',
          nom: 'W',
          effets: [{ sur: 'attribut', attribut: 'nom', operation: 'ajouter', valeur: 1 }],
        });
      }),
    );
    expect(e).toEqual([
      'catalogue : Entrée en double : elfe',
      'catalogue/x : Sorte inconnue : inconnue',
      'catalogue/y/champs/bonus : nombre attendu',
      'catalogue/y/champs/poids : Champ inconnu pour la sorte objet',
      'catalogue/w/effets/0/attribut : Seul « fixer » s’applique à un attribut non numérique (nom)',
      'catalogue/w/effets/0/valeur : Résultat de type texte attendu, nombre obtenu',
      'achats/z : Monnaie inconnue : or',
      'achats/z : Sorte à rangs attendue : objet',
      'actions/attaque/consequences/1 : Attribut de base ou ressource attendu : Defense',
    ]);
  });

  it('interdit les dés dans un attribut et les marques inconnues', () => {
    expect(
      erreurs(
        variante((s) => {
          s.entites[0].attributs[4].formule = '1d6';
          s.achats[0].condition = 'marque("heroique")';
        }),
      ),
    ).toEqual([
      'entites/personnage/Defense/formule : Les dés ne sont pas permis ici',
      'achats/carac/condition : Marque jamais posée : heroique',
    ]);
  });
});
