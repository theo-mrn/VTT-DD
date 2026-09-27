/**
 * Rattachement des événements de l'ancien Historique aux campagnes (campaign),
 * comptes (identity) et personnages (character) déjà migrés, puis ajout au
 * journal par le même chemin que le bus (appendEvents : dédoublonnage, rang,
 * chaîne de hash). Rejouable : un événement déjà importé (même UUIDv5, inbox)
 * est écarté.
 *
 * Les événements d'une campagne sont ajoutés dans l'ordre chronologique : leur
 * rang suit donc la date. Si la campagne avait déjà des événements (bus), ceux
 * importés sont ajoutés à la suite (le rapport le signale).
 */
import type { EventEnvelope } from '@vtt/contracts';
import { and, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { campaignHeads, inbox } from '../db/schema.js';
import { appendEvents, dbErrorCode } from '../journal/append.js';
import type { ImportedEvent } from './transform.js';

export type MemberRole = 'gm' | 'player' | 'spectator';

export interface Mappings {
  /** UID Firebase → compte identity. */
  accounts: ReadonlyMap<string, string>;
  /** Code de campagne (`Salle/{code}`) → campagne importée. */
  campaigns: ReadonlyMap<string, string>;
  /** `cartes/{code}/characters/{id}` → personnage importé. */
  characters: ReadonlyMap<string, string>;
  /** `${campaignId}:${userId}` → rôle du membre (auteur d'un événement privé). */
  roles: ReadonlyMap<string, MemberRole>;
}

export type PreparedEvent =
  | {
      status: 'ready';
      envelope: EventEnvelope;
      /** Événement privé dont le destinataire a un compte migré (sinon : MJ seul). */
      ownerFound: boolean;
      characterFound: boolean;
    }
  | { status: 'no-campaign' };

/** Corrélation commune à tous les événements importés. */
export const IMPORT_CORRELATION = 'import:firebase:historique';

export function prepareEvent(e: ImportedEvent, maps: Mappings): PreparedEvent {
  const campaignId = maps.campaigns.get(e.campaignCode);
  if (!campaignId) return { status: 'no-campaign' };
  const ownerId = e.targetUid ? (maps.accounts.get(e.targetUid) ?? null) : null;
  const characterId = e.characterLegacyId
    ? (maps.characters.get(`cartes/${e.campaignCode}/characters/${e.characterLegacyId}`) ?? null)
    : null;
  return {
    status: 'ready',
    ownerFound: !e.targetUid || !!ownerId,
    characterFound: !e.characterLegacyId || !!characterId,
    envelope: {
      id: e.id,
      type: e.type,
      version: 1,
      occurredAt: e.occurredAt.toISOString(),
      roomId: campaignId,
      // L'ancienne app n'enregistrait pas l'auteur, seulement le destinataire d'un
      // événement privé (l'auteur de la note) : sinon, l'import est l'auteur
      actor: ownerId
        ? {
            userId: ownerId,
            role: maps.roles.get(`${campaignId}:${ownerId}`) === 'gm' ? 'gm' : 'player',
            characterId: null,
          }
        : { userId: null, role: 'system', characterId: null },
      aggregate: characterId
        ? { type: 'character', id: characterId }
        : { type: 'campaign', id: campaignId },
      // Privé : son destinataire et le MJ ; sans compte migré, le MJ seul
      visibility: e.targetUid ? 'owner' : 'public',
      payload: e.payload,
      correlationId: IMPORT_CORRELATION,
      causationId: null,
      traceparent: null,
    },
  };
}

/** Événements déjà dans le journal parmi `ids`. */
export async function alreadyImported(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const found = await db
    .select({ id: inbox.eventId })
    .from(inbox)
    .where(inArray(inbox.eventId, ids));
  return new Set(found.map((x) => x.id));
}

/** Campagnes dont le journal contient déjà des événements du bus (hors import). */
export async function campaignsWithLiveEvents(db: Db, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set();
  const found = await db
    .select({ id: campaignHeads.campaignId })
    .from(campaignHeads)
    .where(
      and(
        inArray(campaignHeads.campaignId, ids),
        sql`exists (select 1 from history.events e where e.campaign_id = ${campaignHeads.campaignId}
                    and not starts_with(e.type, 'legacy.'))`,
      ),
    );
  return new Set(found.map((x) => x.id));
}

/**
 * Ajoute les événements d'une campagne, déjà triés, par lots (une transaction
 * par lot). Au premier lot en échec, la campagne s'arrête là : les suivants
 * garderaient sinon un rang antérieur à des événements plus anciens. Relancer
 * l'import reprend où il s'est arrêté.
 */
export async function importCampaign(
  db: Db,
  sorted: EventEnvelope[],
  batchSize = 500,
): Promise<{ imported: number; duplicates: number; error?: string }> {
  let imported = 0;
  let duplicates = 0;
  for (let i = 0; i < sorted.length; i += batchSize) {
    try {
      const results = await appendEvents(db, sorted.slice(i, i + batchSize), 'import');
      for (const r of results) {
        if (r.status === 'appended') imported++;
        else duplicates++;
      }
    } catch (err) {
      // Code SQLSTATE seul : le message de Drizzle cite les paramètres (contenus)
      const code = dbErrorCode(err) ?? 'erreur';
      return { imported, duplicates, error: `lot ${i / batchSize + 1} refusé (${code})` };
    }
  }
  return { imported, duplicates };
}

/** Ordre d'import : date, puis chemin Firestore (départage stable). */
export function chronological(
  a: { occurredAt: Date; legacyId: string },
  b: { occurredAt: Date; legacyId: string },
): number {
  return a.occurredAt.getTime() - b.occurredAt.getTime() || a.legacyId.localeCompare(b.legacyId);
}
