/**
 * Menu Capacités (docs/combat.md § 19.1) sur le vrai système D&D : comment chaque capacité se
 * joue, et lesquelles sont proposées.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { calculer, charger, EtatEntite, Presentation, type EtatEntiteSaisi } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { capacitesDeCombat, groupeDe } from './capacities';

const PUBLIC = fileURLToPath(new URL('../../../public/systemes/', import.meta.url));
const r = charger(JSON.parse(readFileSync(`${PUBLIC}dnd-classic.json`, 'utf8')));
if (!r.ok) throw new Error(r.erreurs[0]?.message);
const systeme = r.systeme;
const presentation = Presentation.parse(
  JSON.parse(readFileSync(`${PUBLIC}dnd-classic.presentation.json`, 'utf8')),
);

const fiche = (possessions: EtatEntiteSaisi['possessions']) =>
  calculer(
    systeme,
    EtatEntite.parse({
      type: 'personnage',
      systeme: { id: 'dnd-classic', version: '1.0.0' },
      valeurs: { niveau: 5, jetsDeVie: 20 },
      possessions,
    }),
  );

const jeu = (f: ReturnType<typeof fiche>, id: string) =>
  capacitesDeCombat(systeme, presentation, f).find((c) => c.entree.id === id);

describe('menu Capacités', () => {
  it('action dédiée, capacité à activer, action générique', () => {
    const f = fiche([
      { entree: 'pretre-soins', rang: 1 },
      { entree: 'barbare-rage', rang: 3 },
      { entree: 'barbare-pourfendeur', rang: 4 },
    ]);
    const soins = jeu(f, 'pretre-soins-soins-legers');
    expect(soins?.jeu).toMatchObject({ type: 'actions' });
    expect(soins?.jeu.type === 'actions' && soins.jeu.actions.map((d) => d.action.id)).toEqual([
      'soins-legers',
    ]);
    expect(soins?.usages).toMatchObject({ max: 1, par: 'jour' });
    const rage = jeu(f, 'barbare-rage-rage-du-berserk');
    expect(rage).toMatchObject({ jeu: { type: 'activer' }, active: false });
    expect(groupeDe(rage!)).toBe('aActiver');
    const dechainement = jeu(f, 'barbare-pourfendeur-dechainement-d-acier');
    expect(dechainement?.jeu).toMatchObject({
      type: 'generique',
      action: { id: 'utiliser-capacite' },
      parametre: 'capacite',
    });
  });

  it('une passive pure n’est pas proposée ; une passive à usages limités, si', () => {
    const f = fiche([
      { entree: 'barbare-brute', rang: 1 },
      { entree: 'guerrier-maitre-d-armes', rang: 5 },
    ]);
    expect(jeu(f, 'barbare-brute-argument-de-taille')).toBeUndefined();
    expect(jeu(f, 'guerrier-maitre-d-armes-riposte')).toMatchObject({
      usages: { par: 'tour' },
    });
  });
});
