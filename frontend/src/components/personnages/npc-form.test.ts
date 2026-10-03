/**
 * Formulaire d'un modèle de PNJ : seules les valeurs changées partent (défaut du système en
 * création, valeurs du modèle en modification), converties selon leur nature.
 */
import type { Attribut } from '@vtt/rules';
import { describe, expect, it } from 'vitest';
import { saisieOf, valeursDe } from './npc-form';

const base = (cle: string, defaut: number) =>
  ({ cle, nom: cle, nature: 'base', defaut }) as unknown as Attribut;
const texte = (cle: string) =>
  ({ cle, nom: cle, nature: 'texte', defaut: '' }) as unknown as Attribut;

describe('formulaire d’un modèle de PNJ', () => {
  const attributs = [base('FOR', 10), base('niveau', 1), texte('notes')];

  it('création : ce qui diffère du défaut, en nombres', () => {
    const depart = (a: Attribut) => saisieOf(undefined, a);
    expect(valeursDe(attributs, { FOR: '14', niveau: '1', notes: '' }, depart)).toEqual({
      FOR: 14,
    });
    // Saisie invalide : ignorée
    expect(valeursDe(attributs, { FOR: 'abc' }, depart)).toEqual({});
  });

  it('modification : seulement ce qui a changé depuis l’ouverture', () => {
    const actuel: Record<string, number> = { FOR: 16, niveau: 3 };
    const depart = (a: Attribut) => saisieOf(actuel[a.cle], a);
    expect(valeursDe(attributs, { FOR: '16', niveau: '4' }, depart)).toEqual({ niveau: 4 });
    // Revenir au défaut du système alors que le modèle avait autre chose : envoyé
    expect(valeursDe(attributs, { FOR: '10' }, depart)).toEqual({ FOR: 10 });
  });
});
