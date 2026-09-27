import { describe, expect, it } from 'vitest';
import { charger, type SystemeCharge } from '../chargement/index.js';
import { EtatEntite, verifierPresentation, type SystemeSaisi } from '../schema/index.js';
import { miniD20 } from '../test/mini-systemes.js';
import { calculer } from './fiche.js';
import { ficheJson } from './json.js';
import { attributsJetables, declarationsJetables, grouperJetables } from './jetables.js';

type AttributSaisi = SystemeSaisi['entites'][number]['attributs'][number];

/** Mini d20 dont certains attributs déclarent `jet` (ou reçoivent d'autres modifications). */
function avecJets(modifs: Record<string, Partial<AttributSaisi>>, ajouts: AttributSaisi[] = []) {
  const s = structuredClone(miniD20);
  const e = s.entites[0]!;
  e.attributs = [
    ...e.attributs.map((a) => (modifs[a.cle] ? ({ ...a, ...modifs[a.cle] } as AttributSaisi) : a)),
    ...ajouts,
  ];
  return s;
}

function charge(s: unknown): SystemeCharge {
  const r = charger(s);
  if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
  return r.systeme;
}

const erreurs = (s: unknown) => {
  const r = charger(s);
  return r.ok ? [] : r.erreurs;
};

const JETS = {
  FOR: { jet: { apport: 'modificateur' } },
  DEX: { jet: { apport: 'modificateur' } },
  Contact: { jet: { apport: 'valeur' } },
  Defense: { jet: { apport: 'mod(@DEX) + @niveau' } },
} as const;

const systeme = charge(
  avecJets(JETS, [
    {
      cle: 'secret',
      nom: 'Secret',
      nature: 'base',
      defaut: 3,
      visibilite: 'mj',
      jet: { apport: 'valeur' },
    },
  ]),
);

const fiche = (valeurs: Record<string, number> = {}) =>
  calculer(
    systeme,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: systeme.source.id, version: systeme.source.version },
      valeurs,
    }),
  );

describe('jet des attributs : chargement', () => {
  it('accepte modificateur, valeur et formule', () => {
    expect(systeme.formules.has('entites/personnage/Defense/jet')).toBe(true);
    expect(systeme.formules.has('entites/personnage/FOR/jet')).toBe(false);
  });

  it('refuse un apport « modificateur » sans modificateur', () => {
    expect(erreurs(avecJets({ Contact: { jet: { apport: 'modificateur' } } }))).toEqual([
      {
        chemin: 'entites/personnage/Contact/jet',
        message: 'Apport « modificateur » sur un attribut sans modificateur',
      },
    ]);
  });

  it('refuse un apport « valeur » sur un attribut non numérique', () => {
    const e = erreurs(
      avecJets({}, [
        {
          cle: 'vivant',
          nom: 'Vivant',
          nature: 'derivee',
          type: 'booleen',
          formule: '@PV > 0',
          jet: { apport: 'valeur' },
        },
      ]),
    );
    expect(e.map((x) => x.chemin)).toEqual(['entites/personnage/vivant/jet']);
  });

  it('vérifie la formule : attributs existants, nombre, sans dé', () => {
    const inconnu = erreurs(avecJets({ FOR: { jet: { apport: 'mod(@INCONNU)' } } }));
    expect(inconnu[0]?.chemin).toBe('entites/personnage/FOR/jet');
    const texte = erreurs(avecJets({ FOR: { jet: { apport: '@nom' } } }));
    expect(texte).toHaveLength(1);
    const des = erreurs(avecJets({ FOR: { jet: { apport: '1d6 + mod(@FOR)' } } }));
    expect(des).toHaveLength(1);
    // Reprise dans le lanceur, la formule ne lit que les attributs
    const agregat = erreurs(avecJets({ FOR: { jet: { apport: 'compte("race")' } } }));
    expect(agregat).toHaveLength(1);
    const possede = erreurs(avecJets({ FOR: { jet: { apport: 'si(possede("elfe"), 1, 0)' } } }));
    expect(possede).toEqual([
      {
        chemin: 'entites/personnage/FOR/jet',
        message: 'rang() et possede() ne sont pas permis dans l’apport d’un jet',
      },
    ]);
  });

  it('une ressource peut servir aux jets', () => {
    const s = charge(avecJets({ PV: { jet: { apport: 'valeur' } } }));
    expect(declarationsJetables(s, 'personnage').map((d) => d.cle)).toEqual(['PV']);
  });
});

describe('jet des attributs : calcul de la fiche', () => {
  it('calcule l’apport de chaque attribut jetable', () => {
    const f = fiche({ FOR: 14, DEX: 8, niveau: 3 });
    expect(f.valeurs.get('FOR')!.jet).toBe(2);
    expect(f.valeurs.get('DEX')!.jet).toBe(-1);
    expect(f.valeurs.get('Contact')!.jet).toBe(5);
    expect(f.valeurs.get('Defense')!.jet).toBe(2);
    expect(f.valeurs.get('CON')!.jet).toBeUndefined();
    expect(ficheJson(f).valeurs.FOR!.jet).toBe(2);
    expect(ficheJson(f).valeurs.CON).not.toHaveProperty('jet');
  });
});

describe('attributsJetables', () => {
  it('sans présentation : ordre du système, groupé par groupe, sans le MJ', () => {
    const liste = attributsJetables(fiche({ FOR: 14, DEX: 8, niveau: 3 }));
    expect(liste.map((a) => [a.cle, a.apport, a.terme, a.groupe.titre])).toEqual([
      ['FOR', 2, 'mod(@FOR)', 'Caractéristiques'],
      ['DEX', -1, 'mod(@DEX)', 'Caractéristiques'],
      ['Defense', 2, '(mod(@DEX) + @niveau)', 'Combat'],
      ['Contact', 5, '@Contact', 'Combat'],
    ]);
    expect(liste.map((a) => a.genre)).toEqual([
      'modificateur',
      'modificateur',
      'formule',
      'valeur',
    ]);
  });

  it('le MJ voit aussi les attributs réservés ; un attribut sans groupe a un titre nul', () => {
    const liste = attributsJetables(fiche(), { mj: true });
    expect(liste.at(-1)).toMatchObject({ cle: 'secret', apport: 3, mj: true });
    expect(liste.at(-1)!.groupe).toEqual({ id: null, titre: null });
  });

  it('la présentation ordonne et regroupe ; le reste suit, groupé par groupe', () => {
    const presentation = {
      des: {
        sortes: {},
        jets: [
          { titre: 'Attaques', attributs: ['Contact'] },
          { titre: 'Autre entité', entite: 'creature', attributs: ['FOR'] },
          { titre: 'Tests', entite: 'personnage', attributs: ['DEX', 'FOR'] },
        ],
      },
    };
    const liste = declarationsJetables(systeme, 'personnage', { presentation });
    expect(liste.map((a) => [a.cle, a.groupe.id, a.groupe.titre])).toEqual([
      ['Contact', 'jets/0', 'Attaques'],
      ['DEX', 'jets/2', 'Tests'],
      ['FOR', 'jets/2', 'Tests'],
      ['Defense', 'combat', 'Combat'],
    ]);
    expect(grouperJetables(liste).map((g) => [g.groupe.titre, g.attributs.length])).toEqual([
      ['Attaques', 1],
      ['Tests', 2],
      ['Combat', 1],
    ]);
  });

  it('la campagne retire des attributs, sans jamais en ajouter', () => {
    const liste = attributsJetables(fiche(), { retires: ['DEX', 'CON', 'inconnu'] });
    expect(liste.map((a) => a.cle)).toEqual(['FOR', 'Defense', 'Contact']);
  });

  it('type d’entité inconnu : liste vide', () => {
    expect(declarationsJetables(systeme, 'inconnu')).toEqual([]);
  });
});

describe('présentation : groupes du lanceur', () => {
  const base = { format: 1, systeme: 'mini-d20' };
  const verifier = (jets: unknown) => verifierPresentation({ ...base, des: { jets } }, systeme);

  it('accepte des attributs jetables', () => {
    expect(verifier([{ titre: 'Tests', attributs: ['FOR', 'DEX'] }]).ok).toBe(true);
  });

  it('refuse un attribut inconnu, sans jet, en double ou un type inconnu', () => {
    const r = verifier([
      { titre: 'A', attributs: ['FOR', 'CON', 'INCONNU', 'FOR'] },
      { titre: 'B', attributs: ['FOR'] },
      { titre: 'C', entite: 'vaisseau', attributs: ['FOR'] },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.erreurs.map((e) => [e.chemin, e.message])).toEqual([
      ['des/jets/0', 'CON ne déclare pas `jet` : il ne sert pas aux jets'],
      ['des/jets/0', 'Attribut inconnu : INCONNU'],
      ['des/jets/0', 'Attribut en double : FOR'],
      ['des/jets/1', 'FOR est déjà dans un autre groupe'],
      ['des/jets/2', 'Type d’entité inconnu : vaisseau'],
    ]);
  });
});
