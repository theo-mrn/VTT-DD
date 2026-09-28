/**
 * Mise en page de la fiche d'un personnage (`sheet_layout`) : les blocs affichés et leur
 * position dans la grille du front, par largeur d'écran. Un bloc est un widget de la
 * présentation du système (`type`, `title`, paramètres) : le service ne connaît aucun jeu,
 * il vérifie seulement la forme (schéma strict), les bornes et la cohérence des
 * identifiants. Le front ignore un bloc que la présentation ne sait plus afficher.
 */
import { z } from 'zod';

/** Colonnes de la grille sur la plus grande largeur : aucune position ne les dépasse. */
export const GRID_COLUMNS = 12;
export const MAX_BLOCKS = 40;
/** Taille maximale de la mise en page sérialisée (octets UTF-8). */
export const MAX_LAYOUT_BYTES = 32 * 1024;
export const BREAKPOINTS = ['lg', 'md', 'sm', 'xs'] as const;

const BlockId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/, 'Identifiant de bloc : 1 à 40 lettres, chiffres, - ou _');
const ParamKey = z.string().regex(/^[a-zA-Z][a-zA-Z0-9]{0,39}$/, 'Paramètre de bloc invalide');
const ParamValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().min(1).max(200)).max(100),
]);

/** Colonnes fixes d'un bloc de tuiles, au plus. */
export const MAX_TILE_COLUMNS = 6;
/** Valeurs au plus dans l'ordre ou les masques d'un bloc de tuiles. */
export const MAX_TILE_KEYS = 64;

/** Clé d'une valeur du bloc (attribut du système), sans rien savoir du jeu. */
const TileKey = z
  .string()
  .max(60)
  .regex(/^[\p{L}_][\p{L}\p{N}_]*$/u, 'Clé de valeur : lettres, chiffres et « _ »');
const TileKeys = z
  .array(TileKey)
  .min(1)
  .max(MAX_TILE_KEYS)
  .refine((l) => new Set(l).size === l.length, 'Valeur en double');

/**
 * Paramètres de la disposition interne d'un bloc de tuiles (attributs, ressources…), réglée
 * en personnalisation : colonnes (`auto` ou 1 à 6), ordre des valeurs, valeurs masquées.
 * Absents : le front suit la présentation du système.
 */
const TileParams = {
  colonnesTuiles: z.union([z.literal('auto'), z.number().int().min(1).max(MAX_TILE_COLUMNS)]),
  ordre: TileKeys,
  masques: TileKeys,
} as const;

const BlockParams = z
  .record(ParamKey, ParamValue)
  .refine((p) => Object.keys(p).length <= 16, '16 paramètres au plus')
  .superRefine((p, ctx) => {
    for (const [cle, schema] of Object.entries(TileParams)) {
      if (!(cle in p)) continue;
      const r = schema.safeParse(p[cle]);
      if (!r.success)
        for (const issue of r.error.issues)
          ctx.addIssue({ code: 'custom', path: [cle, ...issue.path], message: issue.message });
    }
  });

export const SheetBlock = z.strictObject({
  id: BlockId,
  /** Type de widget de la présentation (`attributs`, `possessions`…). */
  type: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Type de bloc invalide'),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  /**
   * Paramètres du widget (sorte, attributs, groupe…), sans le type ni le titre, et ceux de
   * la disposition interne d'un bloc de tuiles (`colonnesTuiles`, `ordre`, `masques`).
   */
  params: BlockParams.default({}),
  /**
   * Hauteur dans la grille : `auto` suit le contenu, `fixed` garde la hauteur des positions
   * (le contenu défile). Absente : préférence du type de bloc, choisie par le front.
   */
  height: z.enum(['auto', 'fixed']).optional(),
});
export type SheetBlock = z.output<typeof SheetBlock>;

export const LayoutItem = z
  .strictObject({
    i: BlockId,
    x: z
      .number()
      .int()
      .min(0)
      .max(GRID_COLUMNS - 1),
    y: z.number().int().min(0).max(50_000),
    w: z.number().int().min(1).max(GRID_COLUMNS),
    h: z.number().int().min(1).max(2_400),
  })
  .refine((l) => l.x + l.w <= GRID_COLUMNS, `Bloc hors de la grille (${GRID_COLUMNS} colonnes)`);
export type LayoutItem = z.output<typeof LayoutItem>;

const Positions = z.array(LayoutItem).max(MAX_BLOCKS);

export const SheetLayout = z
  .strictObject({
    /** 2 : pas vertical fin (4 px) ; 1 : rangées de 32 px espacées de 16 (converti par le front). */
    format: z.union([z.literal(1), z.literal(2)]),
    blocks: z.array(SheetBlock).max(MAX_BLOCKS, `${MAX_BLOCKS} blocs au plus`),
    /** Positions par largeur d'écran ; une largeur absente est déduite par le front. */
    layouts: z
      .strictObject({
        lg: Positions.optional(),
        md: Positions.optional(),
        sm: Positions.optional(),
        xs: Positions.optional(),
      })
      .default({}),
  })
  .superRefine((m, ctx) => {
    const ids = new Set<string>();
    m.blocks.forEach((b, i) => {
      if (ids.has(b.id))
        ctx.addIssue({ code: 'custom', path: ['blocks', i, 'id'], message: 'Bloc en double' });
      ids.add(b.id);
    });
    for (const bp of BREAKPOINTS) {
      const vus = new Set<string>();
      m.layouts[bp]?.forEach((l, i) => {
        if (!ids.has(l.i) || vus.has(l.i))
          ctx.addIssue({
            code: 'custom',
            path: ['layouts', bp, i, 'i'],
            message: vus.has(l.i) ? 'Position en double' : `Bloc inconnu : ${l.i}`,
          });
        vus.add(l.i);
      });
    }
    if (Buffer.byteLength(JSON.stringify(m), 'utf8') > MAX_LAYOUT_BYTES)
      ctx.addIssue({
        code: 'custom',
        path: [],
        message: `Mise en page trop volumineuse (${MAX_LAYOUT_BYTES} octets au plus)`,
      });
  });
export type SheetLayout = z.output<typeof SheetLayout>;

/** Droits de l'appelant sur la fiche, renvoyés avec le personnage lu. */
export const Permissions = z.object({
  /** Modifier le personnage (valeurs, achats, possessions, profil…). */
  write: z.boolean(),
  /** Changer la mise en page de sa fiche. */
  layout: z.boolean(),
});
export type Permissions = z.output<typeof Permissions>;
