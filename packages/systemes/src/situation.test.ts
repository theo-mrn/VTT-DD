/**
 * Situation du combat des trois systèmes (docs/regles.md, « Situation du combat » et « Contexte
 * du combat ») : chaque paramètre de situation est reçu par les actions à cible et sert à
 * chacune ; un cas concret par règle de chaque système, avec le contexte `@combat.*`.
 */
import { describe, expect, it } from 'vitest';
import {
  aleatoireGraine,
  apercuFormule,
  apercuVariables,
  aleatoireImpose,
  calculer,
  chemins,
  EtatEntite,
  executerAction,
  recoitSituation,
  type ContexteCombatSaisi,
  type EtatEntiteSaisi,
  type Fiche,
  type Noeud,
  type ResultatAction,
  type SystemeCharge,
  type Valeur,
} from '@vtt/rules';
import { avecType, chargerSource, presentationSource } from './test-utils.js';

const SYSTEMES = ['dnd-classic', 'nooblies', 'star-wars-eote'] as const;

function fabrique(systeme: SystemeCharge) {
  const version = { id: systeme.source.id, version: systeme.source.version };
  return (saisi: Omit<EtatEntiteSaisi, 'type' | 'systeme'>): Fiche =>
    calculer(
      systeme,
      EtatEntite.parse({ type: 'personnage', systeme: version, creation: false, ...saisi }),
    );
}

/** La formule lit la variable `nom`. */
function lit(n: Noeud, nom: string): boolean {
  switch (n.t) {
    case 'variable':
      return n.nom === nom;
    case 'appel':
      return n.args.some((a) => lit(a, nom));
    case 'unaire':
      return lit(n.arg, nom);
    case 'binaire':
      return lit(n.g, nom) || lit(n.d, nom);
    case 'si':
      return lit(n.condition, nom) || lit(n.alors, nom) || lit(n.sinon, nom);
    case 'des':
      return lit(n.nombre, nom) || lit(n.faces, nom) || (!!n.garder && lit(n.garder.n, nom));
    default:
      return false;
  }
}

describe.each(SYSTEMES)('%s : situation', (id) => {
  const systeme = chargerSource(id);
  const situation = systeme.source.situation!;
  const recoivent = [...systeme.actions.values()].filter(
    (a) => recoitSituation(a) && systeme.source.actions.find((x) => x.id === a.id)!.cible,
  );

  it('déclare une situation, reçue par des actions à cible, rangée en situation', () => {
    expect(situation.parametres.length).toBeGreaterThan(0);
    expect(recoivent.length).toBeGreaterThan(0);
    for (const a of recoivent) {
      const sauf = typeof a.situation === 'object' ? a.situation.sauf : [];
      for (const p of situation.parametres) {
        if (sauf.includes(p.id)) continue;
        const recu = a.parametres.find((x) => x.id === p.id);
        expect(recu?.section, `${a.id} : ${p.id}`).toBe('situation');
        expect(recu?.description, `${a.id} : ${p.id}`).toBeTruthy();
      }
    }
  });

  it('chaque paramètre de situation reçu sert à l’action (formule ou effet qui s’y applique)', () => {
    const inutiles: string[] = [];
    for (const a of recoivent) {
      const variables = new Set([...a.variables, ...a.apres].map((v) => v.cle));
      const prefixe = chemins.action(a.id, '');
      const formules = [...systeme.formules.entries()].filter(([ch]) => ch.startsWith(prefixe));
      for (const p of a.parametres.filter((x) => x.section === 'situation')) {
        const parFormule = formules.some(([ch, f]) => {
          const effet = /\/situation\/effets\/(\d+)\//.exec(ch);
          if (!effet) return lit(f.noeud, p.id);
          // Effet de situation sur une variable que l'action n'a pas : sans effet
          const e = situation.effets[Number(effet[1])]!;
          if (e.ajout && 'variable' in e.ajout && !variables.has(e.ajout.variable)) return false;
          return lit(f.noeud, p.id);
        });
        if (!parFormule) inutiles.push(`${a.id} : ${p.id}`);
      }
    }
    expect(inutiles).toEqual([]);
  });

  it('la présentation donne ses icônes à des paramètres de situation', () => {
    const icones = presentationSource(id).combat?.situation?.icones ?? {};
    expect(Object.keys(icones).length).toBeGreaterThan(0);
  });
});

// ─── D&D classique ───────────────────────────────────────────────────────────

describe('dnd-classic : situation des attaques', () => {
  const systeme = chargerSource('dnd-classic');
  const fiche = fabrique(systeme);
  const nu = (possessions: EtatEntiteSaisi['possessions'] = [], valeurs = {}) =>
    fiche({ valeurs: { niveau: 1, jetsDeVie: 9, ...valeurs }, possessions });
  const heros = nu([{ entree: 'epee-longue' }]);
  const cible = nu();
  const attaque = (
    action: string,
    parametres: Record<string, Valeur>,
    des: number[],
    acteur = heros,
    combat?: ContexteCombatSaisi,
  ) =>
    executerAction(systeme, {
      action,
      acteur,
      cible,
      parametres: avecType(systeme, action, { arme: 'epee-longue', ...parametres }),
      aleatoire: aleatoireImpose(des),
      ...(combat ? { combat } : {}),
    });
  const ok = (r: ReturnType<typeof attaque>): ResultatAction => {
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    return r.resultat;
  };
  const total = (r: ResultatAction) => Number(r.variables.total);
  const defense = cible.valeur('Defense') as number;

  it('aperçu : la formule du jet s’écrit avec l’avantage choisi, sans cible ni dés', () => {
    const jet = systeme.formules.get(chemins.action('attaque', 'jet/formule'))!;
    const apercu = (avantage: string) => {
      const v = apercuVariables(systeme, {
        action: 'attaque',
        acteur: heros,
        parametres: { score: 'Contact', avantage },
      });
      expect(v).not.toBeNull();
      return apercuFormule(heros, jet, (nom) => v!.get(nom));
    };
    expect(apercu('avantage')).toMatch(/^2d20k1\b/);
    expect(apercu('desavantage')).toMatch(/^2d20kl1\b/);
    expect(apercu('normal')).toMatch(/^1d20\b/);
    expect(apercu('normal')).not.toContain('si(');
    expect(apercu('normal')).not.toMatch(/[+−] 0\b|[+−]\s*$/);
  });

  it('avantage de situation : 2d20, le meilleur ; désavantage : le pire', () => {
    const avec = ok(attaque('attaque', { avantage: 'avantage' }, [4, 15, 3]));
    expect(avec.variables.naturel).toBe(15);
    expect(avec.explications).toContain('Avantage de situation : + 1 → avantages');
    const contre = ok(attaque('attaque', { avantage: 'desavantage' }, [4, 15, 3]));
    expect(contre.variables.naturel).toBe(4);
  });

  it('abri de la cible : +2 ou +5 DEF, une attaque qui touchait rate', () => {
    // Un d20 qui atteint juste la Défense
    const naturel = defense - (total(ok(attaque('attaque', {}, [1, 1]))) - 1);
    const juste = ok(attaque('attaque', {}, [naturel, 3]));
    expect(juste.reussi).toBe(true);
    const abri = ok(attaque('attaque', { couvert: 'partiel' }, [naturel, 3]));
    expect(abri.reussi).toBe(false);
    expect(total(abri)).toBe(total(juste) - 2);
    expect(total(ok(attaque('attaque', { couvert: 'important' }, [naturel, 3])))).toBe(
      total(juste) - 5,
    );
  });

  it('cible à terre : avantage au contact, désavantage à distance ; ils s’annulent', () => {
    expect(ok(attaque('attaque', { cibleATerre: 'contact' }, [4, 15, 3])).variables.naturel).toBe(
      15,
    );
    expect(ok(attaque('attaque', { cibleATerre: 'distance' }, [4, 15, 3])).variables.naturel).toBe(
      4,
    );
    const annules = ok(
      attaque('attaque', { cibleATerre: 'distance', avantage: 'avantage' }, [4, 15, 3]),
    );
    expect(annules.variables.naturel).toBe(4);
    expect(annules.variables.avantages).toBe(0);
    expect(ok(attaque('attaque', { cibleEsquive: true }, [4, 15, 3])).variables.avantages).toBe(-1);
  });

  it('bonus au toucher et aux DM : les DM seulement si l’attaque touche', () => {
    const base = ok(attaque('attaque', {}, [19, 3]));
    const bonus = ok(attaque('attaque', { bonusToucher: 3, bonusDegats: 4 }, [19, 3]));
    expect(total(bonus)).toBe(total(base) + 3);
    expect(bonus.variables.degats).toBe(Number(base.variables.degats) + 4);
    const rate = ok(attaque('attaque', { bonusDegats: 4 }, [2, 3]));
    expect([rate.reussi, rate.variables.degats]).toEqual([false, 0]);
  });

  it('les soins et les dégâts automatiques n’ont pas de situation', () => {
    for (const a of ['soins-legers', 'degats-libres', 'onde-de-choc'])
      expect(
        systeme.actions.get(a)!.parametres.some((p) => p.section === 'situation'),
        a,
      ).toBe(false);
  });

  it('Attaque sournoise : cible surprise (situation ou combat), sauf barbare vigilant', () => {
    const voleur = nu([{ entree: 'voleur-assassin', rang: 2 }, { entree: 'epee-longue' }]);
    const sans = attaque('attaque-sournoise', {}, [15, 3, 3, 3], voleur);
    expect(!sans.ok && sans.erreurs[0]!.message).toContain('surprise ou prise à revers');
    expect(attaque('attaque-sournoise', { cibleSurprise: true }, [15, 3, 3, 3], voleur).ok).toBe(
      true,
    );
    // Marquée surprise par le MJ dans le combat : rien à cocher
    const surprise = attaque('attaque-sournoise', {}, [15, 3, 3, 3], voleur, {
      round: 1,
      cible: { surpris: true },
    });
    expect(surprise.ok).toBe(true);
    const barbare = nu([{ entree: 'barbare-primitif', rang: 3 }]);
    const r = executerAction(systeme, {
      action: 'attaque-sournoise',
      acteur: voleur,
      cible: barbare,
      parametres: { arme: 'epee-longue', cibleSurprise: true },
      aleatoire: aleatoireImpose([15, 3, 3, 3]),
    });
    expect(!r.ok && r.erreurs[0]!.message).toContain('immunisée aux attaques sournoises');
  });

  it('À l’abordage ! : d’office à la première attaque au contact d’un combat', () => {
    const flibustier = nu([
      { entree: 'prestige-arquebusier-flibustier', rang: 3 },
      { entree: 'epee-longue' },
    ]);
    const premiere = ok(
      attaque('attaque', {}, [10, 3, 3], flibustier, { round: 1, acteur: { attaques: 0 } }),
    );
    const suivante = ok(
      attaque('attaque', {}, [10, 3, 3], flibustier, { round: 1, acteur: { attaques: 1 } }),
    );
    const horsCombat = ok(attaque('attaque', {}, [10, 3, 3], flibustier));
    expect(total(premiere)).toBe(total(suivante) + 5);
    expect(total(horsCombat)).toBe(total(suivante));
    expect(premiere.variables.desDM).toBe(Number(suivante.variables.desDM) + 1);
    // Case cochée à la main : comptée une fois
    const cochee = ok(
      attaque('attaque', { premiereAttaque: true }, [10, 3, 3], flibustier, {
        round: 1,
        acteur: { attaques: 0 },
      }),
    );
    expect(total(cochee)).toBe(total(premiere));
  });

  it('Attaque bondissante : au premier tour du combat seulement', () => {
    const druide = nu([{ entree: 'druide-fauve', rang: 5 }, { entree: 'epee-longue' }]);
    const au = (round: number) => attaque('attaque-bondissante', {}, [10, 3, 3], druide, { round });
    expect(au(1).ok).toBe(true);
    expect(attaque('attaque-bondissante', {}, [10, 3, 3], druide).ok).toBe(true);
    const tard = au(2);
    expect(!tard.ok && tard.erreurs[0]!.message).toContain('premier tour');
  });
});

// ─── Nooblies ────────────────────────────────────────────────────────────────

describe('nooblies : situation des attaques', () => {
  const systeme = chargerSource('nooblies');
  const fiche = fabrique(systeme);
  const heros = fiche({});
  const cible = fiche({});
  const attaque = (parametres: Record<string, Valeur>, des: number[]) => {
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: heros,
      cible,
      parametres: { score: 'Contact', nbDes: 1, faces: 6, ...parametres },
      aleatoire: aleatoireImpose(des),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    return r.resultat;
  };

  it('avantage, abri, bonus : comme D&D', () => {
    expect(attaque({ avantage: 'avantage' }, [4, 15, 3]).variables.naturel).toBe(15);
    expect(attaque({ cibleATerre: 'distance' }, [4, 15, 3]).variables.naturel).toBe(4);
    const base = attaque({}, [18, 3]);
    expect(Number(attaque({ couvert: 'important' }, [18, 3]).variables.total)).toBe(
      Number(base.variables.total) - 5,
    );
    expect(Number(attaque({ bonusDegats: 2 }, [18, 3]).variables.degats)).toBe(
      Number(base.variables.degats) + 2,
    );
  });
});

// ─── Star Wars ───────────────────────────────────────────────────────────────

describe('star-wars-eote : situation des actions à cible', () => {
  const systeme = chargerSource('star-wars-eote');
  const fiche = fabrique(systeme);
  const tireur = fiche({
    possessions: [
      { entree: 'humain' },
      { entree: 'fusil-blaster' },
      { entree: 'vibrolame' },
      { entree: 'frappe-rapide', rang: 2 },
    ],
  });
  const cible = (possessions: EtatEntiteSaisi['possessions'] = []) =>
    fiche({ possessions: [{ entree: 'humain' }, ...possessions] });
  const attaque = (
    parametres: Record<string, Valeur>,
    combat?: ContexteCombatSaisi,
    c: Fiche = cible(),
  ) => {
    const r = executerAction(systeme, {
      action: 'attaque',
      acteur: tireur,
      cible: c,
      parametres: { arme: 'fusil-blaster', portee: 'courte', ...parametres },
      aleatoire: aleatoireGraine('situation'),
      ...(combat ? { combat } : {}),
    });
    if (!r.ok) throw new Error(JSON.stringify(r.erreurs));
    return r.resultat;
  };
  const des = (r: ResultatAction, de: string) =>
    r.jet.type === 'symboles' ? (r.jet.pool.find((p) => p.de === de)?.nombre ?? 0) : 0;

  it('couvert de la cible : +1 ou +2 Difficulté aux tirs, le couvert porté compte', () => {
    const base = des(attaque({}), 'difficulte');
    expect(des(attaque({ couvert: 'partiel' }), 'difficulte')).toBe(base + 1);
    expect(des(attaque({ couvert: 'integral' }), 'difficulte')).toBe(base + 2);
    // Déjà à couvert (état) : le plus fort l'emporte
    const abritee = cible([{ entree: 'couvert-partiel', actif: true }]);
    const avecEtat = des(attaque({}, undefined, abritee), 'difficulte');
    expect(avecEtat).toBe(base + 1);
    expect(des(attaque({ couvert: 'integral' }, undefined, abritee), 'difficulte')).toBe(base + 2);
    expect(des(attaque({ couvert: 'partiel' }, undefined, abritee), 'difficulte')).toBe(base + 1);
    // Au contact : pas de couvert
    const melee = { arme: 'vibrolame', portee: 'engage' };
    expect(des(attaque({ ...melee, couvert: 'integral' }), 'difficulte')).toBe(
      des(attaque(melee), 'difficulte'),
    );
  });

  it('Fortune, Infortune, difficulté améliorée ou dégradée de situation', () => {
    const moyenne = { portee: 'moyenne' }; // 2 dés de Difficulté à améliorer
    const r = attaque({ ...moyenne, desFortune: 2, desInfortune: 1, ameliorationsDifficulte: 2 });
    const base = attaque(moyenne);
    expect(des(r, 'fortune')).toBe(des(base, 'fortune') + 2);
    expect(des(r, 'infortune')).toBe(des(base, 'infortune') + 1);
    expect(des(r, 'defi')).toBe(des(base, 'defi') + 2);
    const degradee = attaque({
      ...moyenne,
      ameliorationsDifficulte: 2,
      retrogradationsDifficulte: 1,
    });
    expect(des(degradee, 'defi')).toBe(des(base, 'defi') + 1);
    expect(degradee.explications).toContain('Difficulté dégradée : 1 Défi → Difficulté');
  });

  it('Frappe rapide : d’office au premier round contre une cible qui n’a pas agi', () => {
    const fortune = (combat?: ContexteCombatSaisi) => des(attaque({}, combat), 'fortune');
    const sans = fortune();
    expect(fortune({ round: 1, cible: { aAgi: false } })).toBe(sans + 2);
    expect(fortune({ round: 1, cible: { aAgi: true } })).toBe(sans);
    expect(fortune({ round: 2, cible: { aAgi: false } })).toBe(sans);
    expect(des(attaque({ frappeRapide: true }), 'fortune')).toBe(sans + 2);
  });

  it('stimpack et Protecteur (sans dés) n’ont pas de situation', () => {
    for (const a of ['stimpack', 'protecteur'])
      expect(systeme.actions.get(a)!.parametres.some((p) => p.section === 'situation')).toBe(false);
  });
});
