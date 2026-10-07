/**
 * Marketplace de créateurs (docs/marketplace.md) : format des packs, règles communes au front et
 * aux services (commission, prix, numéros de version, recherche) et formes des réponses de
 * `/v1/marketplace`.
 */
import { z } from 'zod';
import {
  MapLightFields,
  MapObjectFields,
  MapObstacleFields,
  MapRoomFields,
  MapSceneFields,
  MediaUrl,
} from './map.js';

// ─── Règles commerciales ─────────────────────────────────────────────────────

/**
 * Commission de la plateforme sur une vente : 15 % du prix TTC, 0,50 € au moins. Les frais
 * Stripe sont à la charge de la plateforme. Même calcul pour l'affichage au créateur et pour le
 * prélèvement (billing) ; la changer demande de mettre à jour les conditions des vendeurs.
 */
export const MARKETPLACE_FEE = { percent: 15, minCents: 50 } as const;

/** Prix d'une fiche payante, en centimes TTC ; 0 : gratuite. */
export const MARKETPLACE_PRICE = { minCents: 200, maxCents: 20_000 } as const;

export const MARKETPLACE_CURRENCY = 'eur';

/** Commission prélevée sur une vente de `priceCents` (jamais plus que le prix). */
export function marketplaceFee(priceCents: number): number {
  if (priceCents <= 0) return 0;
  const fee = Math.max(
    Math.round((priceCents * MARKETPLACE_FEE.percent) / 100),
    MARKETPLACE_FEE.minCents,
  );
  return Math.min(fee, priceCents);
}

/** Prix valide : 0, ou dans les bornes. */
export function isValidPrice(priceCents: number): boolean {
  return (
    Number.isInteger(priceCents) &&
    (priceCents === 0 ||
      (priceCents >= MARKETPLACE_PRICE.minCents && priceCents <= MARKETPLACE_PRICE.maxCents))
  );
}

// ─── Énumérations ────────────────────────────────────────────────────────────

export const ListingStatus = z.enum(['draft', 'published', 'unlisted', 'removed']);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const VersionStatus = z.enum(['draft', 'in_review', 'published', 'rejected']);
export type VersionStatus = z.infer<typeof VersionStatus>;

/** Ce que contient un pack (filtre « type » du catalogue). */
export const ListingKind = z.enum(['scenes', 'npcs', 'objects']);
export type ListingKind = z.infer<typeof ListingKind>;

export const LICENSES = [
  'personal',
  'cc-by-4.0',
  'cc-by-sa-4.0',
  'cc-by-nc-4.0',
  'cc0-1.0',
  'ogl-1.0a',
  'orc',
] as const;
export const License = z.enum(LICENSES);
export type License = z.infer<typeof License>;

export const LICENSE_LABELS: Record<License, string> = {
  personal: 'Usage personnel',
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-sa-4.0': 'CC BY-SA 4.0',
  'cc-by-nc-4.0': 'CC BY-NC 4.0',
  'cc0-1.0': 'CC0 (domaine public)',
  'ogl-1.0a': 'OGL 1.0a',
  orc: 'ORC',
};

/** Avertissements de contenu : balisés et filtrables (le contenu sexuel est interdit). */
export const CONTENT_WARNINGS = ['violence', 'horror', 'gore', 'drugs', 'phobias'] as const;
export const ContentWarning = z.enum(CONTENT_WARNINGS);
export type ContentWarning = z.infer<typeof ContentWarning>;

export const CONTENT_WARNING_LABELS: Record<ContentWarning, string> = {
  violence: 'Violence',
  horror: 'Horreur',
  gore: 'Gore',
  drugs: 'Drogues',
  phobias: 'Phobies',
};

export const ReportReason = z.enum([
  'copyright',
  'adult',
  'hateful',
  'broken',
  'misleading',
  'other',
]);
export type ReportReason = z.infer<typeof ReportReason>;

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  copyright: 'Droit d’auteur',
  adult: 'Contenu pour adultes',
  hateful: 'Contenu haineux',
  broken: 'Ne fonctionne pas',
  misleading: 'Trompeur',
  other: 'Autre',
};

/** Motif d'un refus en revue ou d'un retrait. */
export const ModerationReason = z.enum([
  'rights',
  'adult',
  'hateful',
  'quality',
  'broken',
  'misleading',
  'other',
]);
export type ModerationReason = z.infer<typeof ModerationReason>;

export const MODERATION_REASON_LABELS: Record<ModerationReason, string> = {
  rights: 'Droits non établis',
  adult: 'Contenu pour adultes',
  hateful: 'Contenu haineux',
  quality: 'Qualité insuffisante',
  broken: 'Contenu inutilisable',
  misleading: 'Fiche trompeuse',
  other: 'Autre',
};

export const AcquisitionSource = z.enum(['free', 'purchase', 'gift']);
export type AcquisitionSource = z.infer<typeof AcquisitionSource>;

export const CatalogSort = z.enum(['popular', 'recent', 'rating', 'price_asc', 'price_desc']);
export type CatalogSort = z.infer<typeof CatalogSort>;

// ─── Numéros de version ──────────────────────────────────────────────────────

/** `x.y.z`, entiers sans zéro de tête. */
export const VersionNumber = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})\.(0|[1-9]\d{0,3})$/, 'Numéro x.y.z attendu');

/** Compare deux numéros `x.y.z` : négatif si a < b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Numéro suivant proposé : correctif de `previous`, ou 1.0.0. */
export function nextVersionNumber(previous: string | null | undefined): string {
  if (!previous) return '1.0.0';
  const [x = 1, y = 0, z = 0] = previous.split('.').map(Number);
  return `${x}.${y}.${z + 1}`;
}

// ─── Texte ───────────────────────────────────────────────────────────────────

/** Minuscules sans accents ni ponctuation : recherche et adresses. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Adresse lisible (`les-cryptes-de-sel`), 60 caractères au plus. */
export function slugify(text: string): string {
  return normalizeText(text).replace(/\s+/g, '-').slice(0, 60).replace(/-+$/, '') || 'pack';
}

export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Adresse invalide')
  .max(80);

export const Tag = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} -]*$/u, 'Lettres, chiffres, espaces et tirets');

// ─── Pack ────────────────────────────────────────────────────────────────────

export const PACK_FORMAT = 1;

export const PACK_LIMITS = {
  scenes: 20,
  npcTemplates: 300,
  objectTemplates: 500,
  obstaclesPerScene: 5_000,
  lightsPerScene: 500,
  roomsPerScene: 500,
  objectsPerScene: 1_000,
  /** Fichiers distincts cités par une version. */
  assets: 400,
  /** Document JSON du pack, octets. */
  contentBytes: 8 * 1024 * 1024,
  /** Somme des fichiers d'une version, octets. */
  assetBytes: 500 * 1024 * 1024,
  /** `etat` d'un modèle de PNJ, en caractères de JSON. */
  etatChars: 200_000,
} as const;

const Ref = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, 'Référence invalide');

/** Champs d'une scène repris dans un pack (rien de propre à une campagne). */
export const PackSceneFields = MapSceneFields.pick({
  name: true,
  description: true,
  backgroundUrl: true,
  width: true,
  height: true,
  weather: true,
  display: true,
  fogFull: true,
  grids: true,
  spawn: true,
})
  .partial()
  .required({ name: true });

export const PackObstacle = MapObstacleFields.partial().required({ points: true });
export const PackLight = MapLightFields.omit({ attachedTokenId: true })
  .partial()
  .required({ pos: true });
export const PackRoom = MapRoomFields.partial().required({ points: true });
/** Objet posé : sans calque, personnages autorisés ni liens (propres à une campagne). */
export const PackObject = MapObjectFields.omit({
  layerId: true,
  visibleTo: true,
  linkedId: true,
  groupEntityId: true,
})
  .partial()
  .required({ pos: true });

export const PackScene = z.strictObject({
  ref: Ref,
  scene: PackSceneFields,
  obstacles: z.array(PackObstacle).max(PACK_LIMITS.obstaclesPerScene).default([]),
  lights: z.array(PackLight).max(PACK_LIMITS.lightsPerScene).default([]),
  rooms: z.array(PackRoom).max(PACK_LIMITS.roomsPerScene).default([]),
  objects: z.array(PackObject).max(PACK_LIMITS.objectsPerScene).default([]),
});
export type PackScene = z.infer<typeof PackScene>;

const HttpUrl = z
  .string()
  .trim()
  .max(2048)
  .regex(/^https?:\/\/\S+$/, 'URL http(s) attendue');

export const PackNpcTemplate = z.strictObject({
  ref: Ref,
  name: z.string().trim().min(1).max(100),
  imageUrl: HttpUrl.nullable().default(null),
  tokenUrl: HttpUrl.nullable().default(null),
  actions: z
    .array(
      z.strictObject({
        name: z.string().max(200),
        description: z.string().max(10_000).default(''),
        toHit: z.number().finite(),
      }),
    )
    .max(100)
    .default([]),
  /** EtatEntite (@vtt/rules), validé par character à l'installation. */
  etat: z
    .record(z.string(), z.unknown())
    .refine((e) => JSON.stringify(e).length <= PACK_LIMITS.etatChars, 'État trop volumineux'),
});
export type PackNpcTemplate = z.infer<typeof PackNpcTemplate>;

export const PackObjectTemplate = z.strictObject({
  ref: Ref,
  name: z.string().trim().min(1).max(100),
  imageUrl: HttpUrl.nullable().default(null),
  category: z.string().trim().min(1).max(50).nullable().default(null),
});
export type PackObjectTemplate = z.infer<typeof PackObjectTemplate>;

export const PackContent = z
  .strictObject({
    format: z.literal(PACK_FORMAT),
    systemId: z.string().min(1).max(200).nullable().default(null),
    scenes: z.array(PackScene).max(PACK_LIMITS.scenes).default([]),
    npcTemplates: z.array(PackNpcTemplate).max(PACK_LIMITS.npcTemplates).default([]),
    objectTemplates: z.array(PackObjectTemplate).max(PACK_LIMITS.objectTemplates).default([]),
  })
  .refine((p) => p.scenes.length + p.npcTemplates.length + p.objectTemplates.length > 0, {
    message: 'Le pack est vide',
  })
  .refine((p) => p.npcTemplates.length === 0 || p.systemId !== null, {
    message: 'Un pack avec des PNJ indique son système de jeu',
    path: ['systemId'],
  })
  .refine(
    (p) => {
      const refs = [...p.scenes, ...p.npcTemplates, ...p.objectTemplates].map((x) => x.ref);
      return new Set(refs).size === refs.length;
    },
    { message: 'Références en double' },
  );
export type PackContent = z.infer<typeof PackContent>;
export type PackContentInput = z.input<typeof PackContent>;

export const PackCounts = z.object({
  scenes: z.number().int(),
  npcTemplates: z.number().int(),
  objectTemplates: z.number().int(),
  assets: z.number().int(),
});
export type PackCounts = z.infer<typeof PackCounts>;

/** Où se trouve chaque adresse de fichier d'un pack (pour la copie et la réécriture). */
type UrlVisitor = (url: string) => string;

function mapUrl(url: string | null | undefined, visit: UrlVisitor): string | null | undefined {
  return url ? visit(url) : url;
}

/**
 * Parcourt toutes les adresses de fichiers du pack (fonds, objets, images de PNJ et d'objets,
 * images du contenu des objets) et rend un pack où chacune est remplacée par `visit(url)`.
 */
export function mapPackUrls(pack: PackContent, visit: UrlVisitor): PackContent {
  return {
    ...pack,
    scenes: pack.scenes.map((s) => ({
      ...s,
      scene: { ...s.scene, backgroundUrl: mapUrl(s.scene.backgroundUrl, visit) },
      objects: s.objects.map((o) => ({
        ...o,
        ...(o.imageUrl ? { imageUrl: visit(o.imageUrl) } : {}),
        ...(o.items
          ? {
              items: o.items.map((i) => ({
                ...i,
                ...(i.imageUrl ? { imageUrl: visit(i.imageUrl) } : {}),
              })),
            }
          : {}),
      })),
    })),
    npcTemplates: pack.npcTemplates.map((t) => ({
      ...t,
      imageUrl: mapUrl(t.imageUrl, visit) ?? null,
      tokenUrl: mapUrl(t.tokenUrl, visit) ?? null,
    })),
    objectTemplates: pack.objectTemplates.map((t) => ({
      ...t,
      imageUrl: mapUrl(t.imageUrl, visit) ?? null,
    })),
  };
}

/** Adresses distinctes de fichiers citées par le pack. */
export function packUrls(pack: PackContent): string[] {
  const urls = new Set<string>();
  mapPackUrls(pack, (u) => {
    urls.add(u);
    return u;
  });
  return [...urls];
}

/** Comptes affichés sur la fiche (`assets` : fichiers distincts). */
export function packCounts(pack: PackContent): PackCounts {
  return {
    scenes: pack.scenes.length,
    npcTemplates: pack.npcTemplates.length,
    objectTemplates: pack.objectTemplates.length,
    assets: packUrls(pack).filter((u) => !u.startsWith('/')).length,
  };
}

/** Types de contenu d'un pack, d'après ses comptes. */
export function packKinds(counts: Pick<PackCounts, 'scenes' | 'npcTemplates' | 'objectTemplates'>) {
  const kinds: ListingKind[] = [];
  if (counts.scenes > 0) kinds.push('scenes');
  if (counts.npcTemplates > 0) kinds.push('npcs');
  if (counts.objectTemplates > 0) kinds.push('objects');
  return kinds;
}

// ─── Réponses de l'API ───────────────────────────────────────────────────────

export const MarketplaceConfig = z.object({
  paidListings: z.boolean(),
  fee: z.object({ percent: z.number(), minCents: z.number() }),
  price: z.object({ minCents: z.number(), maxCents: z.number() }),
  currency: z.string(),
});
export type MarketplaceConfig = z.infer<typeof MarketplaceConfig>;

export const CreatorProfile = z.object({
  userId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  bio: z.string(),
  payoutsReady: z.boolean(),
  createdAt: z.string(),
  version: z.number().int(),
});
export type CreatorProfile = z.infer<typeof CreatorProfile>;

export const MarketplaceMe = z.object({
  creator: CreatorProfile.nullable(),
  moderator: z.boolean(),
});
export type MarketplaceMe = z.infer<typeof MarketplaceMe>;

export const CreatorSummary = z.object({
  userId: z.string(),
  slug: z.string(),
  displayName: z.string(),
});
export type CreatorSummary = z.infer<typeof CreatorSummary>;

/** Tuile du catalogue. */
export const ListingCard = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  coverUrl: z.string().nullable(),
  systemId: z.string().nullable(),
  kinds: z.array(ListingKind),
  priceCents: z.number().int(),
  currency: z.string(),
  contentWarnings: z.array(ContentWarning),
  ratingCount: z.number().int(),
  /** Moyenne des notes (null sans avis). */
  rating: z.number().nullable(),
  acquisitionsCount: z.number().int(),
  creator: CreatorSummary,
  publishedAt: z.string().nullable(),
  owned: z.boolean(),
});
export type ListingCard = z.infer<typeof ListingCard>;

export const CatalogPage = z.object({
  items: z.array(ListingCard),
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
});
export type CatalogPage = z.infer<typeof CatalogPage>;

export const PublicVersion = z.object({
  id: z.string(),
  number: z.string(),
  notes: z.string(),
  counts: PackCounts,
  systemId: z.string().nullable(),
  publishedAt: z.string().nullable(),
});
export type PublicVersion = z.infer<typeof PublicVersion>;

export const Review = z.object({
  listingId: z.string(),
  userId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Review = z.infer<typeof Review>;

export const ListingDetail = ListingCard.extend({
  description: z.string(),
  license: License,
  attribution: z.string(),
  tags: z.array(z.string()),
  gallery: z.array(z.string()),
  status: ListingStatus,
  versions: z.array(PublicVersion),
  myReview: Review.nullable(),
  /** L'appelant en est le créateur. */
  mine: z.boolean(),
});
export type ListingDetail = z.infer<typeof ListingDetail>;

export const ReviewPage = z.object({
  items: z.array(Review),
  page: z.number().int(),
  perPage: z.number().int(),
  total: z.number().int(),
});
export type ReviewPage = z.infer<typeof ReviewPage>;

export const StudioVersion = z.object({
  id: z.string(),
  listingId: z.string(),
  number: z.string(),
  notes: z.string(),
  status: VersionStatus,
  counts: PackCounts.nullable(),
  contentBytes: z.number().int().nullable(),
  systemId: z.string().nullable(),
  submittedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  reviewReason: ModerationReason.nullable(),
  reviewNote: z.string().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioVersion = z.infer<typeof StudioVersion>;

export const StudioListing = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  description: z.string(),
  systemId: z.string().nullable(),
  license: License,
  attribution: z.string(),
  priceCents: z.number().int(),
  currency: z.string(),
  tags: z.array(z.string()),
  contentWarnings: z.array(ContentWarning),
  coverUrl: z.string().nullable(),
  gallery: z.array(z.string()),
  status: ListingStatus,
  kinds: z.array(ListingKind),
  currentVersionId: z.string().nullable(),
  acquisitionsCount: z.number().int(),
  ratingCount: z.number().int(),
  rating: z.number().nullable(),
  removedReason: ModerationReason.nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int(),
  versions: z.array(StudioVersion),
});
export type StudioListing = z.infer<typeof StudioListing>;

export const ListingFields = z.strictObject({
  title: z.string().trim().min(3, '3 caractères au moins').max(80, '80 caractères au plus'),
  summary: z.string().trim().max(160, '160 caractères au plus'),
  description: z.string().trim().max(5_000, '5 000 caractères au plus'),
  systemId: z.string().min(1).max(200).nullable(),
  license: License,
  attribution: z.string().trim().max(500),
  priceCents: z.number().int().min(0).refine(isValidPrice, 'Prix hors bornes'),
  tags: z.array(Tag).max(5),
  contentWarnings: z.array(ContentWarning).max(CONTENT_WARNINGS.length),
  coverUrl: MediaUrl.nullable(),
  gallery: z.array(MediaUrl).max(8),
});
export const CreateListing = ListingFields.partial().required({ title: true });
export type CreateListing = z.input<typeof CreateListing>;
export const UpdateListing = ListingFields.partial().extend({
  version: z.number().int().positive().optional(),
});
export type UpdateListing = z.input<typeof UpdateListing>;

export const InstallSummary = z.object({
  id: z.string(),
  campaignId: z.string(),
  versionId: z.string(),
  versionNumber: z.string(),
  status: z.enum(['started', 'done']),
  completedAt: z.string().nullable(),
});
export type InstallSummary = z.infer<typeof InstallSummary>;

export const LibraryItem = z.object({
  listing: ListingCard,
  source: AcquisitionSource,
  acquiredAt: z.string(),
  /** Retirée par la modération : plus d'installation. */
  available: z.boolean(),
  latestVersion: PublicVersion.nullable(),
  installs: z.array(InstallSummary),
});
export type LibraryItem = z.infer<typeof LibraryItem>;

export const InstallCreated = z.object({
  scenes: z.number().int().min(0),
  npcTemplates: z.number().int().min(0),
  objectTemplates: z.number().int().min(0),
  skipped: z.number().int().min(0),
});
export type InstallCreated = z.infer<typeof InstallCreated>;

export const InstallStart = z.object({
  install: InstallSummary,
  listingTitle: z.string(),
  content: PackContent,
});
export type InstallStart = z.infer<typeof InstallStart>;

export const ReportItem = z.object({
  id: z.string(),
  listingId: z.string(),
  reason: ReportReason,
  details: z.string(),
  status: z.enum(['open', 'resolved', 'dismissed']),
  createdAt: z.string(),
});
export type ReportItem = z.infer<typeof ReportItem>;

export const ModerationQueue = z.object({
  versions: z.array(
    z.object({ listing: StudioListing.omit({ versions: true }), version: StudioVersion }),
  ),
  recheck: z.array(StudioListing.omit({ versions: true })),
  reports: z.array(
    z.object({ listing: StudioListing.omit({ versions: true }), reports: z.array(ReportItem) }),
  ),
});
export type ModerationQueue = z.infer<typeof ModerationQueue>;

// ─── Événements ──────────────────────────────────────────────────────────────

/** Événements de marketplace (sujet `vtt.<campagne|global>.marketplace.<action>`). */
export const MARKETPLACE_EVENTS = {
  creatorRegistered: 'marketplace.creator_registered',
  creatorUpdated: 'marketplace.creator_updated',
  listingCreated: 'marketplace.listing_created',
  listingUpdated: 'marketplace.listing_updated',
  listingDeleted: 'marketplace.listing_deleted',
  listingUnlisted: 'marketplace.listing_unlisted',
  listingRelisted: 'marketplace.listing_relisted',
  listingRemoved: 'marketplace.listing_removed',
  listingRechecked: 'marketplace.listing_rechecked',
  versionCreated: 'marketplace.version_created',
  versionUpdated: 'marketplace.version_updated',
  versionContentSet: 'marketplace.version_content_set',
  versionSubmitted: 'marketplace.version_submitted',
  versionDeleted: 'marketplace.version_deleted',
  versionPublished: 'marketplace.version_published',
  versionRejected: 'marketplace.version_rejected',
  listingAcquired: 'marketplace.listing_acquired',
  acquisitionRevoked: 'marketplace.acquisition_revoked',
  checkoutStarted: 'marketplace.checkout_started',
  reviewPosted: 'marketplace.review_posted',
  reviewDeleted: 'marketplace.review_deleted',
  listingReported: 'marketplace.listing_reported',
  reportResolved: 'marketplace.report_resolved',
  installStarted: 'marketplace.install_started',
  packInstalled: 'marketplace.pack_installed',
} as const;
