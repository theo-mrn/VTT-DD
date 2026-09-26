export interface DiceRollResult {
  total: number;
  rolls: number[];
}

const DICE_NOTATION_RE = /^(\d*)d(\d+)$/i;

/** Parse "NdM" (N optionnel, défaut 1) — ex "d20", "3d6". */
export function parseDiceNotation(notation: string): { count: number; sides: number } | null {
  const match = DICE_NOTATION_RE.exec(notation.trim());
  if (!match) return null;
  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  if (count <= 0 || sides <= 0) return null;
  return { count, sides };
}

/** Lance une notation "NdM" avec Math.random. Retourne { total: 0, rolls: [] } si la notation est invalide. */
export function rollDice(notation: string): DiceRollResult {
  const parsed = parseDiceNotation(notation);
  if (!parsed) return { total: 0, rolls: [] };

  const rolls: number[] = [];
  for (let i = 0; i < parsed.count; i++) {
    rolls.push(Math.floor(Math.random() * parsed.sides) + 1);
  }
  return { total: rolls.reduce((sum, r) => sum + r, 0), rolls };
}
