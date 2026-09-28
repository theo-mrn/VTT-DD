/**
 * Contrat du service audio (docs/audio.md § 4.2) : types partagés par le
 * service `backend/audio` et le moteur audio du front, et fonctions pures de
 * la ligne de temps (même calcul des deux côtés).
 *
 * Tout ce qui est ici fonctionne dans Node comme dans le navigateur (pas de
 * `node:crypto`) : l'id déterministe des imports est un UUID v5 calculé avec
 * un SHA-1 en JavaScript pur.
 */
import { z } from 'zod';

export const AssetKind = z.enum(['music', 'ambience', 'sfx']);
export type AssetKind = z.infer<typeof AssetKind>;
export const AssetSource = z.enum(['upload', 'catalog', 'youtube']);
export type AssetSource = z.infer<typeof AssetSource>;
export const AssetStatus = z.enum(['processing', 'ready', 'rejected']);
export type AssetStatus = z.infer<typeof AssetStatus>;
export const ChannelName = z.enum(['music', 'ambience']);
export type ChannelName = z.infer<typeof ChannelName>;
export const ChannelStatus = z.enum(['stopped', 'playing', 'paused']);
export type ChannelStatus = z.infer<typeof ChannelStatus>;
export const RepeatMode = z.enum(['off', 'track', 'all']);
export type RepeatMode = z.infer<typeof RepeatMode>;
export const BusName = z.enum(['master', 'music', 'ambience', 'sfx', 'zones', 'dice']);
export type BusName = z.infer<typeof BusName>;

/** Ce qu'il faut pour jouer un asset (tous les membres). */
export const PlaybackAsset = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: AssetKind,
  source: AssetSource,
  status: AssetStatus,
  /** Absolue ; null si YouTube ou pas encore prête. */
  url: z.url().nullable(),
  youtubeId: z.string().nullable(),
  durationMs: z.number().int().positive().nullable(),
  /** Normalisation de loudness (worker), appliquée à la lecture. */
  gainDb: z.number(),
  /** Réglage du MJ. */
  volume: z.number().min(0).max(1),
  deleted: z.boolean(),
});
export type PlaybackAsset = z.infer<typeof PlaybackAsset>;

/** Vue MJ : PlaybackAsset + métadonnées. */
export const Asset = PlaybackAsset.extend({
  catalogId: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nullable(),
  loudnessLufs: z.number().nullable(),
  rejectReason: z.string().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type Asset = z.infer<typeof Asset>;

export const CreateAsset = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('upload'),
    uploadToken: z.string().max(4096),
    name: z.string().trim().min(1).max(200),
    kind: AssetKind,
  }),
  z.object({
    source: z.literal('catalog'),
    catalogId: z.string().max(200),
    name: z.string().trim().min(1).max(200).optional(),
    kind: AssetKind.optional(),
  }),
  z.object({
    source: z.literal('youtube'),
    /** Lien YouTube (watch, youtu.be, shorts, embed) ou id de 11 caractères. */
    url: z.string().max(200),
    name: z.string().trim().min(1).max(200),
    kind: AssetKind.optional(),
    durationMs: z.number().int().positive().optional(),
  }),
]);
export type CreateAsset = z.infer<typeof CreateAsset>;

export const UploadRequest = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  kind: AssetKind,
});
export type UploadRequest = z.infer<typeof UploadRequest>;

export const UploadTicket = z.object({
  uploadUrl: z.string(),
  /** En-têtes à envoyer tels quels avec le PUT (type et longueur signés). */
  headers: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
  uploadToken: z.string(),
});
export type UploadTicket = z.infer<typeof UploadTicket>;

export const Playlist = z.object({
  id: z.uuid(),
  name: z.string(),
  assetIds: z.array(z.uuid()),
  version: z.number().int(),
});
export type Playlist = z.infer<typeof Playlist>;

export const CatalogCategory = z.object({ id: z.string(), label: z.string(), kind: AssetKind });
export type CatalogCategory = z.infer<typeof CatalogCategory>;
export const CatalogEntry = z.object({
  id: z.string(),
  name: z.string(),
  kind: AssetKind,
  category: z.string(),
  url: z.url(),
  durationMs: z.number().int().positive().nullable(),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;

export const ChannelState = z.object({
  campaignId: z.uuid(),
  channel: ChannelName,
  /** +1 à chaque changement effectif : un état n'est appliqué que s'il est plus récent. */
  version: z.number().int().nonnegative(),
  status: ChannelStatus,
  track: PlaybackAsset.nullable(),
  next: PlaybackAsset.nullable(),
  playlistId: z.uuid().nullable(),
  queueIndex: z.number().int().nullable(),
  queueLength: z.number().int(),
  repeat: RepeatMode,
  shuffle: z.boolean(),
  /** Position à `anchorAt` (horloge du serveur). */
  positionMs: z.number().int().nonnegative(),
  anchorAt: z.iso.datetime(),
  /** Prochaine transition automatique (fin de piste moins le fondu). */
  endsAt: z.iso.datetime().nullable(),
  volume: z.number().min(0).max(1),
  crossfadeMs: z.number().int(),
  updatedBy: z.uuid().nullable(),
  updatedAt: z.iso.datetime(),
});
export type ChannelState = z.infer<typeof ChannelState>;

const expectedVersion = z.number().int().nonnegative().optional();
/** play : exactement un de assetId / playlistId, vérifié par le service (422 invalid_command). */
export const ChannelCommand = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('play'),
    assetId: z.uuid().optional(),
    playlistId: z.uuid().optional(),
    index: z.number().int().nonnegative().optional(),
    positionMs: z.number().int().nonnegative().optional(),
    expectedVersion,
  }),
  z.object({ type: z.literal('pause'), expectedVersion }),
  z.object({ type: z.literal('resume'), expectedVersion }),
  z.object({
    type: z.literal('seek'),
    positionMs: z.number().int().nonnegative(),
    expectedVersion,
  }),
  z.object({ type: z.literal('stop'), expectedVersion }),
  z.object({ type: z.literal('next'), expectedVersion }),
  z.object({ type: z.literal('previous'), expectedVersion }),
  z.object({
    type: z.literal('configure'),
    volume: z.number().min(0).max(1).optional(),
    crossfadeMs: z.number().int().min(0).max(10_000).optional(),
    repeat: RepeatMode.optional(),
    shuffle: z.boolean().optional(),
    expectedVersion,
  }),
]);
export type ChannelCommand = z.infer<typeof ChannelCommand>;
export type ChannelCommandType = ChannelCommand['type'];

export const MixerPreferences = z.object({
  volumes: z.record(BusName, z.number().min(0).max(1)),
  muted: z.record(BusName, z.boolean()),
  version: z.number().int(),
});
export type MixerPreferences = z.infer<typeof MixerPreferences>;

/** Corps du PUT : les bus absents gardent leur valeur (défaut 1, non coupé). */
export const MixerUpdate = z.object({
  volumes: z.partialRecord(BusName, z.number().min(0).max(1)),
  muted: z.partialRecord(BusName, z.boolean()).optional(),
  version: z.number().int().nonnegative().optional(),
});
export type MixerUpdate = z.infer<typeof MixerUpdate>;

/** Charges utiles des événements audio (docs/audio.md § 4.3). */
export interface ChannelChangedPayload {
  state: ChannelState;
  cause: ChannelCommandType | 'auto_advance' | 'asset_deleted' | 'playlist_updated';
  changes: unknown[];
  skipped?: number;
}
export interface CuePlayedPayload {
  cueId: string;
  asset: PlaybackAsset;
  startAt: string;
  volume: number;
  startedBy: string;
}
export type CuesStoppedPayload = { cueIds: string[] } | { all: true };

// Ligne de temps, horloge, dérive, planification : ./audio-sync.ts (sans zod).

// ─── Identifiants déterministes ─────────────────────────────────────────────

/** Espace de noms des ids d'assets importés (UUID v5). Ne jamais changer. */
export const AUDIO_IMPORT_NAMESPACE = '3b0e4a1c-6f1d-5b2e-9c7a-2d4f6e8a0b1c';

/**
 * Id d'asset importé, stable : UUID v5 de `vtt-audio-import:${campaignId}:${source}`,
 * source = URL normalisée (`normalizeSourceUrl`) ou `youtube:<id>`. Utilisé aussi
 * par l'import de campaign (zones musicales).
 */
export function importedAssetId(campaignId: string, source: string): string {
  return uuidv5(`vtt-audio-import:${campaignId.toLowerCase()}:${source}`, AUDIO_IMPORT_NAMESPACE);
}

/** URL absolue sans espaces (encodées), pour les ids déterministes et le catalogue. */
export function normalizeSourceUrl(url: string, base = 'https://assets.yner.fr'): string {
  const trimmed = url.trim();
  const u = new URL(trimmed.replace(/ /g, '%20'), base);
  // Décodage puis ré-encodage : « a%20b » et « a b » donnent la même URL
  u.pathname = u.pathname
    .split('/')
    .map((segment) => {
      try {
        return encodeURIComponent(decodeURIComponent(segment));
      } catch {
        return encodeURIComponent(segment);
      }
    })
    .join('/');
  return u.toString();
}

/** Id YouTube de 11 caractères depuis un lien ou un id brut ; null si invalide. */
export function parseYoutubeId(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u: URL;
  try {
    u = new URL(s.includes('://') ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname);
      id = m?.[1] ?? null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** UUID version 5 (RFC 9562) : SHA-1 de l'espace de noms et du nom. */
export function uuidv5(name: string, namespace: string): string {
  const ns = hexToBytes(namespace.replace(/-/g, ''));
  const data = new Uint8Array(ns.length + utf8(name).length);
  data.set(ns, 0);
  data.set(utf8(name), ns.length);
  const bytes = sha1(data).subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** SHA-1 (FIPS 180-4) : seulement pour les UUID v5, jamais pour de la sécurité. */
function sha1(message: Uint8Array): Uint8Array {
  const length = message.length;
  const padded = new Uint8Array((((length + 8) >> 6) + 1) * 64);
  padded.set(message);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  const bits = length * 8;
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000));
  view.setUint32(padded.length - 4, bits >>> 0);
  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) {
      const x = w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!;
      w[i] = (x << 1) | (x >>> 31);
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]!) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const o = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h));
  return out;
}
