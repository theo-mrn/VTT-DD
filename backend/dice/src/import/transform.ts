/**
 * Conversion des documents Firestore en jets et préférences du service dice.
 * Fonctions pures : aucune base, aucun réseau (testées sur de faux exports).
 */
import type { DiceGroup, Outcome, RollVisibility, SymbolsResult } from '../db/schema.js';
import { firstGroup, freeOutcome } from '../engine/roll.js';
import { skin } from '../skins/catalog.js';
import { toDate, toText, type FirestoreDoc, type LegacyRoll, type LegacyUser } from './legacy.js';

/** `rolls/{code}/rolls/{id}` */
const ROLL_PATH = /^rolls\/([^/]+)\/rolls\/([^/]+)$/;

export interface ImportedRoll {
  /** Chemin du document : identifiant stable pour `legacy_ids`. */
  legacyId: string;
  /** Code de la campagne (`Salle/{code}`). */
  campaignCode: string;
  uid?: string;
  userName: string;
  userAvatar: string | null;
  persoId?: string;
  visibility: RollVisibility;
  notation: string | null;
  output: string;
  symbolResult: string | null;
  legacyType: string | null;
  dice: DiceGroup[];
  symbols: SymbolsResult | null;
  diceCount: number;
  diceFaces: number;
  total: number;
  outcome: Outcome;
  createdAt: Date;
  warnings: string[];
}

export const isRollPath = (path: string) => ROLL_PATH.test(path);

/**
 * Découpe les anciens `results` (valeurs à la suite) en groupes de dés, avec
 * la notation après substitution des variables (début de `output`), comme
 * calculateFinalResult de l'ancienne app : `NdM` et `NdMkhK` / `NdMklK`.
 * `null` si la notation ne correspond pas aux valeurs enregistrées.
 */
export function splitResults(notation: string, results: number[]): DiceGroup[] | null {
  const groups: DiceGroup[] = [];
  let i = 0;
  for (const m of notation.matchAll(/(\d+)d(\d+)(?:k([hl])(\d+))?/gi)) {
    const count = Number(m[1]);
    const faces = Number(m[2]);
    const values = results.slice(i, i + count);
    if (values.length !== count || values.some((v) => v < 1 || v > faces)) return null;
    i += count;
    let kept = values.map(() => true);
    if (m[3]) {
      const keep = Number(m[4]);
      const order = values
        .map((v, idx) => ({ v, idx }))
        .sort((a, b) => (m[3]!.toLowerCase() === 'h' ? b.v - a.v : a.v - b.v));
      const keptIdx = new Set(order.slice(0, keep).map((x) => x.idx));
      kept = values.map((_, idx) => keptIdx.has(idx));
    }
    groups.push({
      faces,
      values: values.map((value, idx) => ({ value, kept: kept[idx]!, exploded: false })),
    });
  }
  return groups.length && i === results.length ? groups : null;
}

export function transformRoll(doc: FirestoreDoc<LegacyRoll>): ImportedRoll {
  const m = ROLL_PATH.exec(doc.path);
  if (!m) throw new Error(`Chemin inattendu : ${doc.path}`);
  const d = doc.data ?? {};
  const warnings: string[] = [];

  const createdAt = toDate(d.timestamp);
  if (!createdAt) throw new Error('Date du jet (timestamp) absente ou invalide');

  const results = Array.isArray(d.results)
    ? d.results.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
    : [];
  const output = toText(d.output) ?? '';
  const notation = toText(d.notation) ?? null;
  const symbolResult = toText(d.symbolResult) ?? null;
  const legacyCount = typeof d.diceCount === 'number' ? d.diceCount : undefined;
  const legacyFaces = typeof d.diceFaces === 'number' ? d.diceFaces : undefined;

  let dice: DiceGroup[] = [];
  let symbols: SymbolsResult | null = null;
  if (symbolResult) {
    // Dés à symboles : l'ancienne app n'enregistrait que les faces, sans la sorte de dé
    symbols = {
      dice: results.map((face) => ({ die: '', face, symbols: {} })),
      totals: {},
      results: {},
    };
  } else if (results.length) {
    // Notation après substitution des variables : début de `output`, sinon la notation saisie
    const processed = output.split(' = ')[0] || notation || '';
    const groups = splitResults(processed, results);
    if (groups) dice = groups;
    else {
      dice = [
        {
          faces: legacyFaces ?? Math.max(...results),
          values: results.map((value) => ({ value, kept: true, exploded: false })),
        },
      ];
      warnings.push('Détail des dés non reconstitué : valeurs regroupées en un seul groupe');
    }
  }

  const rawTotal = typeof d.total === 'number' ? d.total : Number(d.total);
  let total = Number.isFinite(rawTotal) ? rawTotal : 0;
  if (!Number.isFinite(rawTotal) && !symbolResult) {
    total = results.reduce((s, v) => s + v, 0);
    warnings.push('Total absent : somme des dés');
  }
  const first = firstGroup(dice);

  return {
    legacyId: doc.path,
    campaignCode: m[1]!,
    ...(toText(d.uid) ? { uid: toText(d.uid)! } : {}),
    userName: (toText(d.userName) ?? 'Aventurier').slice(0, 200),
    userAvatar: toText(d.userAvatar) ?? null,
    ...(toText(d.persoId) ? { persoId: toText(d.persoId)! } : {}),
    visibility: d.isBlind ? 'gm' : d.isPrivate ? 'private' : 'public',
    notation: notation ? notation.slice(0, 500) : null,
    output: output.slice(0, 5000),
    symbolResult,
    legacyType: toText(d.type) ?? null,
    dice,
    symbols,
    diceCount: legacyCount ?? (symbols ? results.length : first.diceCount),
    diceFaces: legacyFaces ?? first.diceFaces,
    total,
    outcome: symbols ? { success: null, critical: false, fumble: false } : freeOutcome(dice),
    createdAt,
    warnings,
  };
}

export interface ImportedPreferences {
  uid: string;
  /** Skin choisi, s'il existe au catalogue. */
  skinId: string | null;
  /** Skins payants débloqués (les gratuits sont toujours disponibles). */
  inventory: string[];
  /** Premium en cours dans l'ancienne app : accès à tous les skins. */
  allSkins: boolean;
  warnings: string[];
}

/**
 * Fin du premium en millisecondes : `premiumEndDate` en secondes Unix (le
 * `cancelAt` de Stripe), tolère des millisecondes ou une date Firestore.
 * `null` : sans échéance (absent, null ou 0) ; `undefined` : illisible.
 */
function premiumEnd(v: unknown): number | null | undefined {
  if (v === undefined || v === null || v === 0) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? (v < 1e12 ? v * 1000 : v) : undefined;
  return toDate(v)?.getTime();
}

/**
 * `users/{uid}.dice_skin`, `dice_inventory` et le premium ; `null` si
 * l'utilisateur n'a rien de tout cela. Premium en cours (`premium: true`,
 * échéance absente, 0 ou future) : accès à tous les skins, et le skin choisi
 * est repris sans entrer dans l'inventaire (il était possédé par le premium).
 */
export function transformPreferences(
  doc: FirestoreDoc<LegacyUser>,
  now = Date.now(),
): ImportedPreferences | null {
  const d = doc.data ?? {};
  const chosen = toText(d.dice_skin);
  const trail = toText(d.dice_trail);
  const owned = Array.isArray(d.dice_inventory)
    ? d.dice_inventory.filter((s): s is string => typeof s === 'string')
    : [];
  const warnings: string[] = [];
  let allSkins = false;
  if (d.premium === true) {
    const end = premiumEnd(d.premiumEndDate);
    if (end === undefined) warnings.push('Échéance du premium illisible : premium ignoré');
    else if (end !== null && end <= now)
      warnings.push(`Premium échu le ${new Date(end).toISOString()} : premium ignoré`);
    else allSkins = true;
  }
  if (!chosen && owned.length === 0 && !allSkins && !trail) return null;
  // Pas de champ de traînée dans les préférences : les traînées sont en pause
  if (trail) warnings.push(`Traînée ignorée : ${trail} (traînées en pause)`);
  const inventory = new Set<string>();
  for (const id of owned) {
    const s = skin(id);
    if (!s) warnings.push(`Skin inconnu ignoré : ${id}`);
    else if (!s.free) inventory.add(id);
  }
  let skinId: string | null = null;
  if (chosen) {
    const s = skin(chosen);
    if (!s) warnings.push(`Skin choisi inconnu : ${chosen} (skin par défaut)`);
    else {
      skinId = chosen;
      // Skin payant choisi, absent de l'inventaire et sans premium en cours : on le garde
      if (!s.free && !allSkins) inventory.add(chosen);
    }
  }
  return { uid: doc.id, skinId, inventory: [...inventory], allSkins, warnings };
}
