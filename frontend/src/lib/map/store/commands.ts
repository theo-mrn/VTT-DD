/**
 * Commandes de la carte (docs/carte.md § 7) : toute modification durable passe par ici.
 *
 * - Une commande est `{ label, targets, apply, revert, send, inverse }`. `apply` écrit tout de
 *   suite dans le magasin (optimiste), `send` part au serveur et applique sa réponse.
 * - Erreur : `revert`, puis un toast (`messageErreur`). `409 version_conflict` : les éléments
 *   sont relus, puis le toast « modifié entre-temps ».
 * - Pile d'annulation par utilisateur et par carte, 100 entrées (`historyFor`). Annuler, c'est
 *   exécuter l'inverse : une commande comme une autre, envoyée au serveur.
 * - Un geste sur plusieurs éléments est une seule commande (`groupCommands`).
 * - Les envois partent l'un après l'autre : la version envoyée est celle que le serveur a
 *   rendue à la commande précédente, jamais une version périmée.
 * - Un élément supprimé puis recréé (annuler une suppression) a un nouvel identifiant : les
 *   commandes de la pile le retrouvent par `ctx.resolve(id)`.
 */
import { ApiError, messageErreur } from '@/lib/api';
import { itemOf, type MapDto, type MapStore } from './map-store';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Élément visé par une commande. */
export interface EntityRef {
  collection: string;
  id: string;
}

export interface CommandContext {
  store: MapStore;
  /** Identifiant actuel d'un élément (il change quand un élément supprimé est recréé). */
  resolve(id: string): string;
  /** Note qu'un élément porte désormais un autre identifiant. */
  alias(from: string, to: string): void;
}

export interface Command {
  readonly label: string;
  /** Éléments touchés : « en attente » pendant l'envoi, relus après un 409. */
  targets(ctx: CommandContext): EntityRef[];
  /** Écriture optimiste dans le magasin. */
  apply(ctx: CommandContext): void;
  /** Défait `apply` après un échec. */
  revert(ctx: CommandContext): void;
  /** Envoi au serveur ; la réponse est appliquée au magasin. */
  send(ctx: CommandContext): Promise<void>;
  /** Commande qui annule celle-ci. */
  inverse(): Command;
}

/** Modification d'un élément, telle que la persistance l'envoie. */
export interface EntityUpdate<D extends MapDto = MapDto> {
  before: D;
  after: D;
  /** Champs changés (comparaison profonde, champ par champ). */
  changes: Partial<D>;
  /** Version connue du serveur au moment de l'envoi (verrou optimiste). */
  version: number;
}

/**
 * Écritures d'une couche au serveur. `api.ts` en fournit une par couche (`/batch`) ; une sorte
 * d'entité peut la remplacer (tokens : `/tokens/move`).
 */
export interface Persistence<D extends MapDto = MapDto> {
  /** Crée les brouillons (leur `id` est provisoire) ; renvoie les éléments créés, dans l'ordre. */
  create?(drafts: readonly D[]): Promise<D[]>;
  /** Modifie ; renvoie les éléments à jour, dans l'ordre. */
  update(updates: readonly EntityUpdate<D>[]): Promise<D[]>;
  remove?(items: readonly D[]): Promise<void>;
}

// ─── Outils ──────────────────────────────────────────────────────────────────

/** Égalité profonde de données JSON (tableaux de points, objets imbriqués). */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((v, i) => deepEqual(v, bb[i]));
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

/** Champs de `after` différents de `before` (hors `id`, `version`, `updatedAt`). */
export function diffFields<D extends MapDto>(before: D, after: D): Partial<D> {
  const out: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (key === 'id' || key === 'version' || key === 'updatedAt') continue;
    const b = (before as Record<string, unknown>)[key];
    const a = (after as Record<string, unknown>)[key];
    if (!deepEqual(a, b)) out[key] = a === undefined ? null : a;
  }
  return out as Partial<D>;
}

let tempCounter = 0;
/** Identifiant provisoire d'un élément créé localement, remplacé par celui du serveur. */
export const tempId = () => `tmp-${Date.now().toString(36)}-${(tempCounter++).toString(36)}`;
export const isTempId = (id: string) => id.startsWith('tmp-');

const current = (ctx: CommandContext, collection: string, id: string) =>
  itemOf(ctx.store.getState(), collection, ctx.resolve(id));

/** L'élément avec l'identifiant actuel et la version connue du magasin. */
function rebased<D extends MapDto>(ctx: CommandContext, collection: string, item: D): D {
  const id = ctx.resolve(item.id);
  const here = itemOf(ctx.store.getState(), collection, id);
  return { ...item, id, version: here?.version ?? item.version };
}

/**
 * Réponse du serveur : elle remplace l'élément, sauf si une commande plus récente l'attend
 * encore (on garde alors l'intention locale et on ne prend que la version).
 */
function applyServer(ctx: CommandContext, collection: string, items: readonly MapDto[]) {
  const s = ctx.store.getState();
  const out = items.map((server) => {
    const inFlight = s.pending.get(server.id) ?? 0;
    const local = itemOf(s, collection, server.id);
    return inFlight > 1 && local ? { ...local, version: server.version } : server;
  });
  s.upsert(collection, out, { force: true });
}

// ─── Commandes génériques ────────────────────────────────────────────────────

interface CollectionCommand<D extends MapDto> {
  label: string;
  collection: string;
  persistence: Persistence<D>;
}

/** Modifie des éléments d'une couche (déplacer, verrouiller, masquer, propriétés…). */
export function updateCommand<D extends MapDto>(
  opts: CollectionCommand<D> & { changes: readonly { before: D; after: D }[] },
): Command {
  const { label, collection, persistence, changes } = opts;
  return {
    label,
    targets: (ctx) => changes.map((c) => ({ collection, id: ctx.resolve(c.after.id) })),
    apply(ctx) {
      ctx.store.getState().upsert(
        collection,
        changes.map((c) => rebased(ctx, collection, c.after)),
        { force: true },
      );
    },
    revert(ctx) {
      ctx.store.getState().upsert(
        collection,
        changes.map((c) => rebased(ctx, collection, c.before)),
        { force: true },
      );
    },
    async send(ctx) {
      const updates: EntityUpdate<D>[] = changes.map((c) => {
        const id = ctx.resolve(c.after.id);
        const version = current(ctx, collection, id)?.version ?? c.after.version;
        return {
          before: { ...c.before, id },
          after: { ...c.after, id, version },
          changes: diffFields(c.before, c.after),
          version,
        };
      });
      const saved = await persistence.update(updates);
      applyServer(ctx, collection, saved);
    },
    inverse: () =>
      updateCommand({
        label,
        collection,
        persistence,
        changes: changes.map((c) => ({ before: c.after, after: c.before })),
      }),
  };
}

/**
 * Crée des éléments. Chaque brouillon porte un identifiant (provisoire, `tempId()`, ou celui
 * d'un élément supprimé qu'on recrée) : il est remplacé par celui du serveur.
 */
export function createCommand<D extends MapDto>(
  opts: CollectionCommand<D> & { items: readonly D[] },
): Command {
  const { label, collection, persistence, items } = opts;
  return {
    label,
    targets: (ctx) => items.map((i) => ({ collection, id: ctx.resolve(i.id) })),
    apply(ctx) {
      ctx.store.getState().upsert(
        collection,
        items.map((i) => ({ ...i, id: ctx.resolve(i.id) })),
        { force: true },
      );
    },
    revert(ctx) {
      ctx.store.getState().remove(
        collection,
        items.map((i) => ctx.resolve(i.id)),
      );
    },
    async send(ctx) {
      if (!persistence.create) throw new Error(`Création impossible : ${collection}`);
      const drafts = items.map((i) => ({ ...i, id: ctx.resolve(i.id) }));
      const created = await persistence.create(drafts);
      // Correspondances d'abord : la sélection suit l'élément avant que le brouillon disparaisse
      created.forEach((c, i) => {
        if (c && c.id !== drafts[i]!.id) ctx.alias(drafts[i]!.id, c.id);
      });
      const store = ctx.store.getState();
      store.remove(
        collection,
        drafts.map((d) => d.id).filter((id, i) => created[i] && created[i]!.id !== id),
      );
      store.upsert(collection, created, { force: true });
    },
    inverse: () => deleteCommand({ label, collection, persistence, items }),
  };
}

/** Supprime des éléments ; l'inverse les recrée (nouvel identifiant, suivi par `resolve`). */
export function deleteCommand<D extends MapDto>(
  opts: CollectionCommand<D> & { items: readonly D[] },
): Command {
  const { label, collection, persistence, items } = opts;
  return {
    label,
    targets: (ctx) => items.map((i) => ({ collection, id: ctx.resolve(i.id) })),
    apply(ctx) {
      ctx.store.getState().remove(
        collection,
        items.map((i) => ctx.resolve(i.id)),
      );
    },
    revert(ctx) {
      ctx.store.getState().upsert(
        collection,
        items.map((i) => ({ ...i, id: ctx.resolve(i.id) })),
        { force: true },
      );
    },
    async send(ctx) {
      if (!persistence.remove) throw new Error(`Suppression impossible : ${collection}`);
      await persistence.remove(items.map((i) => ({ ...i, id: ctx.resolve(i.id) })));
    },
    inverse: () => createCommand({ label, collection, persistence, items }),
  };
}

/** Place d'un élément dans les calques du MJ. */
export interface StackPlace {
  layerId: string | null;
  z: number;
}

/** Élément réordonné : sa donnée avant et après, et sa place avant et après. */
export interface ArrangeChange<D extends MapDto = MapDto> {
  collection: string;
  /** Valeur `kind` de `/arrange` (`token`, `object`, `drawing`, `note`). */
  kind: string;
  before: D;
  after: D;
  from: StackPlace;
  to: StackPlace;
}

export interface ArrangeItem {
  kind: string;
  id: string;
  layerId: string | null;
  z: number;
}

/** Envoi de `POST /maps/:mapId/arrange` ; la réponse donne les éléments à jour par couche. */
export type ArrangeSender = (
  items: ArrangeItem[],
) => Promise<Partial<Record<string, readonly MapDto[]>> | void>;

/**
 * Ordre et calque d'une sélection (avancer, reculer, premier plan, arrière-plan, changer de
 * calque) : une commande, un envoi, seuls les éléments déplacés. Un calque recréé (annuler sa
 * suppression) est retrouvé par `ctx.resolve`.
 */
export function arrangeCommand(opts: {
  label: string;
  changes: readonly ArrangeChange[];
  send: ArrangeSender;
}): Command {
  const { label, changes, send } = opts;
  const byCollection = (pick: (c: ArrangeChange) => MapDto) => {
    const out = new Map<string, MapDto[]>();
    for (const c of changes) {
      const list = out.get(c.collection) ?? [];
      list.push(pick(c));
      out.set(c.collection, list);
    }
    return out;
  };
  const write = (ctx: CommandContext, pick: (c: ArrangeChange) => MapDto) => {
    for (const [collection, items] of byCollection(pick))
      ctx.store.getState().upsert(
        collection,
        items.map((i) => rebased(ctx, collection, i)),
        { force: true },
      );
  };
  return {
    label,
    targets: (ctx) =>
      changes.map((c) => ({ collection: c.collection, id: ctx.resolve(c.after.id) })),
    apply: (ctx) => write(ctx, (c) => c.after),
    revert: (ctx) => write(ctx, (c) => c.before),
    async send(ctx) {
      const saved = await send(
        changes.map((c) => ({
          kind: c.kind,
          id: ctx.resolve(c.after.id),
          layerId: c.to.layerId === null ? null : ctx.resolve(c.to.layerId),
          z: c.to.z,
        })),
      );
      if (saved)
        for (const [collection, items] of Object.entries(saved))
          if (items?.length) applyServer(ctx, collection, items);
    },
    inverse: () =>
      arrangeCommand({
        label,
        send,
        changes: changes.map((c) => ({
          ...c,
          before: c.after,
          after: c.before,
          from: c.to,
          to: c.from,
        })),
      }),
  };
}

/**
 * Plusieurs commandes en une (un geste sur des éléments de couches différentes). Les envois
 * partent ensemble ; en cas d'échec partiel, seules les parties refusées sont défaites.
 */
export function groupCommands(label: string, commands: readonly Command[]): Command {
  if (commands.length === 1) return commands[0]!;
  let failed: Set<Command> | null = null;
  return {
    label,
    targets: (ctx) => commands.flatMap((c) => c.targets(ctx)),
    apply(ctx) {
      failed = null;
      for (const c of commands) c.apply(ctx);
    },
    revert(ctx) {
      const which = failed ?? new Set(commands);
      for (const c of [...commands].reverse()) if (which.has(c)) c.revert(ctx);
    },
    async send(ctx) {
      const results = await Promise.allSettled(commands.map((c) => c.send(ctx)));
      const errors = results.flatMap((r, i) =>
        r.status === 'rejected' ? [{ command: commands[i]!, reason: r.reason as unknown }] : [],
      );
      if (!errors.length) return;
      failed = new Set(errors.map((e) => e.command));
      throw errors[0]!.reason;
    },
    inverse: () =>
      groupCommands(
        label,
        [...commands].reverse().map((c) => c.inverse()),
      ),
  };
}

// ─── Pile d'annulation (par utilisateur et par carte) ────────────────────────

export const UNDO_LIMIT = 100;

/** Pile d'annulation et correspondances d'identifiants d'une carte, pour un utilisateur. */
export class CommandHistory {
  readonly undo: Command[] = [];
  readonly redo: Command[] = [];
  readonly aliases = new Map<string, string>();

  constructor(readonly limit = UNDO_LIMIT) {}

  push(cmd: Command) {
    this.undo.push(cmd);
    if (this.undo.length > this.limit) this.undo.splice(0, this.undo.length - this.limit);
  }

  resolve(id: string): string {
    let cur = id;
    // Suit la chaîne (supprimé, recréé, re-supprimé, recréé…), bornée contre une boucle
    for (let i = 0; i < 64; i++) {
      const next = this.aliases.get(cur);
      if (!next || next === cur) return cur;
      cur = next;
    }
    return cur;
  }
}

const histories = new Map<string, CommandHistory>();
/** Cartes gardées en mémoire (changer de scène puis revenir garde la pile). */
const MAX_HISTORIES = 20;

/** Pile de cet utilisateur pour cette carte, gardée pendant la session de l'onglet. */
export function historyFor(userId: string, mapId: string): CommandHistory {
  const key = `${userId}:${mapId}`;
  let h = histories.get(key);
  if (h) {
    // Plus récemment utilisée en dernier
    histories.delete(key);
    histories.set(key, h);
    return h;
  }
  h = new CommandHistory();
  histories.set(key, h);
  if (histories.size > MAX_HISTORIES) histories.delete(histories.keys().next().value!);
  return h;
}

// ─── Exécution ───────────────────────────────────────────────────────────────

export interface CommandManagerOptions {
  store: MapStore;
  history?: CommandHistory;
  /** Toast d'erreur. */
  notify(message: string): void;
  /** Relit des éléments (après un 409). */
  refetch(refs: readonly EntityRef[]): Promise<void>;
}

export interface CommandManagerSnapshot {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Envois en cours. */
  busy: boolean;
}

export const CONFLICT_MESSAGE =
  'Modifié entre-temps par quelqu’un d’autre : l’élément a été rechargé.';

export class CommandManager {
  readonly history: CommandHistory;
  private queue: Promise<unknown> = Promise.resolve();
  private inFlight = 0;
  private readonly listeners = new Set<() => void>();
  private readonly aliasListeners = new Set<(from: string, to: string) => void>();
  private snap: CommandManagerSnapshot;
  readonly ctx: CommandContext;

  constructor(private readonly opts: CommandManagerOptions) {
    this.history = opts.history ?? new CommandHistory();
    this.ctx = {
      store: opts.store,
      resolve: (id) => this.history.resolve(id),
      alias: (from, to) => {
        if (from === to) return;
        this.history.aliases.set(from, to);
        for (const l of this.aliasListeners) l(from, to);
      },
    };
    this.snap = this.computeSnapshot();
  }

  // ── État observable (barre d'outils : annuler, refaire) ──

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  /** Un élément change d'identifiant (créé, ou recréé par « annuler ») : la sélection suit. */
  onAlias(listener: (from: string, to: string) => void): () => void {
    this.aliasListeners.add(listener);
    return () => void this.aliasListeners.delete(listener);
  }

  /** Instantané stable (le même objet tant que rien ne change). */
  getSnapshot = (): CommandManagerSnapshot => this.snap;

  private computeSnapshot(): CommandManagerSnapshot {
    const u = this.history.undo;
    const r = this.history.redo;
    return {
      canUndo: u.length > 0,
      canRedo: r.length > 0,
      undoLabel: u[u.length - 1]?.label ?? null,
      redoLabel: r[r.length - 1]?.label ?? null,
      busy: this.inFlight > 0,
    };
  }

  private changed() {
    const next = this.computeSnapshot();
    const s = this.snap;
    if (
      next.canUndo === s.canUndo &&
      next.canRedo === s.canRedo &&
      next.undoLabel === s.undoLabel &&
      next.redoLabel === s.redoLabel &&
      next.busy === s.busy
    )
      return;
    this.snap = next;
    for (const l of this.listeners) l();
  }

  // ── Exécution ──

  /**
   * Applique la commande tout de suite, puis l'envoie après les précédentes. Renvoie vrai si le
   * serveur l'a acceptée. `undoable: false` : hors de la pile (ouvrir une porte…).
   */
  execute(cmd: Command, options: { undoable?: boolean } = {}): Promise<boolean> {
    const undoable = options.undoable ?? true;
    cmd.apply(this.ctx);
    if (undoable) {
      this.history.push(cmd);
      this.history.redo.length = 0;
    }
    return this.run(cmd, () => {
      if (!undoable) return;
      const i = this.history.undo.lastIndexOf(cmd);
      if (i >= 0) this.history.undo.splice(i, 1);
    });
  }

  /** Annule la dernière commande (son inverse part au serveur). */
  async undo(): Promise<boolean> {
    const cmd = this.history.undo.pop();
    if (!cmd) return false;
    const inv = cmd.inverse();
    inv.apply(this.ctx);
    this.history.redo.push(cmd);
    return this.run(inv, () => {
      // Refusée : la commande reste annulable
      const i = this.history.redo.lastIndexOf(cmd);
      if (i >= 0) this.history.redo.splice(i, 1);
      this.history.push(cmd);
    });
  }

  /** Refait la dernière commande annulée. */
  async redo(): Promise<boolean> {
    const cmd = this.history.redo.pop();
    if (!cmd) return false;
    cmd.apply(this.ctx);
    this.history.push(cmd);
    return this.run(cmd, () => {
      const i = this.history.undo.lastIndexOf(cmd);
      if (i >= 0) this.history.undo.splice(i, 1);
      this.history.redo.push(cmd);
    });
  }

  /** Attend la fin de tous les envois (tests, démontage). */
  idle(): Promise<void> {
    return this.queue.then(() => undefined);
  }

  private run(cmd: Command, onFailure: () => void): Promise<boolean> {
    const ids = cmd.targets(this.ctx).map((t) => t.id);
    const store = this.opts.store.getState();
    store.markPending(ids, true);
    this.inFlight += 1;
    this.changed();
    const result = this.queue.then(async () => {
      // Identifiants relus au moment de l'envoi (un élément recréé entre-temps)
      const targets = cmd.targets(this.ctx);
      try {
        await cmd.send(this.ctx);
        return true;
      } catch (err) {
        cmd.revert(this.ctx);
        onFailure();
        if (err instanceof ApiError && err.status === 409) {
          try {
            await this.opts.refetch(targets);
          } catch {
            // La relecture complète suivante rattrapera
          }
          this.opts.notify(CONFLICT_MESSAGE);
        } else {
          this.opts.notify(messageErreur(err));
        }
        return false;
      } finally {
        this.opts.store.getState().markPending(ids, false);
        this.inFlight -= 1;
        this.changed();
      }
    });
    this.queue = result.catch(() => undefined);
    this.changed();
    return result;
  }
}
