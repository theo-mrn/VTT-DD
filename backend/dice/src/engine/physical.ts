/**
 * Jets physiques : l'animation 3D des dés fait foi, comme dans l'ancienne app
 * (legacy/src/components/(dices)/dice-roller.tsx). Le client lit la face du
 * dessus de chaque dé à l'arrêt (`perform3DRoll`) et envoie ces valeurs
 * (`physicalResults`) ; le serveur calcule le jet avec elles, par le même
 * moteur que ses propres tirages.
 *
 * Le générateur rejoue les valeurs fournies : à chaque `entier(max)` demandé
 * par l'évaluation, il prend la prochaine valeur de la file correspondante :
 *
 *  - notation numérique : une file par nombre de faces (`d6`, `d20`), comme
 *    `calculateFinalResult` (le `tag` est ignoré) ;
 *  - pool de dés à symboles : une file par sorte de dé (`tag`, sinon `type`),
 *    puis, à défaut, la file de sa forme (`d8` pour Aptitude), comme
 *    `rollSymbolDiceNotation`. `lancerSymboles` lance les dés dans l'ordre des
 *    sortes déclarées par le système : c'est ce qui dit à quelle sorte
 *    appartient chaque tirage (Aptitude et Difficulté sont tous deux des d8).
 *
 * Une valeur manquante (dé explosif relancé, d100, dé non lancé en 3D) est
 * tirée par le générateur de repli (cryptographique en service) et comptée
 * dans `completed`. Une valeur hors des faces du dé, un type inconnu ou une
 * valeur jamais utilisée : 400 `invalid_physical_result`.
 */
import { HttpError } from '@vtt/platform';
import { LIMITES, regrouperPool, type Generateur, type SystemeCharge } from '@vtt/rules';
import { simplify, type Pool } from './roll.js';

/** Valeurs lues sur les dés 3D au plus, par jet. */
export const MAX_PHYSICAL_RESULTS = 100;

/**
 * Face lue sur un dé 3D. `type` : `d4`…`d100` pour un dé numérique, ou la
 * sorte d'un dé à symboles du système ; `tag` : sorte du dé à symboles quand
 * `type` est sa forme physique (`{ type: 'd8', tag: 'aptitude' }`).
 */
export interface PhysicalResult {
  type: string;
  value: number;
  tag?: string | null;
}

/** Générateur qui rejoue les faces lues sur les dés 3D, puis complète au hasard. */
export interface PhysicalGenerator extends Generateur {
  /** Valeurs tirées par le serveur faute de valeur fournie. */
  readonly completed: number;
  /** 400 `invalid_physical_result` s'il reste des valeurs jamais utilisées par le jet. */
  finish(): void;
}

export function invalidPhysicalResult(detail: string): HttpError {
  return new HttpError(400, 'Requête invalide', 'invalid_physical_result', detail);
}

/** Files de valeurs, par clé : `d6` (forme numérique) ou `de:aptitude` (sorte à symboles). */
type Queues = Map<string, { label: string; values: number[] }>;

function push(queues: Queues, key: string, label: string, value: number): void {
  const q = queues.get(key);
  if (q) q.values.push(value);
  else queues.set(key, { label, values: [value] });
}

const DIE_TYPE = /^d(\d{1,5})$/i;

/** Faces d'un type `dN` (`d20`, `D6`), `undefined` sinon. */
function numericFaces(type: string): number | undefined {
  const m = DIE_TYPE.exec(type.trim());
  if (!m) return undefined;
  const faces = Number(m[1]);
  return faces >= 1 && faces <= LIMITES.faces ? faces : undefined;
}

function checkValue(value: number, faces: number, die: string): void {
  if (!Number.isInteger(value) || value < 1 || value > faces)
    throw invalidPhysicalResult(`Valeur ${value} hors de 1..${faces} pour un dé ${die}`);
}

const unknownType = (type: string) =>
  invalidPhysicalResult(`Type de dé inconnu : ${type} (d4, d6, d8, d10, d12, d20, d100…)`);

function replay(
  queues: Queues,
  keysFor: (max: number) => string[],
  fallback: Generateur,
): PhysicalGenerator {
  let completed = 0;
  return {
    get completed() {
      return completed;
    },
    entier(max) {
      for (const key of keysFor(max)) {
        const v = queues.get(key)?.values.shift();
        if (v !== undefined) return v;
      }
      completed++;
      return fallback.entier(max);
    },
    finish() {
      const left = [...queues.values()]
        .filter((q) => q.values.length > 0)
        .map((q) => `${q.label} ×${q.values.length}`);
      if (left.length)
        throw invalidPhysicalResult(
          `Valeurs sans dé correspondant dans le jet : ${left.join(', ')}`,
        );
    },
  };
}

/** Notation numérique : une file par nombre de faces, `tag` ignoré (calculateFinalResult). */
export function notationGenerator(
  results: readonly PhysicalResult[],
  fallback: Generateur,
): PhysicalGenerator {
  const queues: Queues = new Map();
  for (const r of results) {
    const faces = numericFaces(r.type);
    if (faces === undefined) throw unknownType(r.type);
    checkValue(r.value, faces, `d${faces}`);
    push(queues, `d${faces}`, `d${faces}`, r.value);
  }
  return replay(queues, (max) => [`d${max}`], fallback);
}

/**
 * Pool de dés à symboles : une file par sorte (`tag`, sinon `type` : identifiant
 * ou nom, sans accents ni casse), et une file par forme (`d8`) pour les
 * valeurs sans sorte, prise quand celle de la sorte est vide.
 */
export function poolGenerator(
  system: SystemeCharge,
  pool: Pool,
  results: readonly PhysicalResult[],
  fallback: Generateur,
): PhysicalGenerator {
  const sortes = system.source.des?.sortes ?? [];
  const find = (key: string) => {
    const k = simplify(key.trim());
    return sortes.find((s) => simplify(s.id) === k || simplify(s.nom) === k);
  };

  const queues: Queues = new Map();
  for (const r of results) {
    const tag = r.tag?.trim() || undefined;
    const sorte = find(tag ?? r.type);
    const shape = numericFaces(r.type);
    if (sorte) {
      const faces = sorte.faces.length;
      if (shape !== undefined && shape !== faces)
        throw invalidPhysicalResult(`Le dé ${sorte.id} a ${faces} faces, pas ${shape}`);
      checkValue(r.value, faces, sorte.id);
      push(queues, `de:${sorte.id}`, sorte.id, r.value);
    } else if (tag) {
      throw invalidPhysicalResult(`Dé à symboles inconnu : ${tag}`);
    } else {
      if (shape === undefined) throw unknownType(r.type);
      checkValue(r.value, shape, `d${shape}`);
      push(queues, `d${shape}`, `d${shape}`, r.value);
    }
  }

  // Ordre des tirages de lancerSymboles : sortes dans l'ordre déclaré par le système
  const counts = new Map(regrouperPool(pool).map((p) => [p.de, p.nombre]));
  const order = sortes.flatMap((s) => Array.from({ length: counts.get(s.id) ?? 0 }, () => s));
  let next = 0;
  return replay(
    queues,
    (max) => {
      const sorte = order[next++];
      if (!sorte || sorte.faces.length !== max)
        throw new Error(`Tirage inattendu d'un dé à ${max} faces dans le pool`);
      return [`de:${sorte.id}`, `d${max}`];
    },
    fallback,
  );
}
