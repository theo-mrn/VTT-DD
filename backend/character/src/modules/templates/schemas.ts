/**
 * Schémas Zod de l'API des modèles du MJ (contrat : docs/api-templates.md).
 */
import { z } from 'zod';

const uuid = (message: string) => z.uuid(message).transform((s) => s.toLowerCase());

export const CampaignId = uuid('Identifiant de campagne invalide');
export const TemplateId = uuid('Identifiant de modèle invalide');
export const CategoryId = uuid('Identifiant de catégorie invalide');
export const Version = z.number().int().positive();
export const Name = z.string().trim().min(1, 'Nom requis').max(100, '100 caractères au plus');
export const ImageUrl = z.url({ protocol: /^https?$/, error: 'URL http(s) attendue' }).max(2048);
export const Color = z.string().regex(/^#[0-9A-Fa-f]{3,8}$/, 'Couleur #rrggbb attendue');
export const ObjectCategory = z.string().trim().min(1).max(50);
const SystemId = z.string().min(1).max(200);

/** Action d'un PNJ (legacy `Actions` : Nom, Description, Toucher). */
export const Action = z.object({
  name: z.string().max(200),
  description: z.string().max(10_000).default(''),
  toHit: z.number().finite(),
});
export const Actions = z.array(Action).max(100);

// ─── Réponses ────────────────────────────────────────────────────────────────

const dates = { version: z.number().int(), createdAt: z.string(), updatedAt: z.string() };

export const CategoryResponse = z.object({
  id: z.string(),
  campaignId: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  ...dates,
});

export const NpcTemplateResponse = z.object({
  id: z.string(),
  campaignId: z.string(),
  categoryId: z.string().nullable(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  tokenUrl: z.string().nullable(),
  actions: z.array(z.object({ name: z.string(), description: z.string(), toHit: z.number() })),
  /** EtatEntite de @vtt/rules, et sa fiche recalculée. */
  etat: z.unknown(),
  fiche: z.unknown(),
  ...dates,
});

export const ObjectTemplateResponse = z.object({
  id: z.string(),
  campaignId: z.string(),
  name: z.string(),
  imageUrl: z.string().nullable(),
  category: z.string().nullable(),
  ...dates,
});

// ─── Corps ───────────────────────────────────────────────────────────────────

export const CreateCategory = z.object({ name: Name, color: Color.nullable().optional() });
export const UpdateCategory = z.object({
  version: Version,
  name: Name.optional(),
  color: Color.nullable().optional(),
});

/**
 * Nouveau modèle de PNJ : `etat` complet (EtatEntite), ou `systemeId` et
 * `type` pour partir d'un état vide, comme `POST /v1/characters`.
 */
export const CreateNpcTemplate = z
  .object({
    name: Name,
    categoryId: CategoryId.nullable().optional(),
    imageUrl: ImageUrl.nullable().optional(),
    tokenUrl: ImageUrl.nullable().optional(),
    actions: Actions.optional(),
    etat: z.unknown().optional(),
    systemeId: SystemId.optional(),
    type: SystemId.optional(),
  })
  .refine((b) => b.etat !== undefined || (b.systemeId && b.type), {
    message: '`etat`, ou `systemeId` et `type`, requis',
  });

export const UpdateNpcTemplate = z.object({
  version: Version,
  name: Name.optional(),
  categoryId: CategoryId.nullable().optional(),
  imageUrl: ImageUrl.nullable().optional(),
  tokenUrl: ImageUrl.nullable().optional(),
  actions: Actions.optional(),
  etat: z.unknown().optional(),
});

export const CreateObjectTemplate = z.object({
  name: Name,
  imageUrl: ImageUrl.nullable().optional(),
  category: ObjectCategory.nullable().optional(),
});
export const UpdateObjectTemplate = z.object({
  version: Version,
  name: Name.optional(),
  imageUrl: ImageUrl.nullable().optional(),
  category: ObjectCategory.nullable().optional(),
});
