/**
 * Commandes des PNJ (docs/carte.md § 7, § 10) : écritures optimistes, une par geste.
 *
 * - `placeNpcsCommand` : poser N exemplaires en **un** appel (`POST …/npcs`). Les brouillons
 *   apparaissent tout de suite (fantômes), puis les tokens du serveur les remplacent. Annuler
 *   supprime ces PNJ avec leur personnage ; refaire les recrée.
 * - `deleteNpcsCommand` : supprimer des PNJ avec leur personnage (`?character=delete`).
 *   Annuler les restaure tels quels (`restoreNpcsCommand` : même fiche, même token), tant que
 *   la purge ne les a pas effacés (`NPC_UNDO_HOURS`) ; inverse d'une pose : les reposer.
 * - `tokenPersistence` : la persistance commune des tokens, plus la copie d'un PNJ (Dupliquer :
 *   `/duplicate`) et le retrait d'une instance créée ici (avec son personnage).
 */
import type { CampaignSide, CreateMapNpcs, MapToken } from '@vtt/contracts';
import type { Command, CommandContext, Persistence } from '@/lib/map/store/commands';
import { itemOf, type MapDto } from '@/lib/map/store/map-store';
import type { NpcApi } from './api';
import { TOKENS_COLLECTION, type TokenData } from './model';

const C = TOKENS_COLLECTION;

/**
 * Pose de PNJ : `drafts` sont les fantômes (identifiants provisoires, positions en grille),
 * `body` l'appel unique au serveur. Les tokens créés prennent la place des brouillons, dans
 * l'ordre (le serveur pose en grille autour de `pos`, comme les brouillons).
 */
export function placeNpcsCommand(opts: {
  label: string;
  api: NpcApi;
  body: CreateMapNpcs;
  drafts: readonly TokenData[];
}): Command {
  const { label, api, body, drafts } = opts;
  const ids = (ctx: CommandContext) => drafts.map((d) => ctx.resolve(d.id));
  return {
    label,
    targets: (ctx) => ids(ctx).map((id) => ({ collection: C, id })),
    apply(ctx) {
      ctx.store.getState().upsert(
        C,
        drafts.map((d) => ({ ...d, id: ctx.resolve(d.id) })),
        { force: true },
      );
    },
    revert(ctx) {
      ctx.store.getState().remove(C, ids(ctx));
    },
    async send(ctx) {
      const current = ids(ctx);
      const created = await api.place({ ...body, count: drafts.length });
      const items = created.items as unknown as MapDto[];
      // Correspondances d'abord : la sélection suit le token avant que le brouillon disparaisse
      items.forEach((t, i) => {
        const from = current[i];
        if (from && from !== t.id) ctx.alias(from, t.id);
      });
      const store = ctx.store.getState();
      store.remove(
        C,
        current.filter((id) => !items.some((t) => t.id === id)),
      );
      store.upsert(C, items, { force: true });
    },
    inverse: () =>
      deleteNpcsCommand({
        label,
        api,
        items: drafts,
        recreate: () => placeNpcsCommand(opts),
      }),
  };
}

/**
 * Supprime des PNJ avec leur personnage. `recreate` : commande qui les refait (inverse d'une
 * pose annulée) ; sinon, annuler les restaure tels quels, dans leur camp (`sideOf`).
 */
export function deleteNpcsCommand(opts: {
  label: string;
  api: NpcApi;
  items: readonly TokenData[];
  recreate?: () => Command;
  sideOf?: (characterId: string) => CampaignSide | null | undefined;
}): Command {
  const { label, api, items, recreate } = opts;
  // Camp de chacun au moment de la suppression : l'engagement disparaît avec lui
  const sides = new Map(items.map((i) => [i.characterId, opts.sideOf?.(i.characterId) ?? null]));
  let saved: MapDto[] = [];
  const ids = (ctx: CommandContext) => items.map((i) => ctx.resolve(i.id));
  return {
    label,
    targets: (ctx) => ids(ctx).map((id) => ({ collection: C, id })),
    apply(ctx) {
      const s = ctx.store.getState();
      saved = ids(ctx).flatMap((id) => {
        const item = itemOf(s, C, id);
        return item ? [item] : [];
      });
      s.remove(C, ids(ctx));
    },
    revert(ctx) {
      ctx.store.getState().upsert(C, saved, { force: true });
    },
    async send(ctx) {
      const results = await Promise.allSettled(ids(ctx).map((id) => api.removeWithCharacter(id)));
      const failed = results.find((r) => r.status === 'rejected');
      if (failed) {
        // Les PNJ déjà supprimés ne reviennent pas : seuls les refusés sont remis en place
        const gone = new Set(ids(ctx).filter((_, i) => results[i]!.status === 'fulfilled'));
        saved = saved.filter((s) => !gone.has(s.id));
        throw failed.reason;
      }
    },
    inverse: () =>
      recreate
        ? recreate()
        : restoreNpcsCommand({ label, api, items: saved.length ? saved : items, sides }),
  };
}

/** Champs d'un token repris tels quels à la restauration. */
const LOOK_KEYS = [
  'layerId',
  'z',
  'scale',
  'shape',
  'imageUrl',
  'visibility',
  'visibleTo',
  'visionRadius',
  'visionBoost',
  'notes',
  'audio',
  'interactions',
] as const;

/** Annule la suppression de PNJ : même fiche, même token (identifiant, réglages), même camp. */
export function restoreNpcsCommand(opts: {
  label: string;
  api: NpcApi;
  items: readonly MapDto[];
  sides: ReadonlyMap<string, CampaignSide | null>;
}): Command {
  const { label, api, sides } = opts;
  const items = opts.items as readonly TokenData[];
  const ids = (ctx: CommandContext) => items.map((i) => ctx.resolve(i.id));
  return {
    label,
    targets: (ctx) => ids(ctx).map((id) => ({ collection: C, id })),
    apply(ctx) {
      ctx.store.getState().upsert(
        C,
        items.map((i) => ({ ...i, id: ctx.resolve(i.id) })),
        { force: true },
      );
    },
    revert(ctx) {
      ctx.store.getState().remove(C, ids(ctx));
    },
    async send(ctx) {
      const current = ids(ctx);
      const body = {
        items: items.map((i, n) => {
          const look: Record<string, unknown> = {};
          for (const k of LOOK_KEYS) if (i[k] !== undefined) look[k] = i[k];
          const side = sides.get(i.characterId);
          return {
            ...look,
            tokenId: current[n]!,
            characterId: i.characterId,
            side: side === 'allies' ? ('allies' as const) : ('enemies' as const),
            pos: i.pos,
          };
        }),
      };
      const restored = await api.restore(body);
      const back = restored.items as unknown as MapDto[];
      const store = ctx.store.getState();
      // Ceux que la purge a déjà effacés ne reviennent pas
      store.remove(
        C,
        current.filter((id) => !back.some((t) => t.id === id)),
      );
      store.upsert(C, back, { force: true });
    },
    inverse: () =>
      deleteNpcsCommand({
        label,
        api,
        items,
        sideOf: (id) => sides.get(id),
      }),
  };
}

/**
 * Persistance des tokens : celle de la carte (`/tokens/move`, `PATCH`, `POST /tokens`,
 * `DELETE`), plus deux cas propres aux PNJ :
 * - un brouillon `duplicateOf` (Dupliquer) est créé par `/duplicate` (fiche comprise) ;
 * - une instance `npcInstance` (copie annulée) est retirée avec son personnage.
 */
export function npcAwarePersistence(
  base: Persistence<MapDto>,
  api: NpcApi,
): Persistence<TokenData> {
  return {
    async create(drafts) {
      return Promise.all(
        drafts.map(async (d) => {
          if (d.duplicateOf) {
            const r = await api.duplicate(d.duplicateOf, { pos: d.pos, count: 1 });
            const token = r.items[0] as MapToken | undefined;
            if (!token) throw new Error('Copie du PNJ introuvable dans la réponse');
            return token as TokenData;
          }
          const [created] = await base.create!([d]);
          return created as TokenData;
        }),
      );
    },
    update: (updates) => base.update(updates) as Promise<TokenData[]>,
    async remove(items) {
      const instances = items.filter((i) => i.npcInstance);
      const others = items.filter((i) => !i.npcInstance);
      await Promise.all([
        ...instances.map((i) => api.removeWithCharacter(i.id)),
        ...(others.length ? [base.remove!(others)] : []),
      ]);
    },
  };
}
