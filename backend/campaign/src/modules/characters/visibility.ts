/**
 * Engagements (personnages de la campagne) qu'un membre peut connaître : la même règle pour
 * la liste des personnages (`GET …/characters`) et le détail de la campagne
 * (`GET /v1/campaigns/:id`). Le MJ les voit tous ; un joueur ou un spectateur, le camp des
 * joueurs, ses propres personnages (possédés ou incarnés) et les PNJ dont un token lui est
 * visible (filtre de la carte) : ni l'identifiant, ni le camp, ni le nom d'un PNJ caché ne
 * fuient.
 */
import { and, eq, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { campaignCharacters, maps, mapTokens } from '../../db/schema.js';
import type { Access } from '../campaigns/repository.js';
import { canSeeMap, viewerOf } from '../maps/common.js';
import { visibleTokenIds } from '../maps/tokens.js';

export type Engagement = typeof campaignCharacters.$inferSelect;

/**
 * PNJ (hors camp des joueurs, hors personnages de l'appelant) dont un token est visible de
 * ce joueur, sur une carte qu'il voit. Le filtre est celui de la carte (`canSeeMap`,
 * `visibleTokenIds`) : la liste ne nomme jamais un PNJ que la carte lui cache.
 */
async function npcsSeenBy(
  db: Db,
  a: Access,
  userId: string,
  candidates: readonly Engagement[],
): Promise<Set<string>> {
  const seen = new Set<string>();
  if (!candidates.length) return seen;
  const tokens = await db
    .select({ id: mapTokens.id, mapId: mapTokens.mapId, characterId: mapTokens.characterId })
    .from(mapTokens)
    .where(
      and(
        eq(mapTokens.campaignId, a.campaign.id),
        eq(mapTokens.present, true),
        inArray(
          mapTokens.characterId,
          candidates.map((c) => c.characterId),
        ),
      ),
    );
  if (!tokens.length) return seen;
  const v = await viewerOf(db, a.campaign.id, userId);
  const mapIds = [...new Set(tokens.map((t) => t.mapId))];
  const rows = await db.select().from(maps).where(inArray(maps.id, mapIds));
  for (const map of rows) {
    if (!(await canSeeMap(db, v, map))) continue;
    const visible = await visibleTokenIds(db, v, map.id);
    for (const t of tokens)
      if (t.mapId === map.id && (!visible || visible.has(t.id))) seen.add(t.characterId);
  }
  return seen;
}

/** Engagements que l'appelant peut connaître (voir l'en-tête), dans leur ordre. */
export async function visibleEngagements<E extends Engagement>(
  db: Db,
  a: Pick<Access, 'campaign' | 'role'>,
  userId: string,
  engagements: E[],
): Promise<E[]> {
  if (a.role === 'gm') return engagements;
  const known = (e: Engagement) =>
    e.side === 'players' || e.ownerId === userId || e.playedBy === userId;
  const seen = await npcsSeenBy(
    db,
    a as Access,
    userId,
    engagements.filter((e) => !known(e)),
  );
  return engagements.filter((e) => known(e) || seen.has(e.characterId));
}
