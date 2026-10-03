/**
 * Notes d'une salle de l'ancienne app → lignes de `notes` (docs/api-notes.md).
 * Fonction pure : les correspondances (campagne, MJ, personnages importés,
 * comptes, profils legacy) sont passées en paramètre ; ce qui ne peut pas être
 * migré devient un avertissement, jamais une exception. Les avertissements ne
 * citent jamais le titre ni le texte d'une note.
 *
 * Sources (legacy/src/components/Notes.tsx, QuickNotes.tsx) :
 *  - privées : `Notes/{r}/{clé}/{id}`, où la clé est l'id du personnage joué
 *    (`persoId`), l'UID Firebase pour qui n'en joue pas (le MJ), ou l'ancien
 *    chemin par nom (`users/{uid}.perso` : `Nomperso`, ou « MJ ») ;
 *  - partagées : `SharedNotes/{r}/notes/{id}`, auteur `createdBy` (mêmes clés),
 *    `sharedWith` : `'all'` (ou absent) ou ids de personnages de la salle.
 * Champs : title, content (HTML), type, tags [{id, label}], image, race, class,
 * region, itemType, questType (principale|annexe), questStatus, subQuests
 * [{id, title, description, status}], createdAt, updatedAt ; `createdByName`,
 * `isShared` et `_pathCharId` ne sont pas repris (déduits).
 *
 * Identifiants stables : UUID v5 du chemin legacy (`legacyUuid`, le même que
 * l'import des cartes), pour qu'un import rejoué retrouve les mêmes lignes.
 */
import type { NoteSubQuest, NoteTag, notes, QuestStatus, QuestType } from '../../db/schema.js';
import { NOTE_TYPES } from '../../db/schema.js';
import { GM_NAME, toIsoDate, type FirestoreDoc } from '../legacy.js';
import { legacyUuid } from '../maps/transform.js';

export type NoteInsert = typeof notes.$inferInsert;

/** Bornes de la table (0009-notes.sql) et de l'API. */
export const LIMITS = {
  title: 200,
  content: 200_000,
  detail: 200,
  tags: 50,
  tag: 100,
  subQuests: 100,
  subQuestTitle: 500,
  subQuestDescription: 5000,
  sharedWith: 100,
} as const;

export interface NotesMappings {
  campaignId: string;
  /** MJ propriétaire : auteur des notes rangées sous « MJ ». */
  gmId: string;
  /** `cartes/{r}/characters/{id}` → personnage importé, s'il est engagé, son propriétaire et son joueur. */
  characters: ReadonlyMap<
    string,
    { id: string; engaged: boolean; ownerId: string; playedBy: string | null }
  >;
  /** Personnages legacy de la salle (id du document → Nomperso, type) : chemins par nom. */
  legacyCharacters: ReadonlyMap<string, { name?: string; type?: string }>;
  /** UID Firebase → compte migré. */
  accounts: ReadonlyMap<string, string>;
  /** Profils legacy `users/{uid}` (personnage joué, nom joué, salle active). */
  users: ReadonlyMap<string, { persoId?: string; perso?: string; roomId?: string }>;
  /** Date retenue pour une note sans date (l'ancienne app affichait « maintenant »). */
  importedAt: Date;
}

export interface MigratedNotes {
  notes: NoteInsert[];
  /** Notes ignorées (auteur introuvable, doublon d'un ancien chemin). */
  skipped: number;
  warnings: string[];
}

type Data = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

const QUEST_TYPES: Record<string, QuestType> = { principale: 'main', annexe: 'side' };
const QUEST_STATUSES: Record<string, QuestStatus> = {
  'not-started': 'not_started',
  'in-progress': 'in_progress',
  completed: 'completed',
};

interface Author {
  ownerId: string;
  characterId: string | null;
  /** La clé désigne un personnage par son id (prioritaire sur l'ancien chemin par nom). */
  byId: boolean;
}

/** Auteur d'une clé legacy (clé de chemin des notes privées, `createdBy` des partagées). */
export function resolveAuthor(code: string, key: string, m: NotesMappings): Author | string {
  if (key === GM_NAME) return { ownerId: m.gmId, characterId: null, byId: false };

  const fromCharacter = (charId: string, byId: boolean): Author | string => {
    const imported = m.characters.get(`cartes/${code}/characters/${charId}`);
    // Auteur : le joueur dont c'est le persoId, sinon celui qui l'incarne, sinon son propriétaire
    const uid = [...m.users].find(([, u]) => u.persoId === charId)?.[0];
    const ownerId = (uid && m.accounts.get(uid)) || imported?.playedBy || imported?.ownerId;
    if (!ownerId) return `personnage ${charId} sans auteur retrouvé`;
    return { ownerId, characterId: imported?.engaged ? imported.id : null, byId };
  };

  if (m.legacyCharacters.has(key)) return fromCharacter(key, true);
  const account = m.accounts.get(key);
  if (account) return { ownerId: account, characterId: null, byId: true };
  if (m.users.has(key)) return `compte ${key} non migré`;

  // Ancien chemin par nom (`users/{uid}.perso`)
  const byName = [...m.legacyCharacters].filter(([, c]) => c.name === key).map(([id]) => id);
  const players = byName.filter((id) => m.legacyCharacters.get(id)?.type === 'joueurs');
  const candidates = players.length ? players : byName;
  const uids = [...m.users].filter(([, u]) => u.perso === key && u.roomId === code);
  if (candidates.length === 1) return fromCharacter(candidates[0]!, false);
  if (candidates.length > 1) {
    const played = candidates.filter((id) => uids.some(([, u]) => u.persoId === id));
    if (played.length === 1) return fromCharacter(played[0]!, false);
    return `${candidates.length} personnages portent le nom de la clé`;
  }
  const only = uids.length === 1 ? m.accounts.get(uids[0]![0]) : undefined;
  if (only) return { ownerId: only, characterId: null, byId: false };
  return 'auteur introuvable';
}

/** Personnage destinataire (id legacy, ou nom pour les plus anciennes) → personnage engagé. */
function shareTarget(code: string, key: string, m: NotesMappings): string | undefined {
  let charId: string | undefined = m.legacyCharacters.has(key) ? key : undefined;
  if (!charId) {
    const byName = [...m.legacyCharacters].filter(([, c]) => c.name === key);
    if (byName.length === 1) charId = byName[0]![0];
  }
  const imported = charId ? m.characters.get(`cartes/${code}/characters/${charId}`) : undefined;
  return imported?.engaged ? imported.id : undefined;
}

function text(v: unknown, max: number, what: string, warn: (w: string) => void): string {
  const s = (str(v) ?? '').trim();
  if ([...s].length <= max) return s;
  warn(`${what} tronqué à ${max} caractères`);
  return [...s].slice(0, max).join('');
}

const detail = (v: unknown) => {
  const s = str(v)?.trim();
  return s ? [...s].slice(0, LIMITS.detail).join('') : null;
};

function tags(v: unknown, warn: (w: string) => void): NoteTag[] {
  if (!Array.isArray(v)) return [];
  const out: NoteTag[] = [];
  for (const t of v) {
    const o = t && typeof t === 'object' ? (t as Data) : {};
    const label = str(o.label)?.trim() ?? (typeof t === 'string' ? t.trim() : '');
    const id = str(o.id)?.trim() || label.toLowerCase();
    if (!label || !id) continue;
    if (out.some((x) => x.id === id)) continue;
    out.push({ id: id.slice(0, LIMITS.tag), label: label.slice(0, LIMITS.tag) });
  }
  if (out.length > LIMITS.tags) warn(`${out.length} tags : ${LIMITS.tags} gardés`);
  return out.slice(0, LIMITS.tags);
}

function subQuests(v: unknown, warn: (w: string) => void): NoteSubQuest[] {
  if (!Array.isArray(v)) return [];
  const out: NoteSubQuest[] = [];
  for (const [i, s] of v.entries()) {
    const o = s && typeof s === 'object' ? (s as Data) : {};
    const id = String(o.id ?? '').trim() || String(i + 1);
    out.push({
      id: id.slice(0, 100),
      title: [...(str(o.title) ?? '')].slice(0, LIMITS.subQuestTitle).join(''),
      description: [...(str(o.description) ?? '')].slice(0, LIMITS.subQuestDescription).join(''),
      status: QUEST_STATUSES[str(o.status) ?? ''] ?? 'not_started',
    });
  }
  if (out.length > LIMITS.subQuests) warn(`${out.length} étapes : ${LIMITS.subQuests} gardées`);
  return out.slice(0, LIMITS.subQuests);
}

/** Champs d'une note legacy (privée ou partagée), sans auteur ni partage. */
function fields(d: Data, m: NotesMappings, warn: (w: string) => void) {
  const type = str(d.type);
  if (type && !(NOTE_TYPES as readonly string[]).includes(type))
    warn(`type « ${type} » non reconnu : other`);
  const image = str(d.image)?.trim();
  const createdAt = toIsoDate(d.createdAt) ?? toIsoDate(d.updatedAt);
  const updatedAt = toIsoDate(d.updatedAt) ?? createdAt;
  return {
    title: text(d.title, LIMITS.title, 'titre', warn),
    content: (() => {
      const c = str(d.content) ?? '';
      if (c.length <= LIMITS.content) return c;
      warn(`texte tronqué à ${LIMITS.content} caractères`);
      return c.slice(0, LIMITS.content);
    })(),
    type: (NOTE_TYPES as readonly string[]).includes(type ?? '')
      ? (type as NoteInsert['type'])
      : 'other',
    tags: tags(d.tags, warn),
    // Les images `data:` et Firebase Storage sont rapatriées par la CLI
    imageUrl: image || null,
    race: detail(d.race),
    class: detail(d.class),
    region: detail(d.region),
    itemType: detail(d.itemType),
    questType: QUEST_TYPES[str(d.questType) ?? ''] ?? null,
    questStatus: QUEST_STATUSES[str(d.questStatus) ?? ''] ?? null,
    subQuests: subQuests(d.subQuests, warn),
    createdAt: createdAt ? new Date(createdAt) : m.importedAt,
    updatedAt: updatedAt ? new Date(updatedAt) : m.importedAt,
  } satisfies Partial<NoteInsert>;
}

type Warn = (w: string) => void;

/**
 * Notes privées de la salle (`Notes/{r}/{clé}/{id}`) et leur auteur. Comme loadNotes, un même
 * id lu sous l'id du personnage et sous l'ancien chemin par nom n'apparaît qu'une fois
 * (celui de l'id d'abord).
 */
function privateNotesOf(code: string, privateDocs: FirestoreDoc[], m: NotesMappings) {
  return privateDocs
    .map((d) => ({ d, parts: d.path.split('/') }))
    .filter(({ parts }) => parts.length === 4 && parts[0] === 'Notes' && parts[1] === code)
    .map(({ d, parts }) => ({ d, key: parts[2]!, author: resolveAuthor(code, parts[2]!, m) }))
    .sort(
      (a, b) =>
        Number(typeof b.author !== 'string' && b.author.byId) -
        Number(typeof a.author !== 'string' && a.author.byId),
    );
}

/** Notes privées migrées ; ignorées : auteur introuvable, ou doublon d'un ancien chemin. */
function migratePrivateNotes(
  code: string,
  privateDocs: FirestoreDoc[],
  m: NotesMappings,
  warnings: string[],
): { notes: NoteInsert[]; skipped: number } {
  const notes: NoteInsert[] = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const { d, author } of privateNotesOf(code, privateDocs, m)) {
    const warn: Warn = (w) => warnings.push(`${d.path} : ${w}`);
    if (typeof author === 'string') {
      warn(`${author}, ignorée`);
      skipped++;
      continue;
    }
    const dedupe = `${author.ownerId}/${d.id}`;
    if (seen.has(dedupe)) {
      warn('déjà lue sous un autre chemin du même auteur, ignorée');
      skipped++;
      continue;
    }
    seen.add(dedupe);
    notes.push({
      id: legacyUuid(d.path),
      campaignId: m.campaignId,
      ownerUserId: author.ownerId,
      characterId: author.characterId,
      shared: false,
      sharedWith: null,
      ...fields(d.data ?? {}, m, warn),
    });
  }
  return { notes, skipped };
}

/** Auteur d'une note partagée ; introuvable : attribuée au MJ. */
function sharedAuthor(code: string, data: Data, m: NotesMappings, warn: Warn): Author {
  const createdBy = str(data.createdBy)?.trim();
  const author = createdBy ? resolveAuthor(code, createdBy, m) : undefined;
  if (typeof author !== 'string' && author) return author;
  warn(`${author ?? 'sans auteur'} : attribuée au MJ`);
  return { ownerId: m.gmId, characterId: null, byId: false };
}

/** Destinataires d'une note partagée engagés dans la campagne ; null : toute la campagne. */
function sharedWithOf(code: string, data: Data, m: NotesMappings, warn: Warn): string[] | null {
  if (!Array.isArray(data.sharedWith)) return null;
  const keys = data.sharedWith.filter((x): x is string => typeof x === 'string');
  const sharedWith = [
    ...new Set(keys.map((k) => shareTarget(code, k, m)).filter((x) => !!x)),
  ] as string[];
  const lost = keys.length - sharedWith.length;
  if (lost) warn(`${lost} destinataire(s) non engagé(s) dans la campagne : retiré(s)`);
  if (!sharedWith.length) warn('aucun destinataire retrouvé : lisible par son auteur seul');
  return sharedWith.slice(0, LIMITS.sharedWith);
}

/**
 * Notes d'une salle. `privateDocs` : `Notes/{r}/…` ; `sharedDocs` :
 * `SharedNotes/{r}/…` (autres chemins ignorés).
 */
export function transformNotes(
  code: string,
  privateDocs: FirestoreDoc[],
  sharedDocs: FirestoreDoc[],
  m: NotesMappings,
): MigratedNotes {
  const warnings: string[] = [];
  const { notes: out, skipped } = migratePrivateNotes(code, privateDocs, m, warnings);

  for (const d of sharedDocs) {
    const parts = d.path.split('/');
    if (parts.length !== 4 || parts[0] !== 'SharedNotes' || parts[1] !== code) continue;
    const warn: Warn = (w) => warnings.push(`${d.path} : ${w}`);
    const data = d.data ?? {};
    const author = sharedAuthor(code, data, m, warn);
    out.push({
      id: legacyUuid(d.path),
      campaignId: m.campaignId,
      ownerUserId: author.ownerId,
      characterId: author.characterId,
      shared: true,
      sharedWith: sharedWithOf(code, data, m, warn),
      ...fields(data, m, warn),
    });
  }

  return { notes: out, skipped, warnings };
}
