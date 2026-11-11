/**
 * Conversion d'un fichier Universal VTT (`.dd2vtt`, `.uvtt`, `.df2vtt` : Dungeondraft,
 * DungeonAlchemist, DungeonFog…) en éléments de scène (docs/import-uvtt.md § 4). Pur : ni
 * réseau ni DOM ; l'image est décodée à part (`uvttImage`).
 *
 * Le fichier compte en cases (`pixel = (point − map_origin) × pixels_per_grid`) ; `scale`
 * applique la réduction de l'image envoyée (fond limité à 4096 px de côté).
 */
import type { CreateMapLight, CreateMapObstacle, MapPoint } from '@vtt/contracts';
import { z } from 'zod';

const Point = z.object({ x: z.number().finite(), y: z.number().finite() });
const Polyline = z.array(Point);

export const UvttDocument = z.object({
  resolution: z.object({
    map_origin: Point.default({ x: 0, y: 0 }),
    map_size: Point,
    pixels_per_grid: z.number().positive(),
  }),
  line_of_sight: z.array(Polyline).default([]),
  objects_line_of_sight: z.array(Polyline).default([]),
  portals: z
    .array(
      z.object({
        bounds: z.array(Point).min(2),
        closed: z.boolean().default(true),
      }),
    )
    .default([]),
  lights: z
    .array(
      z.object({
        position: Point,
        range: z.number().nonnegative(),
        intensity: z.number().default(1),
        color: z.string().default('ffffffff'),
      }),
    )
    .default([]),
  environment: z
    .object({ baked_lighting: z.boolean().default(false) })
    .partial()
    .default({}),
  image: z.string().min(1),
});
export type UvttDocument = z.infer<typeof UvttDocument>;

/** Lit le texte d'un fichier UVTT ; null s'il n'en est pas un. */
export function parseUvtt(text: string): UvttDocument | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = UvttDocument.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Extensions reconnues (le format est le même). */
export const UVTT_EXTENSIONS = ['.dd2vtt', '.uvtt', '.df2vtt'] as const;
export const isUvttName = (name: string) =>
  UVTT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));

/** Taille d'origine de l'image, en pixels. */
export function uvttSize(doc: UvttDocument): { width: number; height: number } {
  const { map_size, pixels_per_grid } = doc.resolution;
  return {
    width: Math.round(map_size.x * pixels_per_grid),
    height: Math.round(map_size.y * pixels_per_grid),
  };
}

/** Image du fichier (base64, avec ou sans préfixe `data:`), type lu dans ses premiers octets. */
export function uvttImage(doc: UvttDocument, name: string): File {
  const base64 = doc.image.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const type = imageType(bytes);
  const ext = type.split('/')[1] === 'jpeg' ? 'jpg' : type.split('/')[1];
  const base = name.replace(/\.[^.]+$/, '') || 'carte';
  return new File([bytes], `${base}.${ext}`, { type });
}

function imageType(b: Uint8Array): string {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return 'image/png';
}

/** Points d'un obstacle au plus (contrat `mapPoints(2, 1000)`). */
const MAX_POINTS = 1000;
/** Écart sous lequel un point est fondu dans le précédent, ou retiré d'un alignement (px). */
const EPSILON = 1;

export interface UvttScene {
  /** Côté d'une case, en pixels de l'image envoyée. */
  cellPx: number;
  walls: CreateMapObstacle[];
  /** Murs des objets (rochers, colonnes) : à part, l'import peut les écarter. */
  objectWalls: CreateMapObstacle[];
  doors: CreateMapObstacle[];
  /** Vide si les ombres sont peintes dans l'image (`baked_lighting`). */
  lights: CreateMapLight[];
}

/**
 * Éléments de scène du fichier, à l'échelle `scale` (taille envoyée / taille d'origine). Coupés
 * au cadre de l'image : Dungeondraft exporte les murs de tout le niveau, même quand l'image n'en
 * montre qu'une partie.
 */
export function convertUvtt(doc: UvttDocument, scale = 1): UvttScene {
  const { map_origin, pixels_per_grid } = doc.resolution;
  const k = pixels_per_grid * scale;
  const size = uvttSize(doc);
  const frame = { width: size.width * scale, height: size.height * scale };
  const toPx = (p: { x: number; y: number }): MapPoint => ({
    x: round2((p.x - map_origin.x) * k),
    y: round2((p.y - map_origin.y) * k),
  });
  const walls = (lines: { x: number; y: number }[][]) =>
    lines.flatMap((line) =>
      clipPolyline(line.map(toPx), frame)
        .flatMap((piece) => splitPolyline(simplify(piece)))
        .map((points): CreateMapObstacle => ({ kind: 'wall', points })),
    );

  return {
    cellPx: k,
    walls: walls(doc.line_of_sight),
    objectWalls: walls(doc.objects_line_of_sight),
    doors: doc.portals.flatMap((portal): CreateMapObstacle[] => {
      const clipped = clipSegment(
        toPx(portal.bounds[0]!),
        toPx(portal.bounds[portal.bounds.length - 1]!),
        frame,
      );
      if (!clipped || distance(clipped[0], clipped[1]) < EPSILON) return [];
      return [{ kind: 'door', points: clipped, isOpen: !portal.closed, isLocked: false }];
    }),
    lights: doc.environment.baked_lighting
      ? []
      : doc.lights
          .map((l) => ({ ...l, pos: toPx(l.position) }))
          .filter((l) => l.range > 0 && inside(l.pos, frame))
          .map((l): CreateMapLight => ({
            pos: l.pos,
            // Rayon en cases, comme `range`
            radius: round2(l.range),
            color: uvttColor(l.color),
            intensity: Math.min(1, Math.max(0, l.intensity)),
            falloff: 0.5,
            visible: true,
          })),
  };
}

/** `AARRGGBB` (ou `#RRGGBB`) → `#RRGGBB` ; blanc si illisible. */
export function uvttColor(color: string): string {
  const hex = color.replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{8}$/.test(hex)) return `#${hex.slice(2)}`;
  if (/^[0-9a-f]{6}$/.test(hex)) return `#${hex}`;
  return '#ffffff';
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const distance = (a: MapPoint, b: MapPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Retire les points en double et les points intermédiaires alignés (DungeonAlchemist découpe
 * ses murs en centaines de petits segments) ; une ligne fermée le reste.
 */
export function simplify(points: MapPoint[]): MapPoint[] {
  const out: MapPoint[] = [];
  for (const p of points) {
    if (out.length && distance(out[out.length - 1]!, p) < EPSILON) continue;
    while (out.length >= 2 && collinear(out[out.length - 2]!, out[out.length - 1]!, p)) out.pop();
    out.push(p);
  }
  return out.length >= 2 ? out : [];
}

/** `b` est sur le segment `a`–`c` (à `EPSILON` près), sans retour en arrière. */
function collinear(a: MapPoint, b: MapPoint, c: MapPoint): boolean {
  const ac = distance(a, c);
  if (ac < EPSILON) return false;
  const cross = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  const dot = (b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y);
  return cross / ac < EPSILON / 2 && dot > 0 && dot < ac * ac;
}

/** Coupe une ligne trop longue en morceaux soudés (le dernier point de l'un ouvre le suivant). */
export function splitPolyline(points: MapPoint[], max = MAX_POINTS): MapPoint[][] {
  if (points.length < 2) return [];
  const out: MapPoint[][] = [];
  for (let i = 0; i < points.length - 1; i += max - 1) out.push(points.slice(i, i + max));
  return out;
}

interface Frame {
  width: number;
  height: number;
}

const inside = (p: MapPoint, f: Frame) => p.x >= 0 && p.y >= 0 && p.x <= f.width && p.y <= f.height;

/** Segment coupé au cadre (Liang-Barsky) ; null s'il est entièrement dehors. */
export function clipSegment(a: MapPoint, b: MapPoint, f: Frame): [MapPoint, MapPoint] | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a.x],
    [dx, f.width - a.x],
    [-dy, a.y],
    [dy, f.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  const at = (t: number): MapPoint => ({ x: round2(a.x + t * dx), y: round2(a.y + t * dy) });
  return [at(t0), at(t1)];
}

/** Ligne coupée au cadre : les morceaux à l'intérieur, chacun d'un seul tenant. */
export function clipPolyline(points: MapPoint[], f: Frame): MapPoint[][] {
  const pieces: MapPoint[][] = [];
  let current: MapPoint[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const clipped = clipSegment(points[i - 1]!, points[i]!, f);
    if (!clipped) {
      current = null;
      continue;
    }
    const [a, b] = clipped;
    const last = current?.[current.length - 1];
    if (current && last && distance(last, a) < EPSILON) current.push(b);
    else {
      current = [a, b];
      pieces.push(current);
    }
    // Sorti du cadre : le morceau suivant repartira de l'entrée
    if (distance(b, points[i]!) >= EPSILON) current = null;
  }
  return pieces;
}
