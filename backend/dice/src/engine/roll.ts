/**
 * Tirage des jets côté serveur, avec le comportement de l'ancienne app
 * (legacy/src/components/(dices)/dice-roller.tsx et app/api/roll-dice) :
 *
 *  - notation numérique `2d6+3`, `4d6kh3`, `2d20kl1`, `1d20!`, avec les
 *    variables du personnage écrites en nom nu (`1d20+FOR`, remplacées par le
 *    modificateur s'il existe, sinon la valeur) ou avec la syntaxe du moteur
 *    (`@FOR`, `mod(@DEX)`) ; le calcul passe par @vtt/rules (jamais d'eval) ;
 *  - dés à symboles du système, en notation `N<dé>` (`2aptitude 1difficulte`)
 *    ou en pool `[{ de, nombre }]`, résolus par `lancerSymboles`.
 *
 * Le détail lisible (`output`) reprend le format de l'ancienne app :
 * `1d20+3 = [17]+3 = 20`, dés écartés préfixés par « r » (`[5, r2]`), et
 * `Aptitude [3, 5], Difficulté [2] = 1 Succès` pour les symboles.
 *
 * Le générateur est injecté : cryptographique en service, imposé en test.
 */
import { HttpError } from '@vtt/platform';
import {
  compiler,
  ErreurEvaluation,
  evaluer,
  lancerSymboles,
  type EnvironnementTypes,
  type Generateur,
  type JetDes,
  type SystemeCharge,
  type TypeValeur,
  type Valeur,
} from '@vtt/rules';
import type { DiceGroup, Outcome, SymbolsResult } from '../db/schema.js';

export const MAX_NOTATION = 500;

/** Valeurs calculées d'une fiche (character), par clé d'attribut. */
export type SheetValues = Record<string, { value: Valeur; modifier?: number }>;

/** Variables en nom nu (`FOR`) : valeur numérique à substituer dans la notation. */
export type Variables = Record<string, number>;

/** Ce que l'ancienne app enregistrait pour un jet, calculé ici par le serveur. */
export interface Rolled {
  /** Notation après substitution des variables. */
  notation: string;
  dice: DiceGroup[];
  symbols: SymbolsResult | null;
  /** Dés du premier groupe (ancien diceCount / diceFaces). */
  diceCount: number;
  diceFaces: number;
  /** Arrondi à l'entier inférieur, comme l'ancienne app ; 0 pour un jet à symboles. */
  total: number;
  output: string;
  symbolResult: string | null;
  outcome: Outcome;
}

const typeOf = (v: Valeur): TypeValeur =>
  typeof v === 'number' ? 'nombre' : typeof v === 'boolean' ? 'booleen' : 'texte';

export function invalidNotation(detail: string): HttpError {
  return new HttpError(400, 'Requête invalide', 'invalid_notation', detail);
}

/**
 * Variables d'une fiche pour les notations en nom nu, comme buildDiceVariables
 * de l'ancienne app : le modificateur d'un attribut qui en a un, sinon sa valeur.
 */
export function sheetVariables(values: SheetValues | undefined): Variables {
  const vars: Variables = {};
  for (const [key, v] of Object.entries(values ?? {})) {
    if (v.modifier !== undefined) vars[key] = v.modifier;
    else if (typeof v.value === 'number') vars[key] = v.value;
  }
  return vars;
}

/**
 * Remplace les noms de variables par leur valeur (applyVariablesToNotation de
 * l'ancienne app) : mots entiers, sans tenir compte de la casse, clés les plus
 * longues d'abord. `@FOR` n'est pas touché (lu par le moteur sur la fiche).
 */
export function applyVariables(notation: string, variables: Variables): string {
  const keys = Object.keys(variables);
  if (keys.length === 0) return notation;
  const sorted = [...keys].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(?<![@\\w])(${escaped.join('|')})\\b`, 'gi');
  return notation.replace(regex, (match) => {
    const key = sorted.find((k) => k.toLowerCase() === match.toLowerCase());
    return key !== undefined ? String(variables[key]) : match;
  });
}

/** `1D20` → `1d20` (l'ancienne app acceptait les deux). */
const normalizeDice = (s: string) => s.replace(/(^|[^\w@])(\d*)D(\d)/g, '$1$2d$3');

/** Une notation de dés à la position d'un jet du moteur. */
const DICE_TOKEN = /\d*d\d+(?:k[hl]?\d+)?!?/y;

/** Groupes de dés au format de l'API, depuis les jets du moteur. */
export function diceGroups(jets: readonly JetDes[]): DiceGroup[] {
  return jets.map((j) => ({
    faces: j.faces,
    values: j.des.map((d) => ({ value: d.valeur, kept: d.garde, exploded: d.explosion })),
  }));
}

/** Premier groupe : ancien diceCount (dés demandés, sans les explosions) et diceFaces. */
export function firstGroup(dice: readonly DiceGroup[]): { diceCount: number; diceFaces: number } {
  const g = dice[0];
  return g
    ? { diceCount: g.values.filter((v) => !v.exploded).length, diceFaces: g.faces }
    : { diceCount: 0, diceFaces: 0 };
}

/** `[17]`, `[5, r2]` : dés d'un groupe, écartés préfixés par « r ». */
const formatGroup = (g: DiceGroup) =>
  `[${g.values.map((v) => (v.kept ? `${v.value}` : `r${v.value}`)).join(', ')}]`;

/**
 * Critique et échec critique d'un jet libre, sans règle propre à un système :
 * le jet ne garde qu'un seul dé (`1d20 + 5`, `2d20kh1`) et ce dé fait sa valeur
 * maximale (critique) ou 1 (échec critique).
 */
export function freeOutcome(dice: readonly DiceGroup[]): Outcome {
  const kept = dice.flatMap((g) =>
    g.values.filter((v) => v.kept).map((v) => ({ faces: g.faces, value: v.value })),
  );
  const single = kept.length === 1 && kept[0]!.faces > 1 ? kept[0]! : undefined;
  return {
    success: null,
    critical: !!single && single.value === single.faces,
    fumble: !!single && single.value === 1,
  };
}

/**
 * Lance une notation numérique. `variables` : noms nus (`FOR`) ; `sheet` :
 * attributs lus par la syntaxe du moteur (`@FOR`, `mod(@DEX)`).
 */
export function rollNotation(
  notation: string,
  context: { variables?: Variables; sheet?: SheetValues },
  generator: Generateur,
): Rolled {
  const processed = normalizeDice(applyVariables(notation, context.variables ?? {}));
  const sheet = context.sheet;
  const env: EnvironnementTypes = {
    attribut: (cle, entite) => {
      if (entite) return undefined;
      const v = sheet?.[cle];
      return v ? { type: typeOf(v.value), modificateur: v.modifier !== undefined } : undefined;
    },
    variable: () => undefined,
    des: true,
  };
  const compiled = compiler(processed, env, 'nombre');
  if (!compiled.ok) {
    const e = compiled.erreurs[0]!;
    throw invalidNotation(`Notation invalide : ${e.message} (position ${e.position})`);
  }
  let valeur: number;
  let jets: JetDes[];
  try {
    const r = evaluer(compiled.formule.noeud, {
      attribut: (cle) => sheet![cle]!.value,
      modificateur: (cle) => sheet![cle]!.modifier ?? 0,
      variable: (nom) => {
        throw new ErreurEvaluation(`Variable inconnue : ${nom}`, 0);
      },
      aleatoire: generator,
    });
    valeur = r.valeur as number;
    jets = r.jets;
    if (!Number.isFinite(valeur)) throw new ErreurEvaluation('Résultat non fini', 0);
  } catch (e) {
    if (e instanceof ErreurEvaluation) throw invalidNotation(`Notation invalide : ${e.message}`);
    throw e;
  }
  const dice = diceGroups(jets);

  // Détail : chaque notation de dés remplacée par ses valeurs, de la fin vers le début
  let detail = processed;
  const byPosition = jets.map((j, i) => ({ pos: j.position, group: dice[i]! }));
  for (const { pos, group } of byPosition.sort((a, b) => b.pos - a.pos)) {
    DICE_TOKEN.lastIndex = pos;
    const m = DICE_TOKEN.exec(detail);
    if (m) detail = detail.slice(0, pos) + formatGroup(group) + detail.slice(pos + m[0].length);
  }

  return {
    notation: processed,
    dice,
    symbols: null,
    ...firstGroup(dice),
    total: Math.floor(valeur),
    output: `${processed} = ${detail} = ${valeur}`,
    symbolResult: null,
    outcome: freeOutcome(dice),
  };
}

/** Composition d'un pool de dés à symboles : sorte de dé du système et nombre. */
export type Pool = { de: string; nombre: number }[];

const simplify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Pool écrit en notation `N<dé>` (`2aptitude 1difficulte`, `1 Maîtrise`) :
 * identifiant ou nom de la sorte, sans accents ni casse. `null` si la
 * notation ne contient aucun dé à symboles du système.
 */
export function symbolPool(notation: string, system: SystemeCharge | undefined): Pool | null {
  const sortes = system?.source.des?.sortes;
  if (!sortes?.length) return null;
  const byName = new Map<string, string>();
  for (const s of sortes) {
    byName.set(simplify(s.id), s.id);
    byName.set(simplify(s.nom), s.id);
  }
  const names = [...byName.keys()]
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(\\d+)\\s*(${names.join('|')})(?![\\w])`, 'g');
  const pool: Pool = [];
  for (const m of simplify(notation).matchAll(regex)) {
    pool.push({ de: byName.get(m[2]!)!, nombre: Number(m[1]) });
  }
  return pool.length ? pool : null;
}

/**
 * « 2 Succès + 1 Avantages » : résultats non nuls, dans l'ordre déclaré par le
 * système (formatSymbolDiceResult de l'ancienne app), « Aucun effet » sinon.
 */
export function formatSymbolResult(
  system: SystemeCharge | undefined,
  results: Record<string, number>,
): string {
  const declared = system?.source.des?.resultats ?? [];
  const known = new Set(declared.map((x) => x.cle));
  const parts = [
    ...declared.map((x) => ({ n: results[x.cle] ?? 0, name: x.nom ?? x.cle })),
    ...Object.entries(results)
      .filter(([k]) => !known.has(k))
      .map(([k, n]) => ({ n, name: k })),
  ]
    .filter((x) => x.n !== 0)
    .map((x) => `${x.n} ${x.name}`);
  return parts.length ? parts.join(' + ') : 'Aucun effet';
}

/** Détail d'un jet dont les dés sont déjà tirés (jet d'action de character) : `[17] + [3, 4] = 24`. */
export function formatDice(dice: readonly DiceGroup[], total: number | null): string {
  const groups = dice.map(formatGroup).join(' + ');
  return total === null ? groups : `${groups} = ${total}`;
}

/** Lance un pool de dés à symboles du système. */
export function rollPool(system: SystemeCharge, pool: Pool, generator: Generateur): Rolled {
  const des = system.source.des;
  if (!des) {
    throw new HttpError(
      400,
      'Requête invalide',
      'invalid_pool',
      `Le système ${system.source.id} n’a pas de dés à symboles`,
    );
  }
  let r: ReturnType<typeof lancerSymboles>;
  try {
    r = lancerSymboles(system, pool, generator);
  } catch (e) {
    throw new HttpError(400, 'Requête invalide', 'invalid_pool', (e as Error).message);
  }

  const symbolResult = formatSymbolResult(system, r.resultats);

  // « Aptitude [3, 5], Difficulté [2] » : dans l'ordre de la demande
  const order = [...new Set(pool.filter((p) => p.nombre > 0).map((p) => p.de))];
  const detail = order
    .map((id) => {
      const sorte = des.sortes.find((s) => s.id === id);
      const faces = r.des.filter((d) => d.de === id).map((d) => d.face);
      return `${sorte?.nom ?? id} [${faces.join(', ')}]`;
    })
    .join(', ');
  const first = r.des[0] ? des.sortes.find((s) => s.id === r.des[0]!.de) : undefined;

  return {
    notation: pool.map((p) => `${p.nombre}${p.de}`).join(' '),
    dice: [],
    symbols: {
      dice: r.des.map((d) => ({ die: d.de, face: d.face, symbols: d.symboles })),
      totals: r.symboles,
      results: r.resultats,
    },
    diceCount: r.des.length,
    diceFaces: first?.faces.length ?? 0,
    total: 0,
    output: `${detail} = ${symbolResult}`,
    symbolResult,
    outcome: { success: null, critical: false, fumble: false },
  };
}

/** Anciens `results` : valeur de chaque dé (écartés compris), ou face de chaque dé à symboles. */
export function flatResults(dice: readonly DiceGroup[], symbols: SymbolsResult | null): number[] {
  if (symbols) return symbols.dice.map((d) => d.face);
  return dice.flatMap((g) => g.values.map((v) => v.value));
}
