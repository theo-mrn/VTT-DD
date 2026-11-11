/**
 * Archive d'une campagne (`.yner`, docs/export-campagne.md § 4) : un zip qui contient un
 * manifeste, un instantané des tables de chaque service et les fichiers cités.
 *
 * - `manifest.json` : le format, la campagne, les options, la version du schéma de chaque
 *   service, ses tables et leur nombre de lignes, et la liste des fichiers.
 * - `tables/<service>/<table>.json` : les lignes de la table, telles que le service les lit
 *   (noms de colonnes en camelCase). Chaque service choisit ses tables et retire ce qui n'est pas
 *   au MJ ; il relit lui-même ses lignes à l'import.
 * - `files/<sha256>` : chaque contenu une seule fois. Dans les lignes, l'adresse publique d'un
 *   fichier de la campagne devient `yner-file:<clé R2 d'origine>` (`toFileRefs`).
 *
 * À l'import, tous les identifiants de l'archive sont renouvelés d'un coup, jusque dans les JSON,
 * le HTML et les clés des fichiers (`remapIds`) : les liens entre tables et entre services
 * suivent sans que personne ne les connaisse.
 */
import { z } from 'zod';

export const ARCHIVE_FORMAT = 1;
export const ARCHIVE_EXTENSION = '.yner';
export const ARCHIVE_CONTENT_TYPE = 'application/zip';

/** Services dont les tables entrent dans une archive, dans l'ordre d'import. */
export const ARCHIVE_SERVICES = ['campaign', 'character', 'audio'] as const;
export const ArchiveService = z.enum(ARCHIVE_SERVICES);
export type ArchiveService = z.infer<typeof ArchiveService>;

export const ARCHIVE_LIMITS = {
  /** Archive entière : le quota d'une campagne (5 Gio) et la place des tables. */
  bytes: 6 * 1024 ** 3,
  /** Fichiers distincts (clés R2). */
  files: 50_000,
  /** Un fichier `tables/…/….json`, décompressé. */
  tableBytes: 256 * 1024 ** 2,
  /** Toutes les lignes de l'archive. */
  rows: 1_000_000,
  /** Conservation d'une archive prête, en jours. */
  retentionDays: 7,
} as const;

export const ARCHIVE_ERRORS = {
  invalid: 'archive_invalid',
  unsupportedVersion: 'archive_unsupported_version',
  unknownSystem: 'archive_unknown_system',
  tooLarge: 'archive_too_large',
  expired: 'archive_expired',
  busy: 'archive_busy',
} as const;

/** Dossiers R2 dont les fichiers appartiennent à une campagne (docs/stockage.md). */
export const ARCHIVE_FILE_FOLDERS = ['campaigns', 'characters', 'audio/assets'] as const;

export const ArchiveOptions = z.strictObject({
  /** Brouillard découvert, jetons posés, mesures (sinon : scènes remises à zéro). */
  keepProgress: z.boolean(),
});
export type ArchiveOptions = z.infer<typeof ArchiveOptions>;

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/, 'Empreinte SHA-256 attendue');
const TableName = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/, 'Nom de table invalide');
const SchemaVersion = z.string().trim().min(1).max(64);

/** Clé R2 d'un fichier de la campagne : un des dossiers connus, sans « .. » ni requête. */
const FILE_KEY = new RegExp(
  `^(?:${ARCHIVE_FILE_FOLDERS.map(escapeRegExp).join('|')})/[A-Za-z0-9_-]+(?:/[A-Za-z0-9_.-]+)+$`,
);
export const ArchiveFileKey = z
  .string()
  .max(512)
  .refine((k) => FILE_KEY.test(k) && !k.split('/').some((s) => s === '.' || s === '..'), {
    message: 'Clé de fichier invalide',
  });

export const ArchiveFile = z.strictObject({
  key: ArchiveFileKey,
  sha256: Sha256,
  size: z.number().int().nonnegative(),
  contentType: z.string().trim().min(1).max(200),
});
export type ArchiveFile = z.infer<typeof ArchiveFile>;

export const ArchiveServiceManifest = z.strictObject({
  /** Dernière migration du service à l'export : l'import sait de quelle forme sont les lignes. */
  schemaVersion: SchemaVersion,
  /** Tables exportées et leur nombre de lignes. */
  tables: z.record(TableName, z.number().int().nonnegative()),
});
export type ArchiveServiceManifest = z.infer<typeof ArchiveServiceManifest>;

export const ArchiveManifest = z
  .strictObject({
    format: z.literal(ARCHIVE_FORMAT),
    kind: z.literal('campaign'),
    exportedAt: z.iso.datetime(),
    campaign: z.strictObject({
      id: z.uuid(),
      name: z.string().min(1).max(200),
      systemId: z.string().min(1).max(200),
      systemVersion: z.string().min(1).max(64),
    }),
    options: ArchiveOptions,
    services: z.partialRecord(ArchiveService, ArchiveServiceManifest),
    files: z.array(ArchiveFile).max(ARCHIVE_LIMITS.files),
  })
  .refine((m) => new Set(m.files.map((f) => f.key)).size === m.files.length, {
    message: 'Fichiers en double',
    path: ['files'],
  })
  .refine(
    (m) =>
      Object.values(m.services).reduce(
        (n, s) => n + Object.values(s?.tables ?? {}).reduce((a, b) => a + b, 0),
        0,
      ) <= ARCHIVE_LIMITS.rows,
    { message: 'Trop de lignes', path: ['services'] },
  );
export type ArchiveManifest = z.infer<typeof ArchiveManifest>;

/** Lignes d'une table, telles que le service les lit. */
export const ArchiveRows = z.array(z.record(z.string(), z.unknown()));
export type ArchiveRows = z.infer<typeof ArchiveRows>;

/**
 * Instantané d'un service (`GET /internal/campaigns/:id/archive`) et contenu de son import
 * (`POST /internal/campaigns/:id/archive`, identifiants déjà renouvelés).
 */
export const ArchiveServiceSnapshot = z.strictObject({
  schemaVersion: SchemaVersion,
  tables: z.record(TableName, ArchiveRows),
  /** Fichiers à joindre que les lignes citent par leur clé, pas par une adresse (médiathèque). */
  files: z.array(ArchiveFileKey).max(ARCHIVE_LIMITS.files).default([]),
});
export type ArchiveServiceSnapshot = z.infer<typeof ArchiveServiceSnapshot>;

export const ArchiveServiceImport = ArchiveServiceSnapshot.omit({ files: true }).extend({
  /** Propriétaire de tout ce qui est importé (personnages compris). */
  ownerId: z.uuid(),
  options: ArchiveOptions,
  /**
   * Identifiants (renouvelés) des lignes des autres services, que ces tables peuvent citer :
   * personnages pour campaign, sons pour une zone musicale, campagne pour character et audio.
   */
  foreignIds: z.array(z.uuid()).max(ARCHIVE_LIMITS.rows).default([]),
});
export type ArchiveServiceImport = z.infer<typeof ArchiveServiceImport>;

// ─── Chemins dans le zip ─────────────────────────────────────────────────────

export const ARCHIVE_MANIFEST_PATH = 'manifest.json';
export const archiveTablePath = (service: ArchiveService, table: string) =>
  `tables/${service}/${table}.json`;
export const archiveFilePath = (sha256: string) => `files/${sha256}`;

export type ArchivePath =
  | { kind: 'manifest' }
  | { kind: 'table'; service: ArchiveService; table: string }
  | { kind: 'file'; sha256: string };

/** Ce que désigne un chemin du zip ; null pour tout autre chemin (refusé à l'import). */
export function parseArchivePath(path: string): ArchivePath | null {
  if (path === ARCHIVE_MANIFEST_PATH) return { kind: 'manifest' };
  const table = /^tables\/([a-z]+)\/([a-z][a-z0-9_]{0,62})\.json$/.exec(path);
  if (table) {
    const service = ArchiveService.safeParse(table[1]);
    return service.success ? { kind: 'table', service: service.data, table: table[2]! } : null;
  }
  const file = /^files\/([0-9a-f]{64})$/.exec(path);
  return file ? { kind: 'file', sha256: file[1]! } : null;
}

// ─── Adresses de fichiers ────────────────────────────────────────────────────

export const FILE_REF_PREFIX = 'yner-file:';

/** Applique `fn` à chaque chaîne de `value` (valeurs et clés d'objets), en profondeur. */
export function mapStrings<T>(value: T, fn: (s: string) => string): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return fn(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[fn(k)] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

const KEY_CHARS = '[A-Za-z0-9_.\\-/]+';

/**
 * Remplace les adresses publiques des fichiers de la campagne (`<base>/<clé>`, y compris au
 * milieu d'un texte ou d'un HTML) par `yner-file:<clé>` et rend les clés trouvées. Les autres
 * adresses (packs de la marketplace, bibliothèque, sites tiers) restent telles quelles.
 */
export function toFileRefs<T>(value: T, publicBase: string): { value: T; keys: Set<string> } {
  const base = publicBase.replace(/\/+$/, '');
  const folders = ARCHIVE_FILE_FOLDERS.map(escapeRegExp).join('|');
  const pattern = new RegExp(`${escapeRegExp(base)}/((?:${folders})/${KEY_CHARS})`, 'g');
  const keys = new Set<string>();
  const out = mapStrings(value, (s) =>
    s.includes(base)
      ? s.replace(pattern, (match, key: string) => {
          const clean = key.replace(/[./]+$/, '');
          if (!ArchiveFileKey.safeParse(clean).success) return match;
          keys.add(clean);
          return `${FILE_REF_PREFIX}${clean}${key.slice(clean.length)}`;
        })
      : s,
  );
  return { value: out, keys };
}

/** Remplace chaque `yner-file:<clé>` par l'adresse publique `<base>/<clé>`. */
export function fromFileRefs<T>(value: T, publicBase: string): T {
  const base = publicBase.replace(/\/+$/, '');
  const pattern = new RegExp(`${escapeRegExp(FILE_REF_PREFIX)}(${KEY_CHARS})`, 'g');
  return mapStrings(value, (s) =>
    s.includes(FILE_REF_PREFIX) ? s.replace(pattern, (_, key: string) => `${base}/${key}`) : s,
  );
}

// ─── Identifiants ────────────────────────────────────────────────────────────

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Remplace chaque identifiant connu de `map` (clés en minuscules), où qu'il soit : valeur,
 * clé d'objet, morceau d'adresse, attribut HTML. Les identifiants inconnus (comptes des
 * joueurs, packs, bibliothèque) restent : chaque service décide de ce qu'il en fait.
 */
export function remapIds<T>(value: T, map: ReadonlyMap<string, string>): T {
  return mapStrings(value, (s) =>
    s.length < 36 ? s : s.replace(UUID, (id) => map.get(id.toLowerCase()) ?? id),
  );
}

/** Identifiants des lignes (`id`) de toutes les tables : ceux que l'import renouvelle. */
export function rowIds(tables: Iterable<ArchiveRows>): Set<string> {
  const ids = new Set<string>();
  for (const rows of tables)
    for (const row of rows) if (typeof row.id === 'string') ids.add(row.id.toLowerCase());
  return ids;
}

/** Dossier et propriétaire (campagne, personnage) d'une clé de fichier. */
export function fileOwner(key: string): { folder: string; ownerId: string } | null {
  for (const folder of ARCHIVE_FILE_FOLDERS) {
    if (!key.startsWith(`${folder}/`)) continue;
    const ownerId = key.slice(folder.length + 1).split('/')[0];
    return ownerId ? { folder, ownerId } : null;
  }
  return null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
