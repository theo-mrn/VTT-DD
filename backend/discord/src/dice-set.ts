/**
 * Dés d'un système de jeu, lus dans sa définition (packages/systemes) : jamais écrits en dur.
 *
 * - système à symboles (`systeme.des.sortes`, ex. Star Wars) : on lance un pool
 *   `[{ de: id, nombre }]`, le service dice lit les faces de chaque sorte ;
 * - système chiffré (`presentation.des.sortes`, ex. d4…d20) : on lance une notation
 *   `2d20+1d6+3`.
 */
import type { GameSystem } from './yner.js';

export interface Die {
  /** Identifiant de la sorte (`aptitude`) ou du dé (`d20`). */
  id: string;
  /** Libellé court affiché sur le bouton. */
  label: string;
  /** Nom reconnu par le service dice dans une notation (`Aptitude`, `d20`). */
  name: string;
  /** Faces d'un dé chiffré (20 pour d20) ; null pour un dé à symboles. */
  faces: number | null;
}

export interface DiceSet {
  systemId: string;
  systemName: string;
  kind: 'symbols' | 'numeric';
  dice: Die[];
  /** Couleur des messages (premier dé de la présentation), entier RGB. */
  color: number | undefined;
}

const DEFAULT_NUMERIC = [4, 6, 8, 10, 12, 20];

function colorOf(hex: string | undefined): number | undefined {
  return hex && /^#[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex.slice(1), 16) : undefined;
}

export function diceSetOf(systemId: string, system: GameSystem): DiceSet {
  const presentation = system.presentation.des?.sortes ?? {};
  const firstColor = colorOf(Object.values(presentation)[0]?.couleur);
  const symbolDice = system.systeme.des?.sortes ?? [];
  if (symbolDice.length) {
    return {
      systemId,
      systemName: system.systeme.nom,
      kind: 'symbols',
      dice: symbolDice.map((s) => ({
        id: s.id,
        label: presentation[s.id]?.court ?? s.nom,
        name: s.nom,
        faces: null,
      })),
      color: firstColor,
    };
  }
  const declared = Object.keys(presentation)
    .map((id) => /^d(\d{1,4})$/.exec(id))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  const faces = declared.length ? declared : DEFAULT_NUMERIC;
  return {
    systemId,
    systemName: system.systeme.nom,
    kind: 'numeric',
    dice: faces.map((f) => ({ id: `d${f}`, label: `d${f}`, name: `d${f}`, faces: f })),
    color: firstColor,
  };
}

/** Quantités choisies sur le plateau, dans l'ordre des dés du système. */
export interface Selection {
  counts: number[];
  modifier: number;
}

export const MAX_PER_DIE = 20;
export const MAX_MODIFIER = 99;

export function isEmpty(s: Selection): boolean {
  return s.counts.every((c) => c === 0);
}

/** « 2 Aptitude + 1 Difficulté » ou « 2d20 + 1d6 + 3 ». */
export function describe(set: DiceSet, s: Selection): string {
  const parts = set.dice.flatMap((d, i) => {
    const n = s.counts[i] ?? 0;
    if (!n) return [];
    return [set.kind === 'numeric' ? `${n}${d.label}` : `${n} ${d.label}`];
  });
  if (set.kind === 'numeric' && s.modifier) parts.push(String(Math.abs(s.modifier)));
  if (!parts.length) return '';
  if (set.kind === 'numeric' && s.modifier < 0) {
    const last = parts.pop()!;
    return `${parts.join(' + ')} - ${last}`;
  }
  return parts.join(' + ');
}

/** Ce que le service dice reçoit pour cette sélection. */
export function rollRequestOf(
  set: DiceSet,
  s: Selection,
): { notation: string } | { pool: { de: string; nombre: number }[] } {
  if (set.kind === 'symbols') {
    return {
      pool: set.dice
        .map((d, i) => ({ de: d.id, nombre: s.counts[i] ?? 0 }))
        .filter((p) => p.nombre > 0),
    };
  }
  const dice = set.dice.flatMap((d, i) =>
    (s.counts[i] ?? 0) > 0 ? [`${s.counts[i]}d${d.faces}`] : [],
  );
  const modifier = s.modifier ? (s.modifier > 0 ? `+${s.modifier}` : String(s.modifier)) : '';
  return { notation: `${dice.join('+')}${modifier}` };
}

/**
 * Suggestions de l'autocomplétion de `/roll` : ce qui est déjà tapé, puis ce texte complété
 * d'un dé de chaque sorte du système (25 au plus, limite de Discord).
 */
export function suggestions(set: DiceSet, typed: string): string[] {
  const base = typed.trim().replace(/[+\s]+$/, '');
  const token = (d: Die) => (set.kind === 'numeric' ? `1${d.name}` : `1 ${d.name}`);
  const out = base ? [base] : [];
  for (const d of set.dice) out.push(base ? `${base} + ${token(d)}` : token(d));
  return [...new Set(out)].filter((s) => s.length <= 100).slice(0, 25);
}
