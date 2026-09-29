/**
 * Portails reliés (aller-retour, docs/carte.md § 10, Portails) : crochets de la couche
 * `portals` (`layers.ts`), dans la transaction de chaque écriture.
 *
 * Deux portails reliés (`linkedPortalId`, symétrique) ont des destinations croisées : l'arrivée
 * de l'un est la place de l'autre, qu'ils soient sur la même carte (`same_map`) ou sur deux
 * scènes (`scene_change`). Le service tient ce lien, quel que soit le client :
 * - relier A à B aligne la destination de A sur B (`beforeWrite`), puis celle de B sur A et
 *   délie leurs anciens partenaires (`afterWrite`) ;
 * - déplacer A déplace l'arrivée de B ; déplacer l'arrivée de A déplace B ;
 * - changer la scène visée (ou la sorte) de A le délie de B ;
 * - supprimer A délie B, qui reste un portail à sens unique (`beforeDelete`).
 *
 * Un joueur ne reçoit jamais la destination d'un portail (`portalForPlayer`).
 */
import { HttpError } from '@vtt/platform';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/outbox.js';
import { mapPortals, maps, type MapPoint } from '../../db/schema.js';
import type { MapRow } from './common.js';
import type { LayerRow, SiblingWrite } from './layers.js';

type Input = Record<string, unknown>;
export type PortalRow = typeof mapPortals.$inferSelect;

const refused = (message: string, code: string) => new HttpError(422, 'Refusé', code, message);

const samePoint = (a: MapPoint | null | undefined, b: MapPoint | null | undefined) =>
  (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);

/** Portail de la campagne, verrouillé pour la transaction. */
export async function lockPortal(tx: Db | Tx, campaignId: string, id: string) {
  const [row] = await tx
    .select()
    .from(mapPortals)
    .where(and(eq(mapPortals.id, id), eq(mapPortals.campaignId, campaignId)))
    .for('update');
  return row ?? null;
}

/** Destination d'un portail posé sur `fromMapId` qui arrive à la place de `to`. */
const destinationTo = (to: Pick<PortalRow, 'mapId' | 'pos'>, fromMapId: string): Input =>
  to.mapId === fromMapId
    ? { kind: 'same_map', targetMapId: null, target: { ...to.pos } }
    : { kind: 'scene_change', targetMapId: to.mapId, target: { ...to.pos } };

/** Portail tel qu'un joueur le reçoit : ni destination, ni retour. */
export const portalForPlayer = (api: Input): Input => ({
  ...api,
  target: null,
  targetMapId: null,
  linkedPortalId: null,
});

/** Carte visée et retour : de la même campagne (422 sinon). */
export async function checkPortalTarget(db: Db | Tx, map: MapRow, input: Input) {
  if (typeof input.targetMapId === 'string') {
    const [target] = await db
      .select({ id: maps.id })
      .from(maps)
      .where(and(eq(maps.id, input.targetMapId), eq(maps.campaignId, map.campaignId)));
    if (!target) throw refused('Carte cible introuvable', 'unknown_target_map');
  }
  if (typeof input.linkedPortalId === 'string') {
    const [twin] = await db
      .select({ id: mapPortals.id })
      .from(mapPortals)
      .where(
        and(eq(mapPortals.id, input.linkedPortalId), eq(mapPortals.campaignId, map.campaignId)),
      );
    if (!twin) throw refused('Portail de retour introuvable', 'unknown_portal');
  }
}

/**
 * Colonnes de l'écriture ajustées : une téléportation n'a pas de carte visée (une carte visée
 * qui est celle du portail en fait une téléportation) ; relier aligne la destination sur le
 * retour ; changer de scène visée délie.
 */
export async function portalBeforeWrite(
  tx: Tx,
  map: MapRow,
  beforeRow: LayerRow | null,
  columns: Input,
): Promise<Input> {
  const before = beforeRow as PortalRow | null;
  const out = { ...columns };
  if (out.targetMapId === map.id) {
    out.targetMapId = null;
    out.kind = 'same_map';
  } else if (out.kind === 'same_map') out.targetMapId = null;
  else if (typeof out.targetMapId === 'string' && out.kind === undefined) out.kind = 'scene_change';

  const link = out.linkedPortalId;
  if (typeof link === 'string' && link !== before?.linkedPortalId) {
    if (before && link === before.id)
      throw refused('Un portail ne se relie pas à lui-même', 'invalid_link');
    const twin = await lockPortal(tx, map.campaignId, link);
    if (!twin) throw refused('Portail de retour introuvable', 'unknown_portal');
    Object.assign(out, destinationTo(twin, map.id));
  } else if (before?.linkedPortalId && link === undefined) {
    const retargeted =
      (out.targetMapId !== undefined && (out.targetMapId ?? null) !== before.targetMapId) ||
      (out.kind !== undefined && out.kind !== before.kind);
    if (retargeted) out.linkedPortalId = null;
  }
  return out;
}

/**
 * Après l'écriture de `after` : son ancien retour est délié, son retour actuel (et l'ancien
 * partenaire de celui-ci) suit : arrivée sur `after`, place sur l'arrivée de `after` si elle a
 * bougé.
 */
export async function portalAfterWrite(
  tx: Tx,
  _map: MapRow,
  beforeRow: LayerRow | null,
  afterRow: LayerRow,
  write: SiblingWrite,
) {
  const before = beforeRow as PortalRow | null;
  const after = afterRow as unknown as PortalRow;
  const oldLink = before?.linkedPortalId ?? null;
  const link = after.linkedPortalId ?? null;
  if (oldLink && oldLink !== link) await unlink(tx, write, after.campaignId, oldLink, after.id);
  if (!link) return;
  const twin = await lockPortal(tx, after.campaignId, link);
  if (!twin) return;
  // Le retour était relié à un autre : cet autre est délié
  if (twin.linkedPortalId && twin.linkedPortalId !== after.id)
    await unlink(tx, write, after.campaignId, twin.linkedPortalId, twin.id);
  const arrivalMoved =
    !!before && oldLink === link && !!after.target && !samePoint(before.target, after.target);
  const desired: Input = {
    linkedPortalId: after.id,
    ...destinationTo(after, twin.mapId),
    ...(arrivalMoved ? { pos: { ...after.target! } } : {}),
  };
  const changes = diff(twin, desired);
  if (Object.keys(changes).length) await write(twin as unknown as LayerRow, changes);
}

/** Avant la suppression d'un portail : son retour reste, à sens unique. */
export async function portalBeforeDelete(
  tx: Tx,
  _ctx: unknown,
  _v: unknown,
  _map: MapRow,
  row: LayerRow,
  _o: unknown,
  write: SiblingWrite,
) {
  const portal = row as unknown as PortalRow;
  if (portal.linkedPortalId)
    await unlink(tx, write, portal.campaignId, portal.linkedPortalId, portal.id);
}

/** Délie `id` s'il est encore relié à `from`. */
async function unlink(tx: Tx, write: SiblingWrite, campaignId: string, id: string, from: string) {
  const other = await lockPortal(tx, campaignId, id);
  if (other && other.linkedPortalId === from)
    await write(other as unknown as LayerRow, { linkedPortalId: null });
}

/** Champs de `desired` qui diffèrent de la ligne. */
function diff(row: PortalRow, desired: Input): Input {
  const out: Input = {};
  for (const [k, v] of Object.entries(desired)) {
    const cur = (row as unknown as Input)[k];
    const same =
      v && typeof v === 'object'
        ? samePoint(cur as MapPoint | null, v as MapPoint)
        : (cur ?? null) === (v ?? null);
    if (!same) out[k] = v;
  }
  return out;
}
