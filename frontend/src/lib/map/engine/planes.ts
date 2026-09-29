/**
 * Plans de rendu techniques de la carte, du bas vers le haut (docs/carte.md § 5), et réglage
 * « Affichage » du MJ (`map.display`, ex-`map.layers`). Données pures : le moteur crée un
 * conteneur Pixi par plan, dans cet ordre, au montage.
 *
 * À ne pas confondre avec les **calques du MJ** (`layers.ts`) : une pile ordonnée par carte,
 * tout entière dans le plan `content`.
 */

export const MAP_PLANES = [
  /** Image ou vidéo de fond. */
  'background',
  /** Quadrillages de la scène (module `grid`), en pixels du monde, sous tout le reste. */
  'grid',
  /** Les calques du MJ, du plus bas au plus haut ; dans chacun, les entités par `z` croissant. */
  'content',
  /** Obscurité, brouillard, lueurs (§ 9), pour les joueurs et la « vue joueur » du MJ. */
  'vision',
  /** Personnages joueurs hors de ma vue : toujours vus, au-dessus de l'ombre à 60 %. */
  'allies',
  /** Dessins et textes hors calque (`layerId` nul) : annotations, jamais dans l'ombre. */
  'annotations',
  /** Surcouches MJ : murs, portes, pièces, contours de brouillard, lumières. */
  'gm',
  /** Survol, sélection, poignées, étiquettes (taille constante). */
  'adornments',
  /** Fantômes des glissers des autres, tracés en cours, curseurs, pings. */
  'live',
  /** Aperçu de l'outil actif. */
  'tool',
] as const;

export type PlaneId = (typeof MAP_PLANES)[number];

/** Rang d'un plan (0 = tout en bas) : départage le test de toucher. */
export const PLANE_RANK: Readonly<Record<PlaneId, number>> = Object.fromEntries(
  MAP_PLANES.map((id, i) => [id, i]),
) as Record<PlaneId, number>;

/**
 * Réglage « Affichage » du MJ (`map.display`) : des familles entières masquées (lumières,
 * obstacles, brouillard…). Chaque sorte d'entité déclare sa famille (`EntityKind.display`).
 */
export const DISPLAY_TOGGLES = [
  { key: 'characters', label: 'Personnages' },
  { key: 'objects', label: 'Objets' },
  { key: 'drawings', label: 'Dessins' },
  { key: 'notes', label: 'Textes' },
  { key: 'obstacles', label: 'Obstacles' },
  { key: 'lights', label: 'Lumières' },
  { key: 'fog', label: 'Brouillard' },
  { key: 'music', label: 'Zones sonores' },
] as const;

export type DisplayKey = (typeof DISPLAY_TOGGLES)[number]['key'];

/** Familles affichées (`map.display`) ; une clé absente vaut « affichée ». */
export type DisplaySetting = Partial<Record<string, boolean>>;

export const isDisplayed = (setting: DisplaySetting | null | undefined, key: DisplayKey) =>
  setting?.[key] !== false;

/**
 * Réglage d'affichage d'une scène : `display`, ou `layers` tant que le contrat porte encore
 * l'ancien nom (docs/carte.md § 12, point 12).
 */
export function displayOf(scene: { [field: string]: unknown } | null | undefined): DisplaySetting {
  const value = scene?.display ?? scene?.layers;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as DisplaySetting)
    : {};
}
