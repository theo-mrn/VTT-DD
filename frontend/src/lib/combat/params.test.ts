import type { Presentation } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import {
  flatActions,
  groupActions,
  multitargetOf,
  poolCounts,
  previewRoll,
  presentationGroups,
  targetAttributeKeys,
  targetedActions,
} from './actions';
import {
  attackerParams,
  choiceOptions,
  defaultParams,
  entryIdOf,
  entryOptions,
  mergeParams,
  missingParams,
  paramDescription,
  paramSection,
  paramsToSend,
  paramValueValid,
  reactionParams,
} from './params';
import { loadSystem, sheet } from './test-kit';

const s = loadSystem();
const frappe = s.actions.get('frappe')!;
const armes = {
  possessions: [
    { entree: 'epee', rang: 0 },
    { entree: 'arc', rang: 0 },
  ],
};
const guerrier = sheet(s, { valeurs: { FOR: 14 }, ...armes });
const bretteur = sheet(s, {
  valeurs: { FOR: 14 },
  possessions: [...armes.possessions, { entree: 'botte', rang: 0 }],
});
const ids = (list: readonly { id: string }[]) => list.map((x) => x.id);

describe('paramètres générés depuis l’action du système', () => {
  it('l’attaquant ne choisit jamais un paramètre de la cible (défense active)', () => {
    expect(ids(attackerParams(s, frappe, guerrier))).not.toContain('esquive');
    expect(ids(reactionParams(frappe))).toEqual(['esquive']);
  });

  it('une option réservée à un talent est cachée sans lui', () => {
    expect(ids(attackerParams(s, frappe, guerrier))).toEqual(['arme', 'bonus']);
    expect(ids(attackerParams(s, frappe, bretteur))).toEqual(['arme', 'bonus', 'botte']);
  });

  it('défauts : première arme possédée, nombres et booléens de l’action', () => {
    expect(defaultParams(s, frappe, bretteur)).toEqual({ arme: 'epee', bonus: 0, botte: false });
    expect(ids(entryOptions(guerrier, frappe.parametres[0] as never))).toEqual(['epee', 'arc']);
  });

  it('reprise des valeurs d’une attaque précédente si elles restent valides (PNJ suivant)', () => {
    expect(mergeParams(s, frappe, guerrier, { arme: 'arc', bonus: 3, botte: true })).toEqual({
      arme: 'arc',
      bonus: 3,
    });
    // Arme que ce PNJ n'a pas : retour au défaut
    const sansArc = sheet(s, { possessions: [{ entree: 'epee', rang: 0 }] });
    expect(mergeParams(s, frappe, sansArc, { arme: 'arc' })).toMatchObject({ arme: 'epee' });
  });

  it('envoi : paramètres de l’attaquant seulement, sans valeur vide', () => {
    expect(
      paramsToSend(s, frappe, guerrier, { arme: 'epee', bonus: 1, esquive: 2, botte: true }),
    ).toEqual({ arme: 'epee', bonus: 1 });
    expect(paramsToSend(s, frappe, guerrier, { arme: '', bonus: 0 })).toEqual({ bonus: 0 });
  });

  it('arme requise absente : signalée', () => {
    const mainsNues = sheet(s);
    expect(ids(missingParams(s, frappe, mainsNues, defaultParams(s, frappe, mainsNues)))).toEqual([
      'arme',
    ]);
  });
});

describe('actions du menu d’attaque', () => {
  it('seulement les actions à cible, permises à l’attaquant', () => {
    expect(ids(targetedActions(s, guerrier))).toEqual(['frappe', 'soin']);
    expect(ids(targetedActions(s, bretteur))).toEqual(['frappe', 'soin', 'charge']);
  });

  it('groupes de la présentation, puis les autres ; groupe invalide ignoré', () => {
    const presentation = {
      combat: {
        groupes: [
          { titre: 'Soins', actions: ['soin', 'inconnue'] },
          { titre: 'Cassé', actions: 'frappe' },
        ],
      },
    } as unknown as Presentation;
    expect(presentationGroups(presentation)).toEqual([
      { title: 'Soins', actions: ['soin', 'inconnue'] },
    ]);
    const groups = groupActions(targetedActions(s, bretteur), presentation);
    expect(groups.map((g) => [g.title, ids(g.actions)])).toEqual([
      ['Soins', ['soin']],
      ['Autres actions', ['frappe', 'charge']],
    ]);
    // Sans présentation : un seul groupe sans titre
    expect(groupActions(targetedActions(s, guerrier), null).map((g) => g.title)).toEqual([null]);
  });

  it('plusieurs cibles : mode de jet et plafond déclarés par l’action', () => {
    expect(multitargetOf(frappe)).toEqual({ rollMode: 'per_target', max: 50 });
    const zone = { ...frappe, multicible: { jet: 'commun', max: 8 } } as never;
    expect(multitargetOf(zone)).toEqual({ rollMode: 'shared', max: 8 });
  });

  it('aperçu : valeurs de l’attaquant calculées, la cible jamais', () => {
    const p = previewRoll(s, frappe, guerrier, { arme: 'arc', bonus: 1 });
    expect(p).toEqual({ kind: 'numeric', formula: '1d20 + 2 + 2 + 1', dependsOnTarget: false });
    const soin = previewRoll(s, s.actions.get('soin')!, guerrier, {});
    expect(soin?.kind === 'numeric' && soin.dependsOnTarget).toBe(true);
    expect(soin?.kind === 'numeric' && soin.formula).toContain('@cible.PV_Max');
  });
});

describe('paramètres de situation (§ 5.7) : choix, section, description', () => {
  // Forme du moteur (paramètre `choix`, `section`, `description`), ajoutée par-dessus l'action
  const couvert = {
    id: 'couvert',
    nom: 'Couvert de la cible',
    type: 'choix',
    par: 'acteur',
    section: 'situation',
    description: 'Le couvert gêne l’attaquant.',
    options: [
      { valeur: 'aucun', nom: 'Aucun' },
      { valeur: 'partiel', nom: 'Partiel', description: '+2 en Défense' },
      { valeur: 'important', nom: 'Important' },
    ],
    defaut: 'aucun',
  };
  const surprise = { id: 'surprise', nom: 'Cible surprise', type: 'booleen', defaut: false };
  const action = { ...frappe, parametres: [...frappe.parametres, couvert, surprise] } as never;
  const param = (id: string) => attackerParams(s, action, guerrier).find((p) => p.id === id)!;

  it('options nommées, défaut, validation', () => {
    const p = param('couvert');
    expect(choiceOptions(p).map((o) => o.valeur)).toEqual(['aucun', 'partiel', 'important']);
    expect(defaultParams(s, action, guerrier).couvert).toBe('aucun');
    expect(paramValueValid(guerrier, p, 'partiel')).toBe(true);
    expect(paramValueValid(guerrier, p, 'total')).toBe(false);
    // Valeur précédente invalide : retour au défaut
    expect(mergeParams(s, action, guerrier, { couvert: 'total' }).couvert).toBe('aucun');
    expect(choiceOptions(param('surprise'))).toEqual([]);
  });

  it('rangement : situation à part, le reste en préparation ; description en info-bulle', () => {
    expect(paramSection(param('couvert'))).toBe('situation');
    expect(paramSection(param('surprise'))).toBe('main');
    expect(paramSection(param('arme'))).toBe('main');
    expect(paramDescription(param('couvert'))).toBe('Le couvert gêne l’attaquant.');
    expect(paramDescription(param('arme'))).toBeNull();
  });
});

describe('armes proposées et pool', () => {
  it('catalogue entier (`possedee: false`) : les armes possédées marquées, et choisies d’abord', () => {
    const libre = {
      ...frappe,
      parametres: [{ id: 'arme', nom: 'Arme', type: 'entree', sorte: 'arme', possedee: false }],
    } as never;
    const archer = sheet(s, { possessions: [{ entree: 'arc', rang: 0 }] });
    const p = attackerParams(s, libre, archer)[0]!;
    expect(entryOptions(archer, p as never).map((o) => [o.id, o.owned])).toEqual([
      ['epee', false],
      ['arc', true],
    ]);
    expect(defaultParams(s, libre, archer).arme).toBe('arc');
    expect(entryIdOf('arc#2')).toBe('arc');
  });

  it('compteurs du pool : améliorations appliquées, inconnu si la cible compte', () => {
    expect(
      poolCounts({
        kind: 'symbols',
        dice: [
          { die: 'aptitude', name: 'Aptitude', count: 3 },
          { die: 'difficulte', name: 'Difficulté', count: 2 },
          { die: 'infortune', name: 'Infortune', count: null },
        ],
        upgrades: [
          { die: 'aptitude', to: 'maitrise', name: 'Maîtrise', count: 2 },
          { die: 'difficulte', to: 'defi', name: 'Défi', count: null },
        ],
        dependsOnTarget: true,
      }),
    ).toEqual({ aptitude: 1, maitrise: 2, difficulte: 2, defi: null, infortune: null });
    expect(poolCounts(null)).toEqual({});
    expect(poolCounts({ kind: 'numeric', formula: '1d20', dependsOnTarget: false })).toEqual({});
  });

  it('aperçu par cible (MJ) : attributs de la cible lus par l’action', () => {
    expect(targetAttributeKeys(s, frappe)).toEqual(['Defense']);
    expect(targetAttributeKeys(s, s.actions.get('soin')!).sort()).toEqual(['PV', 'PV_Max']);
    expect(targetAttributeKeys(s, s.actions.get('charge')!)).toEqual([]);
  });

  it('raccourcis 1 à 9 : les actions dans l’ordre de leurs groupes', () => {
    const groups = groupActions(targetedActions(s, bretteur), null);
    expect(flatActions(groups).map((a) => a.id)).toEqual(['frappe', 'soin', 'charge']);
  });
});
