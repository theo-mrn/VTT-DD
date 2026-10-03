/**
 * Conversion des sons de l'ancienne app (docs/audio.md § 5), sans base : les
 * exports (tools/firebase-export, NDJSON `{ path, id, data }`) deviennent un
 * plan d'import (assets, playlists, canaux, correspondances) et un rapport.
 *
 *  - `sound_templates/{salle}/templates/{id}` → asset : `category: music` →
 *    `music`, sinon `sfx` ; YouTube (id nettoyé), catalogue (URL connue) ou
 *    fichier envoyé (copié puis analysé) ; id `importedAssetId(campagne, source)`,
 *    donc les doublons d'une même campagne fusionnent ;
 *  - `sound_templates/{salle}/playlists/{id}` → playlist (id stable du chemin) ;
 *  - RTDB `rooms/{salle}/music` → canal musique **en pause** à sa position ;
 *  - `cartes/{salle}/musicZones/{id}` → un asset par URL distincte (ambiance) ;
 *    YouTube dans une zone : ignoré, signalé (la carte s'y branchera plus tard).
 */
import {
  importedAssetId,
  normalizeSourceUrl,
  parseYoutubeId,
  uuidv5,
  type AssetKind,
} from '@vtt/contracts';
import { starwarsKey, type Catalog } from '../catalog/index.js';

export interface FirestoreDoc<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

export const LEGACY_SOURCE = 'firestore';
/** Espace de noms des ids de playlists importées. */
const PLAYLIST_NAMESPACE = '8f14e45f-ceea-567d-a2b1-4c7a3e0b9d21';
export const legacyPlaylistId = (path: string) => uuidv5(`firebase:${path}`, PLAYLIST_NAMESPACE);

export interface PlannedAsset {
  id: string;
  campaignId: string;
  kind: AssetKind;
  name: string;
  source: 'upload' | 'catalog' | 'youtube';
  youtubeId?: string;
  catalogId?: string;
  playbackUrl?: string;
  /** Envoi de l'ancienne app à copier dans le bucket (puis analysé). */
  copyFrom?: string;
  /** Chemins legacy qui désignent cet asset. */
  legacy: string[];
}

export interface PlannedPlaylist {
  id: string;
  campaignId: string;
  name: string;
  assetIds: string[];
  legacy: string;
}

export interface PlannedChannel {
  campaignId: string;
  assetId: string;
  positionMs: number;
  legacy: string;
}

export interface ReportLine {
  type: 'asset' | 'playlist' | 'channel' | 'zone' | 'room';
  legacy: string;
  status: 'ok' | 'merged' | 'ignored' | 'error';
  detail?: string;
}

export interface ImportPlan {
  assets: Map<string, PlannedAsset>;
  playlists: PlannedPlaylist[];
  channels: PlannedChannel[];
  report: ReportLine[];
}

interface Template {
  name?: unknown;
  soundUrl?: unknown;
  type?: unknown;
  category?: unknown;
}
interface LegacyPlaylist {
  name?: unknown;
  trackIds?: unknown;
}
interface Zone {
  name?: unknown;
  url?: unknown;
}
export interface RtdbMusic {
  templateId?: unknown;
  videoId?: unknown;
  trackUrl?: unknown;
  timestamp?: unknown;
  videoTitle?: unknown;
  trackName?: unknown;
}

const text = (v: unknown, max = 200) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

export function createPlan(): ImportPlan {
  return { assets: new Map(), playlists: [], channels: [], report: [] };
}

/**
 * Source d'une URL de fichier legacy : entrée du catalogue si elle y figure
 * (y compris les wav Star Wars relatifs, publiés en m4a), sinon envoi à copier.
 */
function fileSource(
  catalog: Catalog,
  raw: string,
): { catalogId: string; url: string } | { copyFrom: string; url: string } | null {
  let url: string;
  try {
    if (raw.startsWith('/effects/')) {
      const published = catalog
        .entries('starwars')
        .find((e) => e.url.endsWith(starwarsKey(raw).slice('audio/catalog/'.length)));
      if (published) return { catalogId: published.id, url: published.url };
    }
    url = normalizeSourceUrl(raw);
  } catch {
    return null;
  }
  const entry = catalog.byUrl(url);
  if (entry) return { catalogId: entry.id, url: entry.url };
  if (!/^https?:\/\//.test(url)) return null;
  return { copyFrom: url, url };
}

/** Ajoute (ou fusionne) un asset ; renvoie son id. */
function addAsset(plan: ImportPlan, a: PlannedAsset, legacyPath: string): string {
  const known = plan.assets.get(a.id);
  if (known) {
    known.legacy.push(legacyPath);
    plan.report.push({ type: 'asset', legacy: legacyPath, status: 'merged', detail: a.id });
    return a.id;
  }
  plan.assets.set(a.id, a);
  plan.report.push({ type: 'asset', legacy: legacyPath, status: 'ok', detail: `${a.source}` });
  return a.id;
}

/** `sound_templates/{salle}/templates/{id}`. */
export function addTemplate(
  plan: ImportPlan,
  doc: FirestoreDoc<Template>,
  campaignId: string,
  catalog: Catalog,
): string | null {
  const name = text(doc.data.name) ?? 'Son importé';
  const kind: AssetKind = doc.data.category === 'music' ? 'music' : 'sfx';
  const raw = text(doc.data.soundUrl, 2000);
  if (!raw) {
    plan.report.push({ type: 'asset', legacy: doc.path, status: 'error', detail: 'sans URL' });
    return null;
  }
  if (doc.data.type === 'youtube') {
    const youtubeId = parseYoutubeId(raw);
    if (!youtubeId) {
      plan.report.push({
        type: 'asset',
        legacy: doc.path,
        status: 'error',
        detail: 'id YouTube invalide',
      });
      return null;
    }
    return addAsset(
      plan,
      {
        id: importedAssetId(campaignId, `youtube:${youtubeId}`),
        campaignId,
        kind,
        name,
        source: 'youtube',
        youtubeId,
        legacy: [doc.path],
      },
      doc.path,
    );
  }
  const src = fileSource(catalog, raw);
  if (!src) {
    plan.report.push({ type: 'asset', legacy: doc.path, status: 'error', detail: 'URL illisible' });
    return null;
  }
  return addAsset(
    plan,
    {
      id: importedAssetId(campaignId, src.url),
      campaignId,
      kind,
      name,
      legacy: [doc.path],
      ...('catalogId' in src
        ? { source: 'catalog' as const, catalogId: src.catalogId, playbackUrl: src.url }
        : { source: 'upload' as const, copyFrom: src.copyFrom }),
    },
    doc.path,
  );
}

/** `sound_templates/{salle}/playlists/{id}` : pistes résolues par leur chemin legacy. */
export function addPlaylist(
  plan: ImportPlan,
  doc: FirestoreDoc<LegacyPlaylist>,
  campaignId: string,
  templateAsset: (templatePath: string) => string | undefined,
) {
  const room = doc.path.split('/')[1]!;
  const ids: string[] = [];
  const tracks = Array.isArray(doc.data.trackIds) ? doc.data.trackIds : [];
  for (const t of tracks) {
    if (typeof t !== 'string') continue;
    const asset = templateAsset(`sound_templates/${room}/templates/${t}`);
    if (!asset) {
      plan.report.push({
        type: 'playlist',
        legacy: doc.path,
        status: 'ignored',
        detail: `piste absente ${t}`,
      });
      continue;
    }
    if (!ids.includes(asset)) ids.push(asset);
  }
  plan.playlists.push({
    id: legacyPlaylistId(doc.path),
    campaignId,
    name: (text(doc.data.name, 100) ?? 'Playlist importée').slice(0, 100),
    assetIds: ids,
    legacy: doc.path,
  });
  plan.report.push({
    type: 'playlist',
    legacy: doc.path,
    status: 'ok',
    detail: `${ids.length} piste(s)`,
  });
}

/** RTDB `rooms/{salle}/music` : canal musique en pause à sa dernière position. */
export function addMusicState(
  plan: ImportPlan,
  room: string,
  music: RtdbMusic,
  campaignId: string,
  templateAsset: (templatePath: string) => string | undefined,
) {
  const legacy = `rooms/${room}/music`;
  let assetId =
    typeof music.templateId === 'string'
      ? templateAsset(`sound_templates/${room}/templates/${music.templateId}`)
      : undefined;
  if (!assetId && typeof music.videoId === 'string') {
    const yt = parseYoutubeId(music.videoId);
    const candidate = yt ? importedAssetId(campaignId, `youtube:${yt}`) : undefined;
    if (candidate && plan.assets.has(candidate)) assetId = candidate;
  }
  if (!assetId) {
    plan.report.push({ type: 'channel', legacy, status: 'ignored', detail: 'piste introuvable' });
    return;
  }
  const seconds =
    typeof music.timestamp === 'number' && Number.isFinite(music.timestamp) ? music.timestamp : 0;
  plan.channels.push({
    campaignId,
    assetId,
    positionMs: Math.max(0, Math.round(seconds * 1000)),
    legacy,
  });
  plan.report.push({ type: 'channel', legacy, status: 'ok', detail: 'en pause' });
}

/** `cartes/{salle}/musicZones/{id}` : un asset d'ambiance par URL distincte. */
export function addZone(
  plan: ImportPlan,
  doc: FirestoreDoc<Zone>,
  campaignId: string,
  catalog: Catalog,
) {
  const raw = text(doc.data.url, 2000);
  if (!raw) {
    plan.report.push({ type: 'zone', legacy: doc.path, status: 'error', detail: 'sans URL' });
    return;
  }
  if ((parseYoutubeId(raw) && !/^https?:\/\//.test(raw)) || /youtu/.test(raw)) {
    plan.report.push({
      type: 'zone',
      legacy: doc.path,
      status: 'ignored',
      detail: 'YouTube dans une zone',
    });
    return;
  }
  const src = fileSource(catalog, raw);
  if (!src) {
    plan.report.push({ type: 'zone', legacy: doc.path, status: 'error', detail: 'URL illisible' });
    return;
  }
  addAsset(
    plan,
    {
      id: importedAssetId(campaignId, src.url),
      campaignId,
      kind: 'ambience',
      name: text(doc.data.name) ?? 'Zone musicale',
      legacy: [doc.path],
      ...('catalogId' in src
        ? { source: 'catalog' as const, catalogId: src.catalogId, playbackUrl: src.url }
        : { source: 'upload' as const, copyFrom: src.copyFrom }),
    },
    doc.path,
  );
}

/** Salle de l'ancienne app d'un chemin (`sound_templates/{salle}/…`, `cartes/{salle}/…`). */
export const roomOf = (path: string) => path.split('/')[1] ?? '';
