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

export const SheetBlock = z.strictObject({
  id: BlockId,
  /** Type de widget de la présentation (`attributs`, `possessions`…). */
  type: z.string().regex(/^[a-z][a-zA-Z0-9]{0,39}$/, 'Type de bloc invalide'),
  title: z.string().trim().min(1, 'Titre requis').max(200),
  /** Paramètres du widget (sorte, attributs, groupe…), sans le type ni le titre. */
  params: z
    .record(ParamKey, ParamValue)
    .refine((p) => Object.keys(p).length <= 16, '16 paramètres au plus')
    .default({}),
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
    y: z.number().int().min(0).max(2000),
    w: z.number().int().min(1).max(GRID_COLUMNS),
    h: z.number().int().min(1).max(200),
  })
  .refine((l) => l.x + l.w <= GRID_COLUMNS, `Bloc hors de la grille (${GRID_COLUMNS} colonnes)`);
export type LayoutItem = z.output<typeof LayoutItem>;

const Positions = z.array(LayoutItem).max(MAX_BLOCKS);

export const SheetLayout = z
  .strictObject({
    format: z.literal(1),
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
