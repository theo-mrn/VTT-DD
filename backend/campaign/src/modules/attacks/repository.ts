/**
 * Attaques en base : une ligne `campaign_attacks`, ses cibles (`campaign_attack_targets`, dans
 * l'ordre de la déclaration) et ses applications (`campaign_attack_applications`).
 */
import { HttpError } from '@vtt/platform';
import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import {
  campaignAttackApplications,
  campaignAttacks,
  campaignAttackTargets,
  type AttackStatusValue,
} from '../../db/schema.js';

export type AttackRow = typeof campaignAttacks.$inferSelect;
export type AttackInsert = typeof campaignAttacks.$inferInsert;
export type TargetRow = typeof campaignAttackTargets.$inferSelect;
export type ApplicationRow = typeof campaignAttackApplications.$inferSelect;

export interface LoadedAttack {
  attack: AttackRow;
  /** Dans l'ordre de la déclaration. */
  targets: TargetRow[];
}

export const attackNotFound = () =>
  new HttpError(404, 'Ressource introuvable', 'attack_not_found', 'Attaque introuvable');

export const OPEN_STATUSES: AttackStatusValue[] = ['awaiting_reactions', 'awaiting_dice'];

async function withTargets(db: Db | Tx, attacks: AttackRow[]): Promise<LoadedAttack[]> {
  if (!attacks.length) return [];
  const targets = await db
    .select()
    .from(campaignAttackTargets)
    .where(
      inArray(
        campaignAttackTargets.attackId,
        attacks.map((a) => a.id),
      ),
    )
    .orderBy(asc(campaignAttackTargets.position));
  return attacks.map((attack) => ({
    attack,
    targets: targets.filter((t) => t.attackId === attack.id),
  }));
}

/** Une attaque de la campagne (verrouillée si `lock`), ou null. */
export async function loadAttack(
  db: Db | Tx,
  campaignId: string,
  attackId: string,
  lock = false,
): Promise<LoadedAttack | null> {
  const query = db
    .select()
    .from(campaignAttacks)
    .where(and(eq(campaignAttacks.id, attackId), eq(campaignAttacks.campaignId, campaignId)));
  const [attack] = lock ? await query.for('update') : await query;
  if (!attack) return null;
  return (await withTargets(db, [attack]))[0]!;
}

/** Attaques verrouillées dans l'ordre des identifiants (pas d'interblocage entre deux lots). */
export async function lockAttacks(
  tx: Tx,
  campaignId: string,
  ids: string[],
): Promise<LoadedAttack[]> {
  if (!ids.length) return [];
  const rows = await tx
    .select()
    .from(campaignAttacks)
    .where(and(eq(campaignAttacks.campaignId, campaignId), inArray(campaignAttacks.id, ids)))
    .orderBy(asc(campaignAttacks.id))
    .for('update');
  return withTargets(tx, rows);
}

/** Attaques d'un combat dans ces statuts (verrouillées). */
export async function lockAttacksOfCombat(
  tx: Tx,
  campaignId: string,
  combatId: string,
  statuses: AttackStatusValue[],
): Promise<LoadedAttack[]> {
  const rows = await tx
    .select()
    .from(campaignAttacks)
    .where(
      and(
        eq(campaignAttacks.campaignId, campaignId),
        eq(campaignAttacks.combatId, combatId),
        inArray(campaignAttacks.status, statuses),
      ),
    )
    .orderBy(asc(campaignAttacks.id))
    .for('update');
  return withTargets(tx, rows);
}

/** Déclarations déjà faites avec ces clés d'idempotence par cet auteur, dans leur ordre. */
export async function findByKeys(
  db: Db | Tx,
  campaignId: string,
  userId: string,
  keys: string[],
): Promise<LoadedAttack[]> {
  const rows = await db
    .select()
    .from(campaignAttacks)
    .where(
      and(
        eq(campaignAttacks.campaignId, campaignId),
        eq(campaignAttacks.createdBy, userId),
        inArray(campaignAttacks.idempotencyKey, keys),
      ),
    );
  const loaded = await withTargets(db, rows);
  return keys.flatMap((k) => loaded.filter((l) => l.attack.idempotencyKey === k));
}

export async function insertAttack(
  tx: Tx,
  attack: AttackInsert,
  targets: Omit<TargetRow, 'attackId'>[],
): Promise<LoadedAttack> {
  const [row] = await tx.insert(campaignAttacks).values(attack).returning();
  const rows = await tx
    .insert(campaignAttackTargets)
    .values(targets.map((t) => ({ ...t, attackId: row!.id })))
    .returning();
  return { attack: row!, targets: rows.sort((a, b) => a.position - b.position) };
}

/**
 * Enregistre une attaque modifiée (version + 1) et ses cibles changées ; `targets` : l'état
 * voulu de chaque cible (identifiée par son personnage).
 */
export async function saveAttack(
  tx: Tx,
  loaded: LoadedAttack,
  change: Partial<Omit<AttackRow, 'id' | 'campaignId' | 'version'>>,
  targets: TargetRow[] = loaded.targets,
): Promise<LoadedAttack> {
  const [attack] = await tx
    .update(campaignAttacks)
    .set({ ...change, version: loaded.attack.version + 1, updatedAt: sql`now()` })
    .where(eq(campaignAttacks.id, loaded.attack.id))
    .returning();
  const byId = new Map(loaded.targets.map((t) => [t.characterId, t]));
  for (const t of targets) {
    const before = byId.get(t.characterId);
    if (before && JSON.stringify(before) === JSON.stringify(t)) continue;
    const { attackId: _a, characterId: _c, position: _p, ...fields } = t;
    await tx
      .update(campaignAttackTargets)
      .set(fields)
      .where(
        and(
          eq(campaignAttackTargets.attackId, loaded.attack.id),
          eq(campaignAttackTargets.characterId, t.characterId),
        ),
      );
  }
  return { attack: attack!, targets };
}

export interface AttackFilter {
  status?: 'open' | 'pending' | 'decided' | 'all';
  combatId?: string;
  attackerId?: string;
  before?: string;
  limit: number;
  /** Joueur : seulement ses attaques (auteur ou attaquant incarné) et celles où l'une de ses
   * cibles doit réagir. Absent : toutes (MJ). */
  player?: { userId: string; played: string[] };
}

const STATUS_FILTER: Record<string, AttackStatusValue[]> = {
  open: OPEN_STATUSES,
  pending: ['pending'],
  decided: ['applied', 'dismissed'],
};

/** Page d'attaques, les plus récentes d'abord (une de plus pour `hasMore`). */
export async function listAttacks(
  db: Db,
  campaignId: string,
  f: AttackFilter,
): Promise<{ attacks: LoadedAttack[]; hasMore: boolean }> {
  const where: (SQL | undefined)[] = [eq(campaignAttacks.campaignId, campaignId)];
  const statuses = f.status ? STATUS_FILTER[f.status] : undefined;
  if (statuses) where.push(inArray(campaignAttacks.status, statuses));
  if (f.combatId) where.push(eq(campaignAttacks.combatId, f.combatId));
  if (f.attackerId) where.push(eq(campaignAttacks.attackerId, f.attackerId));
  if (f.before) where.push(lt(campaignAttacks.id, f.before));
  if (f.player) {
    const { userId, played } = f.player;
    const mine = played.length
      ? or(eq(campaignAttacks.createdBy, userId), inArray(campaignAttacks.attackerId, played))
      : eq(campaignAttacks.createdBy, userId);
    const reacting = played.length
      ? and(
          inArray(campaignAttacks.status, OPEN_STATUSES),
          sql`exists (select 1 from ${campaignAttackTargets} t
                       where t.attack_id = ${campaignAttacks.id}
                         and t.character_id in (${sql.join(
                           played.map((id) => sql`${id}::uuid`),
                           sql`, `,
                         )})
                         and jsonb_array_length(t.reaction_params) > 0)`,
        )
      : undefined;
    where.push(reacting ? or(mine, reacting) : mine);
  }
  const rows = await db
    .select()
    .from(campaignAttacks)
    .where(and(...where))
    .orderBy(desc(campaignAttacks.id))
    .limit(f.limit + 1);
  const page = rows.slice(0, f.limit);
  return { attacks: await withTargets(db, page), hasMore: rows.length > f.limit };
}

// ─── Applications ────────────────────────────────────────────────────────────

export async function applicationsOf(db: Db | Tx, attackIds: string[]): Promise<ApplicationRow[]> {
  if (!attackIds.length) return [];
  return db
    .select()
    .from(campaignAttackApplications)
    .where(inArray(campaignAttackApplications.attackId, attackIds))
    .orderBy(asc(campaignAttackApplications.id));
}

export async function insertApplication(
  tx: Tx,
  row: typeof campaignAttackApplications.$inferInsert,
): Promise<ApplicationRow> {
  const [inserted] = await tx.insert(campaignAttackApplications).values(row).returning();
  return inserted!;
}

export async function updateApplication(
  tx: Tx,
  id: string,
  change: Partial<Omit<ApplicationRow, 'id'>>,
) {
  await tx
    .update(campaignAttackApplications)
    .set(change)
    .where(eq(campaignAttackApplications.id, id));
}

export async function deleteApplications(db: Db | Tx, ids: string[]) {
  if (ids.length)
    await db.delete(campaignAttackApplications).where(inArray(campaignAttackApplications.id, ids));
}
