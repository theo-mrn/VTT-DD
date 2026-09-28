/**
 * Modèle de la grille de fiche : blocs (widgets de la présentation), positions par largeur
 * d'écran, disposition par défaut et conversion vers le contrat du service character
 * (`SheetLayout`, docs/api-character.md). Fonctions pures, sans React.
 *
 * Largeurs : `lg` (12 colonnes), `md` (8), `sm` (2), `xs` (1), choisies sur la largeur du
 * conteneur (la fiche vit aussi dans un panneau de la table). Seules les largeurs que
 * l'utilisateur a arrangées sont enregistrées ; les autres sont déduites de la plus large
 * enregistrée, dans son ordre de lecture.
 */
import { Widget } from '@vtt/rules';
import {
  arrangementParams,
  isArrangementParam,
  readArrangement,
  type TileArrangement,
} from '@/components/fiche/blocks/tiles/model';
import type { SheetBreakpoint, SheetLayout, SheetLayoutItem } from '@/lib/personnages';

export const BREAKPOINT_ORDER: SheetBreakpoint[] = ['lg', 'md', 'sm', 'xs'];
/** Largeur minimale du conteneur (px) de chaque disposition. */
export const BREAKPOINTS: Record<SheetBreakpoint, number> = { lg: 1024, md: 700, sm: 480, xs: 0 };
export const COLUMNS: Record<SheetBreakpoint, number> = { lg: 12, md: 8, sm: 2, xs: 1 };
/**
 * Pas vertical de la grille (px) : fin, pour qu'une hauteur automatique épouse son contenu
 * à quelques pixels près. Les rangées ne sont pas espacées : l'espace vertical entre blocs
 * est la marge basse du cadre de chaque bloc (MARGIN), comprise dans sa hauteur.
 */
export const ROW_HEIGHT = 4;
/** Espace entre blocs (px) : marge horizontale de la grille, marge basse du cadre. */
export const MARGIN = 12;
/** Format de la mise en page enregistrée : 2, pas de 4 px ; 1, rangées de 32 px espacées de 16. */
export const LAYOUT_FORMAT = 2;
const LEGACY_ROW = 32;
const LEGACY_MARGIN = 16;
/** Largeur type du conteneur, pour estimer la hauteur d'un bloc avant de le mesurer. */
const NOMINAL_WIDTH: Record<SheetBreakpoint, number> = { lg: 1216, md: 860, sm: 600, xs: 380 };
/** Hauteur maximale d'un bloc par défaut (rangées de l'ancienne grille, ~670 px). */
const MAX_DEFAULT_ROWS = 14;
export const MAX_BLOCKS = 40;

export interface BlockSize {
  w: number;
  h: number;
}

/** Hauteur d'un bloc : `auto` suit son contenu, `fixed` garde la hauteur réglée (défile). */
export type HeightMode = 'auto' | 'fixed';

/** Bloc de la grille : son widget, ou null s'il n'est plus lisible (système mis à jour). */
export interface GridBlock {
  id: string;
  widget: Widget | null;
  /** Hauteur choisie en personnalisation ; absente : préférence du type de bloc. */
  height?: HeightMode;
  /**
   * Disposition interne d'un bloc de tuiles (colonnes, ordre, masques), enregistrée dans
   * ses paramètres ; absente : celle de la présentation.
   */
  arrangement?: TileArrangement;
  /** Bloc tel qu'enregistré, gardé tel quel s'il n'est plus lisible. */
  raw: SheetLayout['blocks'][number];
}

export type GridLayouts = Record<SheetBreakpoint, SheetLayoutItem[]>;

/** Mise en page de travail : les blocs, les positions de chaque largeur, celles arrangées. */
export interface GridState {
  blocks: GridBlock[];
  layouts: GridLayouts;
  /** Largeurs arrangées par l'utilisateur (enregistrées) ; les autres sont déduites. */
  arranged: SheetBreakpoint[];
}

/** Tailles d'un bloc : `size` par défaut sur grand écran, `min` le minimum. */
export type SizeOf = (block: GridBlock, bp: SheetBreakpoint, widthPx: number) => BlockSize;
export type MinSizeOf = (block: GridBlock) => BlockSize;

export function breakpointFor(width: number): SheetBreakpoint {
  return BREAKPOINT_ORDER.find((bp) => width >= BREAKPOINTS[bp]) ?? 'xs';
}

/** Largeur en px d'un bloc de `w` colonnes dans un conteneur de `container` px. */
export function blockWidthPx(w: number, bp: SheetBreakpoint, container = NOMINAL_WIDTH[bp]) {
  const cols = COLUMNS[bp];
  const colonne = (container - (cols - 1) * MARGIN) / cols;
  return w * colonne + (w - 1) * MARGIN;
}

/** Unités de hauteur pour une carte de `px` pixels (marge basse du cadre en plus). */
export function heightUnits(px: number): number {
  return Math.max(1, Math.ceil((px + MARGIN) / ROW_HEIGHT));
}

/**
 * Unités de hauteur d'une hauteur en rangées de l'ancienne grille (32 px espacées de 16) :
 * tailles déclarées par les blocs, mises en page enregistrées au format 1.
 */
export function legacyRows(h: number): number {
  return heightUnits(h * (LEGACY_ROW + LEGACY_MARGIN) - LEGACY_MARGIN);
}

/** Positions d'une mise en page au format 1, ramenées au pas actuel. */
function fromLegacy(layouts: SheetLayout['layouts']): SheetLayout['layouts'] {
  const facteur = (LEGACY_ROW + LEGACY_MARGIN) / ROW_HEIGHT;
  const r: SheetLayout['layouts'] = {};
  for (const bp of BREAKPOINT_ORDER) {
    const l = layouts[bp];
    if (l) r[bp] = l.map((it) => ({ ...it, y: it.y * facteur, h: legacyRows(it.h) }));
  }
  return r;
}

export function clampDefaultHeight(h: number, min: number): number {
  return Math.max(min, Math.min(legacyRows(MAX_DEFAULT_ROWS), h));
}

/** Largeur d'un bloc dans une disposition, déduite de sa largeur sur grand écran. */
export function scaleWidth(wLg: number, bp: SheetBreakpoint, minLg: number): number {
  const cols = COLUMNS[bp];
  switch (bp) {
    case 'lg':
      return clamp(wLg, Math.min(minLg, cols), cols);
    case 'md':
      return clamp(
        Math.round((wLg * cols) / 12),
        Math.min(cols, Math.ceil((minLg * cols) / 12)),
        cols,
      );
    case 'sm':
      // Deux colonnes : les blocs d'au moins une demi-largeur passent en pleine largeur
      return wLg <= 4 ? 1 : cols;
    case 'xs':
      return 1;
  }
}

/** Minimum d'un bloc dans une disposition. */
export function scaleMin(min: BlockSize, bp: SheetBreakpoint): BlockSize {
  const cols = COLUMNS[bp];
  const w = bp === 'lg' ? min.w : bp === 'md' ? Math.ceil((min.w * cols) / 12) : 1;
  return { w: Math.min(cols, Math.max(1, w)), h: min.h };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Place des blocs dans l'ordre donné, chacun au plus haut possible (au plus à gauche à
 * hauteur égale) : une grille dense qui garde l'ordre de lecture.
 */
export function pack(
  items: { i: string; w: number; h: number }[],
  cols: number,
): SheetLayoutItem[] {
  const hauteurs = new Array<number>(cols).fill(0);
  return items.map(({ i, w: largeur, h }) => {
    const w = clamp(largeur, 1, cols);
    let meilleur = 0;
    let y = Number.POSITIVE_INFINITY;
    for (let x = 0; x + w <= cols; x++) {
      const haut = Math.max(...hauteurs.slice(x, x + w));
      if (haut < y) {
        y = haut;
        meilleur = x;
      }
    }
    for (let c = meilleur; c < meilleur + w; c++) hauteurs[c] = y + h;
    return { i, x: meilleur, y, w, h };
  });
}

/** Ordre de lecture d'une disposition : de haut en bas, puis de gauche à droite. */
export function readingOrder(items: SheetLayoutItem[]): SheetLayoutItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

// ─── Blocs ↔ contrat du service ─────────────────────────────────────────────

type ParamValue = SheetLayout['blocks'][number]['params'][string];

/** Bloc du service pour un widget : type, titre, et les autres champs en paramètres. */
export function toApiBlock(id: string, widget: Widget): SheetLayout['blocks'][number] {
  const { type, titre, ...reste } = widget;
  const params: Record<string, ParamValue> = {};
  for (const [k, v] of Object.entries(reste))
    if (
      typeof v === 'string' ||
      typeof v === 'number' ||
      typeof v === 'boolean' ||
      (Array.isArray(v) && v.every((x) => typeof x === 'string'))
    )
      params[k] = v as ParamValue;
  return { id, type, title: titre, params };
}

/** Le système sait-il encore afficher ce widget (attributs, sortes, champs existants) ? */
export type Availability = (widget: Widget) => boolean;

/**
 * Widget d'un bloc enregistré ; null si la présentation ne sait plus l'afficher (forme
 * inconnue) ou si le système ne le permet plus (`disponible` : attribut retiré…).
 */
export function fromApiBlock(
  b: SheetLayout['blocks'][number],
  disponible?: Availability,
): GridBlock {
  // Les paramètres de disposition ne sont pas ceux du widget de la présentation
  const params = Object.fromEntries(
    Object.entries(b.params).filter(([k]) => !isArrangementParam(k)),
  );
  const r = Widget.safeParse({ ...params, type: b.type, titre: b.title });
  const widget = r.success && (!disponible || disponible(r.data)) ? r.data : null;
  const arrangement = readArrangement(b.params);
  return {
    id: b.id,
    widget,
    raw: b,
    ...(b.height ? { height: b.height } : {}),
    ...(arrangement ? { arrangement } : {}),
  };
}

export function gridBlock(id: string, widget: Widget): GridBlock {
  return { id, widget, raw: toApiBlock(id, widget) };
}

/** Identifiant libre pour un nouveau bloc. */
export function newBlockId(blocks: GridBlock[]): string {
  const pris = new Set(blocks.map((b) => b.id));
  let n = blocks.length + 1;
  while (pris.has(`b${n}`)) n++;
  return `b${n}`;
}

// ─── Dispositions ────────────────────────────────────────────────────────────

/**
 * Disposition complète de chaque largeur : celles enregistrées (nettoyées : blocs connus,
 * dans la grille), les autres déduites de la plus large enregistrée, ou tirées des tailles
 * par défaut des blocs dans leur ordre.
 */
export function completeLayouts(
  blocks: GridBlock[],
  stored: Partial<GridLayouts>,
  sizeOf: SizeOf,
  minOf: MinSizeOf,
): GridLayouts {
  const ids = new Set(blocks.map((b) => b.id));
  const nettoyees: Partial<GridLayouts> = {};
  for (const bp of BREAKPOINT_ORDER) {
    const l = stored[bp];
    if (!l) continue;
    const cols = COLUMNS[bp];
    const vus = new Set<string>();
    const gardes = l
      .filter((it) => ids.has(it.i) && !vus.has(it.i) && vus.add(it.i))
      .map((it) => {
        const w = clamp(it.w, 1, cols);
        return {
          i: it.i,
          w,
          h: Math.max(1, it.h),
          x: clamp(it.x, 0, cols - w),
          y: Math.max(0, it.y),
        };
      });
    // Blocs ajoutés depuis : placés en bas, à leur taille par défaut
    const bas = gardes.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    const manquants = pack(
      blocks
        .filter((b) => !vus.has(b.id))
        .map((b) => ({ i: b.id, ...sizeOf(b, bp, NOMINAL_WIDTH[bp]) })),
      cols,
    ).map((it) => ({ ...it, y: it.y + bas }));
    nettoyees[bp] = [...gardes, ...manquants];
  }

  const reference = BREAKPOINT_ORDER.find((bp) => nettoyees[bp]);
  const ordre: string[] = reference
    ? readingOrder(nettoyees[reference]!).map((it) => it.i)
    : blocks.map((b) => b.id);
  const parId = new Map(blocks.map((b) => [b.id, b]));
  const hauteurReference = new Map(
    reference ? nettoyees[reference]!.map((it) => [it.i, it.h] as const) : [],
  );
  const largeurLg = (b: GridBlock): number => {
    if (reference === 'lg') return nettoyees.lg!.find((it) => it.i === b.id)?.w ?? 6;
    if (reference) {
      const it = nettoyees[reference]!.find((x) => x.i === b.id);
      if (it) return Math.round((it.w * 12) / COLUMNS[reference]);
    }
    return sizeOf(b, 'lg', NOMINAL_WIDTH.lg).w;
  };

  const r = {} as GridLayouts;
  for (const bp of BREAKPOINT_ORDER) {
    const deja = nettoyees[bp];
    if (deja) {
      r[bp] = deja;
      continue;
    }
    const cols = COLUMNS[bp];
    r[bp] = pack(
      ordre
        .map((id) => parId.get(id))
        .filter((b): b is GridBlock => Boolean(b))
        .map((b) => {
          const min = minOf(b);
          const w = scaleWidth(largeurLg(b), bp, min.w);
          const estime = sizeOf(b, bp, blockWidthPx(w, bp)).h;
          // Plus étroit, un bloc s'allonge : jamais moins haut que sur la disposition de référence
          const h = Math.max(estime, hauteurReference.get(b.id) ?? 0, min.h);
          return { i: b.id, w, h };
        }),
      cols,
    );
  }
  return r;
}

type ApiBlock = SheetLayout['blocks'][number];

/**
 * Anciens blocs de progression (Arbre, Compétences à une sorte) : réunis dans un seul bloc
 * Compétences, à la place du premier d'entre eux, avec l'union de leurs sortes. Les autres
 * sont retirés (leurs positions tombent avec eux).
 */
export function migrateBlocks(blocks: ApiBlock[]): ApiBlock[] {
  const legacy = (b: ApiBlock) =>
    b.type === 'arbres' || (b.type === 'competences' && typeof b.params.sorte === 'string');
  const first = blocks.find(legacy);
  if (!first) return blocks;
  const olds = blocks.filter(legacy);
  const sortes = [
    ...new Set(olds.flatMap((b) => (typeof b.params.sorte === 'string' ? [b.params.sorte] : []))),
  ];
  // Un ancien Arbre seul montre toute la progression (sortes déduites)
  const filtre = olds.map((b) => b.params.filtreChamp).find((f) => typeof f === 'string');
  const merged: ApiBlock = {
    ...first,
    type: 'competences',
    params: {
      ...(sortes.length && !olds.some((b) => b.type === 'arbres') ? { sortes } : {}),
      ...(filtre !== undefined ? { filtreChamp: filtre } : {}),
    },
  };
  return blocks.flatMap((b) => (b === first ? [merged] : legacy(b) ? [] : [b]));
}

/** État de travail d'une mise en page enregistrée (ou par défaut, si `stored` est null). */
export function stateFrom(
  stored: SheetLayout | null,
  defaults: () => GridBlock[],
  sizeOf: SizeOf,
  minOf: MinSizeOf,
  disponible?: Availability,
): GridState {
  // Une mise en page d'un format inconnu est ignorée : la disposition par défaut s'affiche
  const lisible =
    (stored?.format === 1 || stored?.format === LAYOUT_FORMAT) && Array.isArray(stored.blocks)
      ? stored
      : null;
  const blocks = lisible
    ? migrateBlocks(lisible.blocks).map((b) => fromApiBlock(b, disponible))
    : defaults();
  const layouts = !lisible
    ? {}
    : lisible.format === 1
      ? fromLegacy(lisible.layouts ?? {})
      : (lisible.layouts ?? {});
  return {
    blocks,
    layouts: completeLayouts(blocks, layouts, sizeOf, minOf),
    arranged: BREAKPOINT_ORDER.filter((bp) => layouts[bp]),
  };
}

/** Mise en page à enregistrer : les blocs et les seules largeurs arrangées. */
export function toApiLayout(state: GridState): SheetLayout {
  const layouts: SheetLayout['layouts'] = {};
  for (const bp of state.arranged)
    layouts[bp] = state.layouts[bp].map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
  return {
    format: LAYOUT_FORMAT,
    blocks: state.blocks.map((b) => {
      // Bloc illisible : gardé tel qu'enregistré, sa disposition comprise
      const api = b.widget
        ? withParams(toApiBlock(b.id, b.widget), arrangementParams(b.arrangement))
        : b.raw;
      return b.height ? { ...api, height: b.height } : api;
    }),
    layouts,
  };
}

function withParams(
  block: SheetLayout['blocks'][number],
  extra: Record<string, ParamValue>,
): SheetLayout['blocks'][number] {
  return Object.keys(extra).length ? { ...block, params: { ...block.params, ...extra } } : block;
}

/** Positions ramenées aux champs du contrat (sans les métadonnées de react-grid-layout). */
export function cleanItems(items: readonly SheetLayoutItem[]): SheetLayoutItem[] {
  return items.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
}
