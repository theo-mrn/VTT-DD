/**
 * Voie libre (docs/entrees-libres.md) : brouillon de l'éditeur → entrées libres → fiche →
 * brouillon, sur D&D classique.
 */
import { calculer, EtatEntite, nouvellePossession } from '@vtt/rules';
import { systeme as systemeDe } from '@vtt/systemes';
import { describe, expect, it } from 'vitest';
import { draftOf, draftValid, emptyDraft, entriesOf, freePathKinds } from './free-path';

const systeme = systemeDe('dnd-classic');
const vierge = EtatEntite.parse({
  type: 'personnage',
  systeme: { id: 'dnd-classic', version: systeme.source.version },
});

describe('voie libre', () => {
  it('propose la sorte voie et les sortes de capacités personnalisables', () => {
    const k = freePathKinds(systeme, 'personnage');
    expect(k.paths.map((s) => s.id)).toEqual(['voie']);
    expect(k.abilities.map((s) => s.id)).toEqual(['capacite', 'capacite_active']);
  });

  it('se calcule et se relit telle qu’elle a été saisie', () => {
    const fiche = calculer(systeme, vierge);
    const draft = emptyDraft(fiche, systeme.sortes.get('voie')!);
    expect(draft.ranks).toHaveLength(5);
    draft.nom = 'Voie du roc';
    draft.ranks[0] = {
      sorte: 'capacite',
      nom: 'Peau de pierre',
      description: '+2 DEF',
      champs: { activation: 'Capacité passive' },
      effets: [{ sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: '2' }],
    };
    draft.ranks[2] = {
      sorte: 'capacite_active',
      nom: 'Avalanche',
      description: '',
      champs: { degats: '2d6 + @FOR' },
      effets: [],
    };
    expect(draftValid(draft)).toBe(true);

    const { entries, removed } = entriesOf(systeme, draft, null, new Set());
    expect(removed).toEqual([]);
    expect(entries.map((e) => e.sorte)).toEqual(['voie', 'capacite', 'capacite_active']);
    const voie = entries[0]!;
    // La voie est posée dans le champ « voie » des capacités
    expect(entries[1]!.champs.voie).toBe(voie.id);

    const etat = EtatEntite.parse({
      ...vierge,
      entrees: entries,
      possessions: [nouvellePossession(voie.id, 1)],
    });
    const avec = calculer(systeme, etat);
    expect(avec.erreurs).toEqual([]);
    expect(avec.valeur('Defense')).toBe(Number(fiche.valeur('Defense')) + 2);

    const relu = draftOf(avec, avec.systeme.entrees.get(voie.id)!);
    expect(relu.nom).toBe('Voie du roc');
    expect(relu.ranks.map((r) => r?.nom ?? null)).toEqual([
      'Peau de pierre',
      null,
      'Avalanche',
      null,
      null,
    ]);

    // Capacité retirée du rang 3 : rendue à retirer
    relu.ranks[2] = null;
    expect(entriesOf(systeme, relu, draftOf(avec, voie), new Set()).removed).toEqual([
      entries[2]!.id,
    ]);
  });

  it('attend un nom de voie et un nom à chaque capacité', () => {
    const fiche = calculer(systeme, vierge);
    const draft = emptyDraft(fiche, systeme.sortes.get('voie')!);
    expect(draftValid(draft)).toBe(false);
    draft.nom = 'X';
    draft.ranks[0] = { sorte: 'capacite', nom: ' ', description: '', champs: {}, effets: [] };
    expect(draftValid(draft)).toBe(false);
  });
});
