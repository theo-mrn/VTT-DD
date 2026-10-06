/**
 * Modèle des tokens (docs/carte.md § 4, § 10, Personnages et PNJ) : calculs purs, sans Pixi ni
 * React, partagés par la sorte d'entité, l'outil de pose, le menu et les tests.
 *
 * - Taille d'un token : `pixelsPerUnit × scale × tokenScale` pixels du monde ; `pos` est son
 *   centre (comme le serveur, qui mesure la vision depuis ce point).
 * - Droits, miroir du service campaign : le MJ fait tout ; un joueur déplace ses personnages
 *   et active leur vision augmentée ; un spectateur regarde.
 * - Pose de N exemplaires : grille serrée centrée sur le point, une case d'écart (même calcul
 *   que `gridAround` du service, pour que le fantôme tombe là où les tokens arriveront).
 */
import type {
  CampaignSide,
  MapPoint,
  MapToken,
  MapTokenShape,
  MapTokenVisibility,
} from '@vtt/contracts';
import type { EntityAction, KindContext, MapViewer } from '@/lib/map/engine/entities/entity-kind';
import type { EntityGeometry, Point } from '@/lib/map/engine/geometry';
import type { MapDto } from '@/lib/map/store/map-store';

// ─── Donnée ──────────────────────────────────────────────────────────────────

/** Ce que la bibliothèque sait d'un PNJ pas encore créé (fantôme optimiste de la pose). */
export interface TokenDraft {
  name: string;
  imageUrl: string | null;
  side: CampaignSide;
}

/**
 * Token du magasin : la forme du contrat, plus les marques locales d'une écriture en cours
 * (jamais envoyées : les corps sont réduits aux champs du contrat).
 */
export type TokenData = MapToken &
  MapDto & {
    /** Brouillon d'une pose : nom, image et camp du PNJ à venir. */
    draft?: TokenDraft;
    /** Copie d'un PNJ (Dupliquer) : identifiant du token copié. */
    duplicateOf?: string;
    /** Instance de PNJ créée par une commande : la retirer supprime aussi le personnage. */
    npcInstance?: boolean;
  };

export const TOKENS_COLLECTION = 'tokens';

/** Rayon de vision d'un token neuf, en pixels du monde (défaut du service). */
export const DEFAULT_VISION_RADIUS = 100;

/** Nombre d'exemplaires d'une pose (contrat : 1 à 20). */
export const MAX_COPIES = 20;

// ─── Ce que l'on sait du personnage ──────────────────────────────────────────

/** Jauge de la ressource principale (première ressource de la présentation du système). */
export interface ResourceGauge {
  /** Clé de l'attribut (lue dans la présentation, jamais en dur). */
  key: string;
  label: string;
  value: number;
  max: number;
  /** Couleur déclarée par la présentation (donnée), sinon celle du thème. */
  color: string | null;
  /** Ressource qui se remplit (Blessures) plutôt que se vider (PV). */
  rising: boolean;
}

/** Personnage d'un token, tel que la table le connaît (liste de la campagne, fiche). */
export interface CharacterInfo {
  id: string;
  name: string | null;
  portraitUrl: string | null;
  /** Token fabriqué par le Studio du portrait (forme et cadre compris) ; null : le portrait. */
  tokenUrl?: string | null;
  side: CampaignSide | null;
  /** Personnage joueur ou PNJ, selon character ; null s'il ne le dit pas. */
  kind: 'pc' | 'npc' | null;
  ownerId: string | null;
  playedBy: string | null;
  /** Ressource principale ; null si elle n'est pas connue ou pas visible de ce viewer. */
  resource: ResourceGauge | null;
}

/** C'est un PNJ (duplicable, supprimable avec son personnage). */
/**
 * Image d'un token : le token du Studio de son personnage d'abord (image finale, forme et cadre
 * compris : `baked`), sinon l'image propre au token (tokens importés de l'ancienne version,
 * image choisie à la pose), sinon le portrait du personnage, sinon celle du brouillon.
 */
export function tokenImage(
  d: Pick<TokenData, 'imageUrl' | 'draft'>,
  c: Pick<CharacterInfo, 'tokenUrl' | 'portraitUrl'> | null | undefined,
): { url: string | null; baked: boolean } {
  if (c?.tokenUrl) return { url: c.tokenUrl, baked: true };
  return { url: d.imageUrl ?? c?.portraitUrl ?? d.draft?.imageUrl ?? null, baked: false };
}

export function isNpc(info: Pick<CharacterInfo, 'kind' | 'side'> | null | undefined): boolean {
  if (!info) return false;
  if (info.kind) return info.kind === 'npc';
  return info.side !== null && info.side !== 'players';
}

// ─── Géométrie ───────────────────────────────────────────────────────────────

/** Côté d'une case pour un token d'échelle 1 (`pixelsPerUnit × tokenScale`). */
export const cellSize = (ctx: Pick<KindContext, 'pixelsPerUnit' | 'tokenScale'>) =>
  ctx.pixelsPerUnit * ctx.tokenScale;

/** Taille d'un token en pixels du monde (§ 4). */
export function tokenSize(
  data: Pick<MapToken, 'scale'>,
  ctx: Pick<KindContext, 'pixelsPerUnit' | 'tokenScale'>,
): number {
  const scale = data.scale > 0 ? data.scale : 1;
  return cellSize(ctx) * scale;
}

export function tokenGeometry(data: TokenData, ctx: KindContext): EntityGeometry {
  const size = tokenSize(data, ctx);
  return { x: data.pos.x, y: data.pos.y, width: size, height: size, rotation: 0 };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Donnée après un geste : `pos` (centre) suit ; `scale` ne change que si la taille a changé
 * (un simple déplacement ne part qu'en `/tokens/move`).
 */
export function applyTokenGeometry(
  data: TokenData,
  g: EntityGeometry,
  ctx: KindContext,
): TokenData {
  const next: TokenData = { ...data, pos: { x: round2(g.x), y: round2(g.y) } };
  const size = tokenSize(data, ctx);
  const cell = cellSize(ctx);
  if (cell > 0 && Math.abs(g.width - size) > 0.01) {
    const scale = Math.round((Math.max(g.width, g.height) / cell) * 1000) / 1000;
    next.scale = Math.min(100, Math.max(0.1, scale));
  }
  return next;
}

/** Le point touche le token (disque, ou carré), à `tolerance` près. */
export function tokenContains(
  shape: MapTokenShape,
  g: EntityGeometry,
  p: Point,
  tolerance: number,
): boolean {
  const r = g.width / 2;
  if (shape === 'circle') return Math.hypot(p.x - g.x, p.y - g.y) <= r + tolerance;
  return Math.abs(p.x - g.x) <= r + tolerance && Math.abs(p.y - g.y) <= g.height / 2 + tolerance;
}

// ─── Pose de N exemplaires ───────────────────────────────────────────────────

/**
 * Positions de `count` tokens en grille serrée centrée sur `pos`, `step` d'écart : même calcul
 * que le service (`gridAround`, backend/campaign/src/modules/maps/npcs.ts).
 */
export function gridAround(pos: MapPoint, count: number, step: number): MapPoint[] {
  const n = Math.max(0, Math.floor(count));
  if (!n) return [];
  const cols = Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / cols);
  return Array.from({ length: n }, (_, i) => ({
    x: pos.x + ((i % cols) - (cols - 1) / 2) * step,
    y: pos.y + (Math.floor(i / cols) - (rows - 1) / 2) * step,
  }));
}

export const clampCount = (n: number) =>
  Math.min(MAX_COPIES, Math.max(1, Math.round(Number.isFinite(n) ? n : 1)));

// ─── Droits (miroir du service campaign) ─────────────────────────────────────

export const ownsToken = (data: Pick<MapToken, 'characterId'>, viewer: MapViewer) =>
  viewer.characterIds.includes(data.characterId);

/**
 * Droits sur un token. Le MJ fait tout (dupliquer : un PNJ seulement) ; un joueur sélectionne
 * tout ce qu'il voit, déplace et inspecte ses personnages ; un spectateur regarde.
 */
export function tokenCan(
  action: EntityAction,
  data: TokenData,
  viewer: MapViewer,
  info: Pick<CharacterInfo, 'kind' | 'side'> | null | undefined,
): boolean {
  if (action === 'view' || action === 'select') return true;
  if (viewer.role === 'gm') {
    if (action === 'duplicate') return !data.draft && isNpc(info);
    return true;
  }
  if (viewer.role !== 'player') return false;
  if (action === 'move' || action === 'inspect') return ownsToken(data, viewer);
  return false;
}

// ─── Visibilité ──────────────────────────────────────────────────────────────

export const VISIBILITY_LABELS: Readonly<
  Record<MapTokenVisibility, { label: string; hint: string }>
> = {
  visible: { label: 'Visible', hint: 'Vu des joueurs qui ont une ligne de vue' },
  hidden: { label: 'Caché', hint: 'Vu seulement de près ou éclairé' },
  ally: { label: 'Allié', hint: 'Toujours vu, et voit pour les joueurs' },
  custom: { label: 'Pour certains joueurs', hint: 'Vu des personnages choisis' },
  invisible: { label: 'Invisible', hint: 'Le MJ seul le voit' },
};

export const VISIBILITY_ORDER: readonly MapTokenVisibility[] = [
  'visible',
  'hidden',
  'ally',
  'custom',
  'invisible',
];

/** Nouvelle visibilité ; `custom` porte la liste des personnages qui voient le token. */
export function withVisibility(
  data: TokenData,
  visibility: MapTokenVisibility,
  visibleTo: readonly string[] = [],
): TokenData {
  return {
    ...data,
    visibility,
    visibleTo: visibility === 'custom' ? [...visibleTo] : [],
  };
}

/** Camps d'un PNJ posé depuis la bibliothèque. */
export const SIDE_LABELS: Readonly<Record<CampaignSide, string>> = {
  players: 'Joueurs',
  enemies: 'Ennemis',
  allies: 'Alliés',
};
