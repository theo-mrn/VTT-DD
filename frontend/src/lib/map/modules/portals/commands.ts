/**
 * Écritures des portails (docs/carte.md § 7, § 10, Portails) : persistance de la couche et
 * commandes de pose, toutes annulables.
 *
 * Deux portails reliés (aller-retour) se citent l'un l'autre (`linkedPortalId`), et le serveur
 * tient le lien. Or une création ne connaît pas encore l'identifiant du serveur de l'autre, et
 * un portail recréé par ⌘Z en reçoit un nouveau. La persistance crée donc d'abord les portails
 * sans les liens internes au lot, relie ensuite, puis relit la couche (le lien change les deux
 * portails côté serveur). Un retour sur une autre scène passe par sa propre carte
 * (`placeWithRemoteReturn`, `remoteReturnCommand`).
 */
import type { CreateMapPortal } from '@vtt/contracts';
import { ApiError } from '@/lib/api';
import {
  createCommand,
  deleteCommand,
  isTempId,
  type Command,
  type CommandContext,
  type Persistence,
} from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import type { PortalApi } from './api';
import { PORTALS, type PortalData } from './model';

const linkOf = (d: MapDto) => (d as PortalData).linkedPortalId ?? null;

const unknownPortal = (err: unknown) =>
  err instanceof ApiError && err.status === 422 && err.problem.code === 'unknown_portal';

/**
 * Persistance de la couche `portals` : celle de la carte (`/batch`), plus les liens entre
 * portails créés ensemble (paire posée, ou recréée par ⌘Z) et le lien vers un portail disparu
 * (oublié).
 */
export function portalPersistence(base: Persistence<MapDto>, api: PortalApi): Persistence<MapDto> {
  return {
    async create(drafts) {
      const index = new Map(drafts.map((d, i) => [d.id, i]));
      const inBatch = (link: string | null) => !!link && (index.has(link) || isTempId(link));
      const stripped = drafts.map((d) =>
        inBatch(linkOf(d)) ? ({ ...d, linkedPortalId: null } as MapDto) : d,
      );
      let created: MapDto[];
      try {
        created = await base.create!(stripped);
      } catch (err) {
        // Retour disparu entre-temps : le portail revient seul
        if (!unknownPortal(err)) throw err;
        created = await base.create!(stripped.map((d) => ({ ...d, linkedPortalId: null })));
      }
      // Paires du lot : le second portail est relié au premier (le serveur relie les deux)
      const links: { at: number; to: number }[] = [];
      drafts.forEach((d, i) => {
        const j = index.get(linkOf(d) ?? '');
        if (j !== undefined && j < i) links.push({ at: i, to: j });
      });
      if (!links.length) return created;
      await base.update(
        links.map(({ at, to }) => {
          const before = created[at]!;
          const after = { ...before, linkedPortalId: created[to]!.id };
          return {
            before,
            after,
            changes: { linkedPortalId: created[to]!.id },
            version: before.version,
          };
        }),
      );
      const fresh = new Map((await api.list()).map((p) => [p.id, p as unknown as MapDto]));
      return created.map((c) => fresh.get(c.id) ?? c);
    },
    update: (updates) => base.update(updates),
    remove: (items) => base.remove!(items),
  };
}

/**
 * Pose d'un portail dont le retour est sur une autre scène : le portail d'ici (magasin,
 * optimiste), puis son retour, relié, sur la scène visée ; le portail d'ici, relié par le
 * serveur, est relu. ⌘Z retire les deux ; refaire les repose.
 */
export function placeWithRemoteReturn(opts: {
  label: string;
  persistence: Persistence<MapDto>;
  api: PortalApi;
  entry: PortalData;
  remote: { mapId: string; body: CreateMapPortal };
}): Command {
  const { label, persistence, api, entry, remote } = opts;
  const create = createCommand({ label, collection: PORTALS, persistence, items: [entry] });
  let remoteId: string | null = null;
  const place: Command = {
    label,
    targets: create.targets,
    apply: create.apply,
    revert: create.revert,
    async send(ctx) {
      await create.send(ctx);
      const id = ctx.resolve(entry.id);
      try {
        const back = await api.createOn(remote.mapId, { ...remote.body, linkedPortalId: id });
        remoteId = back.id;
      } catch (err) {
        // Rien à moitié posé : le portail d'ici repart avec son retour manqué
        const here = ctx.store.getState().collections[PORTALS]?.get(id);
        if (here) await persistence.remove?.([here]).catch(() => undefined);
        throw err;
      }
      await refresh(ctx, api, [id]);
    },
    inverse: () => {
      const remove = deleteCommand({ label, collection: PORTALS, persistence, items: [entry] });
      return {
        label,
        targets: remove.targets,
        apply: remove.apply,
        revert: remove.revert,
        async send(ctx) {
          if (remoteId) await api.removeOn(remote.mapId, remoteId).catch(ignoreGone);
          await remove.send(ctx);
        },
        inverse: () => placeWithRemoteReturn(opts),
      };
    },
  };
  return place;
}

/**
 * Pose le retour d'un portail existant sur une autre scène (« Poser le retour ») : rien ne
 * change dans le magasin d'ici avant la réponse (le portail relié y est relu).
 */
export function remoteReturnCommand(opts: {
  label: string;
  api: PortalApi;
  portalId: string;
  remote: { mapId: string; body: CreateMapPortal };
}): Command {
  const { label, api, portalId, remote } = opts;
  let remoteId: string | null = null;
  const cmd: Command = {
    label,
    targets: (ctx) => [{ collection: PORTALS, id: ctx.resolve(portalId) }],
    apply: () => undefined,
    revert: () => undefined,
    async send(ctx) {
      const id = ctx.resolve(portalId);
      const back = await api.createOn(remote.mapId, { ...remote.body, linkedPortalId: id });
      remoteId = back.id;
      await refresh(ctx, api, [id]);
    },
    inverse: () => ({
      label,
      targets: cmd.targets,
      apply: () => undefined,
      revert: () => undefined,
      async send(ctx) {
        if (remoteId) await api.removeOn(remote.mapId, remoteId).catch(ignoreGone);
        await refresh(ctx, api, [ctx.resolve(portalId)]);
      },
      inverse: () => remoteReturnCommand(opts),
    }),
  };
  return cmd;
}

/** Relit ces portails d'ici (un lien les a changés côté serveur). */
async function refresh(ctx: CommandContext, api: PortalApi, ids: readonly string[]) {
  const fresh = (await api.list()).filter((p) => ids.includes(p.id));
  if (fresh.length)
    ctx.store.getState().upsert(PORTALS, fresh as unknown as MapDto[], { force: true });
}

const ignoreGone = (err: unknown) => {
  if (err instanceof ApiError && err.status === 404) return;
  throw err;
};
