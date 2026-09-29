/**
 * Commandes des PNJ (docs/carte.md § 7, § 10) : écritures optimistes, une par geste.
 *
 * - `placeNpcsCommand` : poser N exemplaires en **un** appel (`POST …/npcs`). Les brouillons
 *   apparaissent tout de suite (fantômes), puis les tokens du serveur les remplacent. Annuler
 *   supprime ces PNJ avec leur personnage ; refaire les recrée.
 * - `deleteNpcsCommand` : supprimer des PNJ avec leur personnage (`?character=delete`).
 *   Définitif : exécutée hors de la pile d'annulation, sauf comme inverse d'une pose.
 * - `tokenPersistence` : la persistance commune des tokens, plus la copie d'un PNJ (Dupliquer :
 *   `/duplicate`) et le retrait d'une instance créée ici (avec son personnage).
 */
import type { CreateMapNpcs, MapToken } from '@vtt/contracts';
import type { Command, CommandContext, Persistence } from '../../store/commands';
import { itemOf, type MapDto } from '../../store/map-store';
import type { NpcApi } from './api';
import { TOKENS_COLLECTION, type TokenData } from './model';

const C = TOKENS_COLLECTION;

/** Commande sans effet (inverse d'une écriture définitive, jamais empilée). */
function noopCommand(label: string): Command {
  const cmd: Command = {
    label,
    targets: () => [],
    apply: () => undefined,
    revert: () => undefined,
    send: async () => undefined,
    inverse: () => cmd,
  };
  return cmd;
}

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
 * pose annulée) ; sans elle, la suppression est définitive (à exécuter hors de la pile).
 */
export function deleteNpcsCommand(opts: {
  label: string;
  api: NpcApi;
  items: readonly TokenData[];
  recreate?: () => Command;
}): Command {
  const { label, api, items, recreate } = opts;
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
    inverse: () => (recreate ? recreate() : noopCommand(label)),
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
