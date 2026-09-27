/**
 * Conversion des documents `Historique/{code}/events/{id}` en événements du
 * journal. Fonctions pures : aucune base, aucun réseau (testées sur de faux
 * exports).
 *
 * Identifiant stable : UUIDv5 du chemin Firestore (espace de noms propre à cet
 * import), si bien qu'un second import retrouve les mêmes événements et les
 * écarte (inbox) au lieu de les dupliquer.
 */
import { createHash } from 'node:crypto';
import { toDate, toText, type FirestoreDoc, type LegacyHistoryEvent } from './legacy.js';

/** `Historique/{code}/events/{id}` */
const EVENT_PATH = /^Historique\/([^/]+)\/events\/([^/]+)$/;

export const isEventPath = (path: string) => EVENT_PATH.test(path);

/** Espace de noms des UUIDv5 de l'ancien Historique (constante : ne jamais la changer). */
export const LEGACY_NAMESPACE = 'b8c3f0e2-6d1a-4f5e-9c47-2a1e8d3b7f60';

/** Types écrits par l'ancienne app (EventType de historiqueTrackerService.ts). */
export const KNOWN_TYPES = [
  'creation',
  'combat',
  'mort',
  'niveau',
  'stats',
  'inventaire',
  'competence',
  'note',
  'deplacement',
  'info',
] as const;

/** Champs connus d'un événement ; les autres sont gardés dans `extra`. */
const KNOWN_FIELDS = new Set([
  'type',
  'message',
  'characterId',
  'characterName',
  'characterAvatar',
  'characterType',
  'targetUserId',
  'details',
  'timestamp',
]);

export interface ImportedEvent {
  /** Chemin du document Firestore. */
  legacyId: string;
  /** UUIDv5 du chemin : identifiant de l'événement dans le journal. */
  id: string;
  /** Code de la campagne (`Salle/{code}`). */
  campaignCode: string;
  occurredAt: Date;
  /** `legacy.<type en snake_case>`. */
  type: string;
  /** UID Firebase du seul lecteur (hors MJ) : événement privé. */
  targetUid?: string;
  /** Id Firestore du personnage (`cartes/{code}/characters/{id}`). */
  characterLegacyId?: string;
  payload: Record<string, unknown>;
  warnings: string[];
}

/** UUID version 5 (RFC 9562) : SHA-1 de l'espace de noms et du nom. */
export function uuidv5(name: string, namespace: string = LEGACY_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const bytes = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variante RFC
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** snake_case ASCII : `levelUp` → `level_up`, `Compétence` → `competence`. */
export function snakeCase(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 100);
}

/** Type du journal : `legacy.<type>` (`legacy.unknown` si absent ou illisible). */
export function legacyType(raw: unknown): string {
  const t = typeof raw === 'string' ? snakeCase(raw) : '';
  return `legacy.${t || 'unknown'}`;
}

export function transformEvent(doc: FirestoreDoc<LegacyHistoryEvent>): ImportedEvent {
  const m = EVENT_PATH.exec(doc.path);
  if (!m) throw new Error('chemin inattendu');
  const d = doc.data ?? {};
  const occurredAt = toDate(d.timestamp);
  if (!occurredAt) throw new Error('date absente');

  const warnings: string[] = [];
  const rawType = typeof d.type === 'string' ? d.type : null;
  if (!rawType || !(KNOWN_TYPES as readonly string[]).includes(rawType))
    warnings.push('type inconnu');
  const message = typeof d.message === 'string' ? d.message : '';
  if (!message) warnings.push('message absent');

  const characterLegacyId = toText(d.characterId);
  // Avatar intégré en base64 (data:…, jusqu'à 300 Ko) : pas recopié dans un journal
  // conservé sans limite ; l'avatar reste sur la fiche du personnage
  let avatar = toText(d.characterAvatar) ?? null;
  if (avatar?.startsWith('data:')) {
    avatar = null;
    warnings.push('avatar intégré retiré');
  }
  const character =
    characterLegacyId || toText(d.characterName)
      ? {
          legacyId: characterLegacyId ?? null,
          name: toText(d.characterName) ?? null,
          avatar,
          type: toText(d.characterType) ?? null,
        }
      : null;
  const details =
    d.details && typeof d.details === 'object' && !Array.isArray(d.details) ? d.details : null;
  const extra = Object.fromEntries(Object.entries(d).filter(([k]) => !KNOWN_FIELDS.has(k)));

  return {
    legacyId: doc.path,
    id: uuidv5(`firebase:${doc.path}`),
    campaignCode: m[1]!,
    occurredAt,
    type: legacyType(rawType),
    targetUid: toText(d.targetUserId),
    characterLegacyId,
    payload: {
      message,
      character,
      details,
      ...(Object.keys(extra).length ? { extra } : {}),
      legacy: { source: 'firebase', path: doc.path, type: rawType },
    },
    warnings,
  };
}
