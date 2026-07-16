import type { GameSystemDefinition, SymbolDieDefinition, SymbolDieFace } from '@/modules/game-system/types';
import { resolveCharacterStats } from './resolver';
import { getFormulaDependencies } from './formula';

// ─────────────────────────────────────────────────────────────────────────────
// Moteur pour les dés à SYMBOLES (ex système narratif façon Star Wars) — 100% générique : un "symbole"
// n'est pas un type connu ici, juste une StatDefinition ordinaire définie par le MJ. Ce module ne fait
// que (1) sommer les valeurs brutes assignées par les faces obtenues, clé par clé, et (2) déléguer TOUT
// le calcul (annulations, nets...) à resolveCharacterStats — le même moteur de formules déjà utilisé
// pour les personnages et les entités de groupe, aucune logique de résolution dupliquée ici.
// ─────────────────────────────────────────────────────────────────────────────

export interface SymbolDieRoll {
  /** Valeur brute tirée (1..faces.length), pour affichage du détail comme les dés numériques classiques. */
  value: number;
  face: SymbolDieFace;
}

/** Tire une face au hasard (Math.random, même pattern que rollDice de dice.ts). */
export function rollSymbolDie(die: SymbolDieDefinition): SymbolDieRoll {
  const value = Math.floor(Math.random() * die.faces.length) + 1;
  return { value, face: die.faces[value - 1] };
}

export interface SymbolDiceResolution {
  /** Toutes les stats résolues (bruts + nets calculés par les formules du MJ) — même forme que
   *  resolveCharacterStats, réutilisable telle quelle si besoin d'un calcul plus poussé côté appelant. */
  values: Record<string, number | string | boolean>;
  /** Clés effectivement présentes dans au moins une face obtenue — sert à savoir quoi afficher
   *  (une stat jamais touchée par ce jet ne doit pas apparaître dans le résultat formaté). */
  touchedKeys: string[];
}

/** Additionne les valeurs brutes de toutes les faces obtenues (clé par clé, générique), puis résout
 *  l'intégralité des stats du système (bruts + dérivées) via le moteur de formules partagé. */
export function resolveSymbolDiceRoll(gameSystem: GameSystemDefinition, faces: SymbolDieFace[]): SymbolDiceResolution {
  const rawTotals: Record<string, number> = {};
  for (const face of faces) {
    // face.values ?? {} : tolère un dé stocké en Firestore avant que sa face n'ait été configurée
    // (ou créé par une version antérieure de l'éditeur) — une face sans values est une face vide.
    for (const [key, amount] of Object.entries(face.values ?? {})) {
      rawTotals[key] = (rawTotals[key] ?? 0) + (amount ?? 0);
    }
  }

  const resolved = resolveCharacterStats(gameSystem, [], rawTotals);
  return { values: resolved.values, touchedKeys: Object.keys(rawTotals) };
}

/** Formate le résultat en texte à partir des stats DÉRIVÉES du système dont la valueFormula dépend
 *  (même indirectement) d'au moins une clé "touchée" par ce jet — générique, piloté par
 *  StatDefinition.label, aucun nom de symbole en dur. N'affiche que les valeurs non nulles ;
 *  "Aucun effet" si tout est à 0. */
export function formatSymbolDiceResult(gameSystem: GameSystemDefinition, resolution: SymbolDiceResolution): string {
  const touched = new Set(resolution.touchedKeys);
  const parts: string[] = [];

  for (const stat of gameSystem.stats) {
    if (stat.category !== 'derived' || !stat.valueFormula) continue;
    const deps = getFormulaDependencies(stat.valueFormula);
    if (!deps.some((key) => touched.has(key))) continue;
    const value = resolution.values[stat.key];
    if (typeof value !== 'number' || value === 0) continue;
    parts.push(`${value} ${stat.label || stat.key}`);
  }

  return parts.length > 0 ? parts.join(' + ') : 'Aucun effet';
}
