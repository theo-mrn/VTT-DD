/**
 * Chargement des campagnes migrées dans la base du service.
 *
 * `prepareCampaign` (pure) traduit les UID Firebase en comptes migrés
 * (identity.legacy_ids) et les chemins des personnages en personnages importés
 * (characters.legacy_ids) ; ce qui n'a pas de correspondance est écarté avec un
 * avertissement. `loadCampaign` écrit ensuite la campagne dans une transaction
 * avec son événement `campaign.created` (acteur système). Rejouable : une
 * campagne déjà importée (même chemin legacy dans `legacy_ids`) est ignorée.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import {
  campaignBans,
  campaignCharacters,
  campaignMembers,
  campaignMessages,
  campaigns,
  campaignSessions,
  legacyIds,
  type Role,
  type Side,
} from '../db/schema.js';
import { newCampaignCode } from '../modules/campaigns/code.js';
import type { MigratedCampaign } from './transform.js';

export const LEGACY_SOURCE = 'firebase';

/** Personnage importé par character, retrouvé par son chemin legacy. */
export interface ImportedCharacter {
  id: string;
  ownerId: string;
  systemId: string;
}

export interface Mappings {
  /** UID Firebase → compte migré. */
  accounts: ReadonlyMap<string, string>;
  /** `cartes/{code}/characters/{id}` → personnage importé. */
  characters: ReadonlyMap<string, ImportedCharacter>;
}

/** Lignes à écrire pour une campagne, identifiants traduits. */
export interface PreparedCampaign {
  campaign: Omit<typeof campaigns.$inferInsert, 'id' | 'code'> & { code: string | null };
  members: { userId: string; role: Role }[];
  bans: string[];
  characters: {
    characterId: string;
    ownerId: string;
    side: Side;
    playedBy: string | null;
  }[];
  sessions: { scheduledAt: Date }[];
  messages: { authorId: string; body: string; createdAt: Date }[];
}

export type Preparation =
  | { status: 'ready'; campaign: PreparedCampaign; warnings: string[] }
  | { status: 'no-account'; warnings: string[] };

type Warn = (w: string) => void;
/** Compte migré d'un UID Firebase. */
type AccountOf = (uid: string | undefined) => string | undefined;
type EngagedRow = PreparedCampaign['characters'][number];

/** Propriétaire : le créateur, à défaut un autre MJ avec un compte migré ; null sans l'un ni l'autre. */
function ownerOf(m: MigratedCampaign, account: AccountOf, warn: Warn): string | null {
  const owner = account(m.ownerUid);
  if (owner) return owner;
  const fallback = m.members.find((x) => x.role === 'gm' && account(x.uid));
  if (!fallback) {
    warn(`Créateur ${m.ownerUid ?? '(inconnu)'} sans compte migré : campagne ignorée`);
    return null;
  }
  warn(
    `Créateur ${m.ownerUid ?? '(inconnu)'} sans compte migré : campagne confiée à ${fallback.uid}`,
  );
  return account(fallback.uid)!;
}

/** Membres (le propriétaire est toujours MJ), et compte de chaque membre retenu. */
function membersOf(
  m: MigratedCampaign,
  owner: string,
  account: AccountOf,
  warn: Warn,
): { members: Map<string, Role>; accountOf: Map<string, string> } {
  const members = new Map<string, Role>([[owner, 'gm']]);
  const accountOf = new Map<string, string>(); // uid → compte, membres retenus
  for (const x of m.members) {
    const id = account(x.uid);
    if (!id) {
      warn(`Membre ${x.uid} sans compte migré : ignoré`);
      continue;
    }
    accountOf.set(x.uid, id);
    if (!members.has(id)) members.set(id, x.role);
  }
  return { members, accountOf };
}

/** Bannis avec un compte migré, hors membres. */
function bansOf(
  m: MigratedCampaign,
  members: Map<string, Role>,
  account: AccountOf,
  warn: Warn,
): string[] {
  const bans: string[] = [];
  for (const uid of m.bans) {
    const id = account(uid);
    if (!id) warn(`Banni ${uid} sans compte migré : ignoré`);
    else if (!members.has(id) && !bans.includes(id)) bans.push(id);
  }
  return bans;
}

/** Personnages engagés, du système de la campagne : chemin legacy → ligne. */
function engagedOf(m: MigratedCampaign, maps: Mappings, warn: Warn): Map<string, EngagedRow> {
  const engaged = new Map<string, EngagedRow>();
  for (const c of m.characters) {
    const imported = maps.characters.get(c.legacyId);
    const label = c.name ? `« ${c.name} » (${c.legacyId})` : c.legacyId;
    if (!imported) {
      warn(`Personnage non importé : ${label}`);
      continue;
    }
    if (imported.systemId !== m.systemId) {
      warn(
        `Personnage ${label} du système ${imported.systemId}, campagne ${m.systemId} : non engagé`,
      );
      continue;
    }
    engaged.set(c.legacyId, {
      characterId: imported.id,
      ownerId: imported.ownerId,
      side: c.side,
      playedBy: null,
    });
  }
  return engaged;
}

/** Personnage incarné : engagé, et à soi pour un joueur (le MJ incarne n'importe lequel). */
function assignPlayed(
  m: MigratedCampaign,
  members: Map<string, Role>,
  accountOf: Map<string, string>,
  engaged: Map<string, EngagedRow>,
  warn: Warn,
): void {
  for (const x of m.members) {
    const id = accountOf.get(x.uid);
    if (!x.plays || !id) continue;
    const row = engaged.get(x.plays);
    const role = members.get(id)!;
    if (!row) warn(`${x.plays}, incarné par ${x.uid}, n'est pas engagé : non incarné`);
    else if (role !== 'gm' && row.ownerId !== id)
      warn(`${x.plays} appartient à un autre compte que ${x.uid} : non incarné`);
    else if ([...engaged.values()].some((r) => r.playedBy === id))
      warn(`${x.uid} incarne déjà un personnage : ${x.plays} non incarné`);
    else row.playedBy = id;
  }
}

/** Discussion : auteurs sans compte regroupés. */
function messagesOf(
  m: MigratedCampaign,
  account: AccountOf,
  warn: Warn,
): PreparedCampaign['messages'] {
  const messages: PreparedCampaign['messages'] = [];
  const withoutAuthor = new Map<string, number>();
  for (const msg of m.messages) {
    const authorId = account(msg.authorUid);
    if (authorId) messages.push({ authorId, body: msg.body, createdAt: new Date(msg.createdAt) });
    else withoutAuthor.set(msg.authorUid, (withoutAuthor.get(msg.authorUid) ?? 0) + 1);
  }
  for (const [uid, n] of withoutAuthor)
    warn(`${n} message(s) de ${uid} (sans compte migré) ignoré(s)`);
  return messages;
}

export function prepareCampaign(
  m: MigratedCampaign,
  maps: Mappings,
  systemVersion: string,
): Preparation {
  const warnings = [...m.warnings];
  const warn = (w: string) => warnings.push(w);
  const account: AccountOf = (uid) => (uid ? maps.accounts.get(uid) : undefined);

  const owner = ownerOf(m, account, warn);
  if (owner === null) return { status: 'no-account', warnings };
  const { members, accountOf } = membersOf(m, owner, account, warn);
  const bans = bansOf(m, members, account, warn);
  const engaged = engagedOf(m, maps, warn);
  assignPlayed(m, members, accountOf, engaged, warn);
  const messages = messagesOf(m, account, warn);

  return {
    status: 'ready',
    warnings,
    campaign: {
      campaign: {
        name: m.name,
        description: m.description,
        systemId: m.systemId,
        systemVersion,
        ownerId: owner,
        code: m.code,
        imageUrl: m.imageUrl,
        isPublic: m.isPublic,
        characterCreation: m.characterCreation,
      },
      members: [...members].map(([userId, role]) => ({ userId, role })),
      bans,
      characters: [...engaged.values()],
      sessions: m.sessions.map((s) => ({ scheduledAt: new Date(s.scheduledAt) })),
      messages,
    },
  };
}

export type LoadResult =
  | { status: 'imported'; id: string; code: string; warnings: string[] }
  | { status: 'already-imported'; id: string };

/** Campagne déjà importée sous ce chemin legacy, le cas échéant. */
export async function alreadyImported(db: Db, legacyId: string): Promise<string | undefined> {
  const [existing] = await db
    .select({ id: legacyIds.campaignId })
    .from(legacyIds)
    .where(and(eq(legacyIds.source, LEGACY_SOURCE), eq(legacyIds.legacyId, legacyId)));
  return existing?.id;
}

const CODE_ATTEMPTS = 5;
const BATCH = 500;

/** Insertions par paquets : une campagne peut avoir des milliers de messages. */
async function inBatches<T>(rows: T[], write: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await write(rows.slice(i, i + BATCH));
}

export async function loadCampaign(
  db: Db,
  p: PreparedCampaign,
  legacyId: string,
  correlationId: string,
): Promise<LoadResult> {
  const existing = await alreadyImported(db, legacyId);
  if (existing) return { status: 'already-imported', id: existing };

  const warnings: string[] = [];
  const id = uuidv7();
  const code = await db.transaction(async (tx) => {
    // Code legacy déjà pris (par une campagne créée depuis) : on en tire un autre
    let code: string | undefined;
    for (let attempt = 0; !code && attempt <= CODE_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 && p.campaign.code ? p.campaign.code : newCampaignCode();
      const [inserted] = await tx
        .insert(campaigns)
        .values({ ...p.campaign, id, code: candidate })
        .onConflictDoNothing({ target: campaigns.code })
        .returning({ code: campaigns.code });
      code = inserted?.code;
    }
    if (!code) throw new Error('Aucun code de campagne libre après plusieurs essais');
    if (p.campaign.code && code !== p.campaign.code)
      warnings.push(`Code ${p.campaign.code} déjà pris : nouveau code ${code}`);

    await tx.insert(campaignMembers).values(p.members.map((m) => ({ campaignId: id, ...m })));
    if (p.bans.length)
      await tx
        .insert(campaignBans)
        .values(p.bans.map((userId) => ({ campaignId: id, userId, bannedBy: p.campaign.ownerId })));
    await inBatches(p.characters, (batch) =>
      tx
        .insert(campaignCharacters)
        .values(batch.map((x) => ({ campaignId: id, ...x, addedBy: x.ownerId }))),
    );
    await inBatches(p.sessions, (batch) =>
      tx.insert(campaignSessions).values(
        batch.map((s) => ({
          id: uuidv7(s.scheduledAt.getTime()),
          campaignId: id,
          scheduledAt: s.scheduledAt,
          createdBy: p.campaign.ownerId,
        })),
      ),
    );
    // Id UUIDv7 à la date d'envoi : l'ordre de la discussion est conservé
    await inBatches(p.messages, (batch) =>
      tx
        .insert(campaignMessages)
        .values(batch.map((m) => ({ id: uuidv7(m.createdAt.getTime()), campaignId: id, ...m }))),
    );
    await tx.insert(legacyIds).values({ source: LEGACY_SOURCE, legacyId, campaignId: id });
    await appendEvent(
      tx,
      { correlationId },
      {
        type: 'campaign.created',
        campaignId: id,
        actor: { userId: null, role: 'system', characterId: null },
        aggregate: { type: 'campaign', id },
        payload: {
          name: p.campaign.name,
          code,
          isPublic: p.campaign.isPublic ?? false,
          system: { id: p.campaign.systemId, version: p.campaign.systemVersion },
          imported: true,
        },
      },
    );
    return code;
  });
  return { status: 'imported', id, code, warnings };
}
