/**
 * Migration d'une campagne de l'ancienne app. Fonction pure : aucun accès à la
 * base ; les UID Firebase et les chemins des personnages restent tels quels,
 * ils sont traduits au chargement (voir `prepareCampaign`).
 *
 * Tout ce qui ne peut pas être migré, ou dont la valeur change, devient un
 * avertissement, jamais une exception.
 *
 * Rôles :
 *   - le créateur (`creatorId`) est MJ (`gm`) et propriétaire ;
 *   - un membre entré comme MJ (`salles/{code}/Noms/{uid}.nom` = « MJ ») est
 *     importé joueur (décision du propriétaire : seul le créateur est MJ, il
 *     promeut ensuite qui il veut) ;
 *   - les autres membres sont joueurs (`player`) ; un banni n'est pas membre.
 * Personnage incarné : `users/{uid}.persoId` si la campagne est la campagne
 * active du joueur, sinon le personnage de la campagne dont le nom est dans `Noms`.
 * Camp : `players` pour un personnage de type « joueurs », `enemies` sinon.
 */
import type { Role, Side } from '../db/schema.js';
import { CAMPAIGN_CODE_FORMAT } from '../modules/campaigns/code.js';
import type { CampaignToImport } from './grouping.js';
import {
  GM_NAME,
  slug,
  toBoolean,
  toIsoDate,
  toNumber,
  toText,
  type FirestoreDoc,
  type LegacyCharacter,
} from './legacy.js';

export const MIGRATED_SYSTEMS = ['dnd-classic', 'star-wars-eote', 'nooblies'] as const;
export type MigratedSystemId = (typeof MIGRATED_SYSTEMS)[number];

/** Bornes de l'API (modules/schemas.ts et contraintes de la base). */
export const LIMITS = {
  name: 100,
  description: 2000,
  maxPlayers: { min: 1, max: 50, default: 4 },
  imageUrl: 2048,
  message: 1000,
} as const;

export interface MigratedMember {
  uid: string;
  role: Role;
  /** Chemin legacy du personnage incarné (`cartes/{code}/characters/{id}`). */
  plays?: string;
}

export interface MigratedCampaign {
  /** Code de la campagne, ou `null` si l'ancien ne respecte pas la forme (nouveau code au chargement). */
  code: string | null;
  name: string;
  description: string;
  systemId: MigratedSystemId;
  imageUrl: string | null;
  maxPlayers: number;
  isPublic: boolean;
  characterCreation: boolean;
  /** UID Firebase du créateur. */
  ownerUid?: string;
  members: MigratedMember[];
  /** UID Firebase des bannis. */
  bans: string[];
  characters: { legacyId: string; name?: string; side: Side }[];
  sessions: { scheduledAt: string }[];
  /** Du plus ancien au plus récent. */
  messages: { authorUid: string; body: string; createdAt: string }[];
  warnings: string[];
}

// ─── Détection du système ────────────────────────────────────────────────────
// Même logique que l'import des personnages (backend/character/src/import/transformer.ts),
// pour que la campagne et ses personnages tombent sur le même système.

const STAR_WARS_FIELDS = [
  'skillRanks',
  'career',
  'specializations',
  'unlockedTalents',
  'xpSpent',
  'Obligations',
  'vigueur',
  'agilite',
];

/** Système d'un personnage legacy, comme `detecterSysteme` de character. */
export function detectSystem(
  c: LegacyCharacter,
  campaign: { gameSystemId?: string; systemName?: string } = {},
): { id: MigratedSystemId; certain: boolean } {
  if (campaign.gameSystemId === 'dnd-classic') return { id: 'dnd-classic', certain: true };
  const name = slug(campaign.systemName ?? '');
  if (/star-wars|confins-de-l-empire|edge-of-the-empire/.test(name))
    return { id: 'star-wars-eote', certain: true };
  if (/noobli/.test(name)) return { id: 'nooblies', certain: true };
  if (STAR_WARS_FIELDS.some((f) => c[f] !== undefined))
    return { id: 'star-wars-eote', certain: true };
  if (Object.keys(c).some((f) => /^Voie\d+$/.test(f) && toText(c[f])))
    return { id: 'dnd-classic', certain: true };
  return { id: 'dnd-classic', certain: false };
}

/**
 * Système d'une campagne : celui qu'elle désigne (`gameSystemId`, nom du
 * système), sinon celui de ses personnages (le plus fréquent). Une campagne
 * sans `gameSystemId` date d'avant les systèmes : D&D, sauf si ses personnages
 * disent autre chose.
 */
export function campaignSystem(
  campaign: { gameSystemId?: string; systemName?: string },
  characters: readonly FirestoreDoc<LegacyCharacter>[],
): { id: MigratedSystemId; certain: boolean } {
  const declared = detectSystem({}, campaign);
  if (declared.certain) return declared;
  const votes = new Map<MigratedSystemId, number>();
  for (const c of characters) {
    const d = detectSystem(c.data ?? {});
    if (d.certain) votes.set(d.id, (votes.get(d.id) ?? 0) + 1);
  }
  const ranked = [...votes].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) return { id: 'dnd-classic', certain: !campaign.gameSystemId };
  return { id: ranked[0]![0], certain: ranked.length === 1 };
}

// ─── Campagne ────────────────────────────────────────────────────────────────

const FIREBASE_HOSTING = /firebasestorage\.googleapis\.com|\.appspot\.com|storage\.googleapis\.com/;

function truncate(v: string, max: number, what: string, warn: (m: string) => void): string {
  const chars = [...v];
  if (chars.length <= max) return v;
  warn(`${what} tronqué(e) à ${max} caractères (${chars.length})`);
  return chars.slice(0, max).join('').trimEnd();
}

export function transformCampaign(a: CampaignToImport): MigratedCampaign {
  const warnings: string[] = [];
  const warn = (m: string) => warnings.push(m);
  const s = a.doc.data ?? {};

  // Code : les codes à 6 chiffres de l'ancienne app sont repris tels quels
  const legacyCode = a.code.trim().toUpperCase();
  const code = CAMPAIGN_CODE_FORMAT.test(legacyCode) ? legacyCode : null;
  if (!code) warn(`Code « ${a.code} » hors forme : un nouveau code sera tiré`);

  // Nom, description
  let name = toText(s.title);
  if (!name) {
    name = `Campagne ${a.code}`;
    warn(`Campagne sans titre : nommée « ${name} »`);
  }
  name = truncate(name, LIMITS.name, 'Titre', warn);
  const description = truncate(
    toText(s.description) ?? '',
    LIMITS.description,
    'Description',
    warn,
  );

  // Système
  const system = campaignSystem(a.system, a.characters);
  if (!system.certain) {
    const source = a.system.gameSystemId
      ? `système « ${a.system.systemName ?? a.system.gameSystemId} » non reconnu`
      : 'campagne sans système';
    warn(`Système deviné (${source}) : ${system.id}`);
  }

  // Image : l'URL Firebase Storage est recopiée dans le stockage par l'import (cli.ts)
  let imageUrl = toText(s.imageUrl) ?? null;
  if (imageUrl && imageUrl.length > LIMITS.imageUrl) {
    warn(`Image ignorée : URL de plus de ${LIMITS.imageUrl} caractères`);
    imageUrl = null;
  } else if (imageUrl && FIREBASE_HOSTING.test(imageUrl)) {
    warn('Image sur Firebase Storage : recopiée dans le stockage à l’import');
  }

  // Joueurs au plus
  const raw = toNumber(s.maxPlayers);
  let maxPlayers: number = LIMITS.maxPlayers.default;
  if (raw === undefined) {
    if (s.maxPlayers !== undefined) warn(`maxPlayers illisible (${String(s.maxPlayers)}) : 4`);
  } else {
    maxPlayers = Math.min(LIMITS.maxPlayers.max, Math.max(LIMITS.maxPlayers.min, Math.trunc(raw)));
    if (maxPlayers !== raw) warn(`maxPlayers ${raw} ramené à ${maxPlayers}`);
  }

  // Bannis, membres et rôles
  const ownerUid = toText(s.creatorId);
  if (!ownerUid) warn('Campagne sans créateur');
  const bannedList = (Array.isArray(s.bannedUsers) ? s.bannedUsers : []).map(toText);
  const bans = [...new Set(bannedList)].filter((uid): uid is string => !!uid && uid !== ownerUid);
  if (ownerUid && bannedList.includes(ownerUid))
    warn('Le créateur figurait parmi les bannis : bannissement ignoré');

  const charactersById = new Map(a.characters.map((c) => [c.id, c]));
  const charactersByName = new Map<string, FirestoreDoc<LegacyCharacter>[]>();
  for (const c of a.characters) {
    const n = toText(c.data?.Nomperso);
    if (n) charactersByName.set(n, [...(charactersByName.get(n) ?? []), c]);
  }

  const members: MigratedMember[] = [];
  for (const m of a.members) {
    if (bans.includes(m.uid)) {
      warn(`Membre ${m.uid} banni : importé comme banni seulement`);
      continue;
    }
    let role: Role = 'player';
    if (m.uid === ownerUid) role = 'gm';
    else if (m.name === GM_NAME) {
      warn(`Membre ${m.uid} entré comme MJ : importé joueur (le créateur peut le promouvoir)`);
    }
    members.push({ uid: m.uid, role });
  }

  // Personnage incarné : persoId d'abord (plus sûr qu'un nom), puis Noms
  const played = new Set<string>();
  const play = (uid: string, c: FirestoreDoc<LegacyCharacter>, source: string) => {
    const member = members.find((x) => x.uid === uid);
    if (!member || member.plays) return;
    if (played.has(c.path)) {
      warn(`${c.path} déjà incarné : ignoré pour ${uid} (${source})`);
      return;
    }
    member.plays = c.path;
    played.add(c.path);
  };
  for (const m of a.members) {
    const c = m.persoId ? charactersById.get(m.persoId) : undefined;
    if (m.persoId && !c) warn(`persoId ${m.persoId} de ${m.uid} absent de la campagne`);
    if (c) play(m.uid, c, 'persoId');
  }
  for (const m of a.members) {
    if (!m.name || m.name === GM_NAME || members.find((x) => x.uid === m.uid)?.plays) continue;
    const candidates = charactersByName.get(m.name) ?? [];
    if (candidates.length === 1) play(m.uid, candidates[0]!, 'Noms');
    else if (candidates.length > 1)
      warn(
        `« ${m.name} » joué par ${m.uid} : ${candidates.length} personnages de ce nom, aucun incarné`,
      );
    else if (!m.persoId) warn(`« ${m.name} » joué par ${m.uid} : personnage introuvable`);
  }

  // Personnages engagés
  const characters = a.characters.map((c) => ({
    legacyId: c.path,
    ...(toText(c.data?.Nomperso) ? { name: toText(c.data?.Nomperso)! } : {}),
    side: (toText(c.data?.type) === 'joueurs' ? 'players' : 'enemies') as Side,
  }));

  // Sessions prévues
  const sessions: MigratedCampaign['sessions'] = [];
  for (const d of a.sessions) {
    const scheduledAt = toIsoDate(d.data?.date);
    if (scheduledAt) sessions.push({ scheduledAt });
    else warn(`Session ${d.id} sans date lisible : ignorée`);
  }
  sessions.sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt));

  // Discussion : l'ancienne app n'affichait que les messages avec un texte
  const messages: MigratedCampaign['messages'] = [];
  let truncated = 0;
  for (const d of a.messages) {
    const m = d.data ?? {};
    let body = toText(m.text);
    if (!body) continue;
    const authorUid = toText(m.uid);
    const createdAt = toIsoDate(m.timestamp);
    if (!authorUid || !createdAt) {
      warn(`Message ${d.id} sans ${authorUid ? 'date' : 'auteur'} : ignoré`);
      continue;
    }
    if ([...body].length > LIMITS.message) {
      body = [...body].slice(0, LIMITS.message).join('');
      truncated++;
    }
    messages.push({ authorUid, body, createdAt });
  }
  if (truncated) warn(`${truncated} message(s) tronqué(s) à ${LIMITS.message} caractères`);
  messages.sort((x, y) => x.createdAt.localeCompare(y.createdAt));

  return {
    code,
    name,
    description,
    systemId: system.id,
    imageUrl,
    maxPlayers,
    isPublic: toBoolean(s.isPublic) ?? false,
    characterCreation: toBoolean(s.allowCharacterCreation) ?? true,
    ...(ownerUid ? { ownerUid } : {}),
    members,
    bans,
    characters,
    sessions,
    messages,
    warnings,
  };
}
