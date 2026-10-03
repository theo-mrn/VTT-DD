/**
 * Gestion des calques du MJ (docs/carte.md § 5, Calques) : ce que fait le panneau « Calques ».
 * Chaque changement est une commande annulable (créer, renommer, réordonner, masquer aux
 * joueurs, verrouiller, opacité, supprimer). L'état local (œil, isoler, calque actif) est dans
 * `engine.ui`, jamais enregistré.
 */
import {
  arrangeCommand,
  createCommand,
  groupCommands,
  tempId,
  updateCommand,
  type ArrangeChange,
  type Command,
} from '../store/commands';
import { collectionOf, type MapDto } from '../store/map-store';
import { assignZ, type LayerLike } from './layers';
import { LAYERS_COLLECTION, type MapEngine } from './map-engine';

const layerDto = (engine: MapEngine, id: string) =>
  collectionOf(engine.store.getState(), LAYERS_COLLECTION).get(id);

function persistence(engine: MapEngine) {
  return engine.backend?.collection(LAYERS_COLLECTION) ?? null;
}

/** Nouveau calque, en haut de la pile ; il devient le calque actif. */
export function createLayer(engine: MapEngine, name: string) {
  const p = persistence(engine);
  if (!p) return null;
  const layers = engine.layersBottomUp();
  const top = layers[layers.length - 1];
  const draft: MapDto = {
    id: tempId(),
    version: 0,
    name: name.trim() || 'Calque',
    sortOrder: top ? Math.floor(top.sortOrder) + 1 : 0,
    visibleToPlayers: true,
    locked: false,
    opacity: 1,
    role: null,
  };
  const result = engine.execute(
    createCommand({
      label: 'Nouveau calque',
      collection: LAYERS_COLLECTION,
      persistence: p,
      items: [draft],
    }),
  );
  engine.setActiveLayer(draft.id);
  // Le calque actif suit l'identifiant du serveur. La correspondance est annoncée avant que le
  // calque du serveur remplace le brouillon dans le magasin : le moteur effacerait un calque
  // actif encore inconnu, il est donc repris une fois le remplacement fait
  const off = engine.commands.onAlias((from, to) => {
    if (from !== draft.id) return;
    off();
    if (engine.ui.getState().activeLayerId !== from) return;
    queueMicrotask(() => {
      if (engine.layer(to)) engine.setActiveLayer(to);
    });
  });
  void result.finally(off);
  return result;
}

/** Modifie un calque (nom, masqué aux joueurs, verrou, opacité). */
export function updateLayer(
  engine: MapEngine,
  id: string,
  patch: Partial<Pick<LayerLike, 'name' | 'visibleToPlayers' | 'locked' | 'opacity' | 'sortOrder'>>,
  label: string,
) {
  const p = persistence(engine);
  const before = layerDto(engine, id);
  if (!p || !before) return null;
  const after = { ...before, ...patch };
  return engine.execute(
    updateCommand({
      label,
      collection: LAYERS_COLLECTION,
      persistence: p,
      changes: [{ before, after }],
    }),
  );
}

export const renameLayer = (engine: MapEngine, id: string, name: string) =>
  name.trim() ? updateLayer(engine, id, { name: name.trim() }, 'Renommer le calque') : null;

/**
 * Déplace un calque dans la pile. `topDown` : l'ordre voulu, du haut vers le bas (celui du
 * panneau). Seul le calque déplacé est réécrit (`sortOrder` pris entre ses voisins).
 */
export function reorderLayers(engine: MapEngine, movedId: string, topDown: readonly string[]) {
  const p = persistence(engine);
  if (!p) return null;
  const bottomUp = [...topDown].reverse();
  const current = new Map(engine.layersBottomUp().map((l) => [l.id, l.sortOrder]));
  const orders = assignZ(bottomUp, current, new Set([movedId]));
  const changes = [...orders.entries()].flatMap(([id, sortOrder]) => {
    const before = layerDto(engine, id);
    return before ? [{ before, after: { ...before, sortOrder } }] : [];
  });
  if (!changes.length) return null;
  return engine.execute(
    updateCommand({
      label: 'Réordonner les calques',
      collection: LAYERS_COLLECTION,
      persistence: p,
      changes,
    }),
  );
}

/** Sélectionne tout ce qui est rangé dans ce calque (et touchable). */
export function selectLayerContent(engine: MapEngine, id: string) {
  engine.selection.replace(
    engine
      .layerContent(id)
      .filter((e) => e.kind.can('select', e, engine.viewer))
      .map((e) => e.id),
  );
}

/**
 * Supprime un calque après confirmation : son contenu descend dans le calque du dessous (celui
 * du dessus pour le plus bas). Annuler recrée le calque et y remet son contenu.
 */
export async function deleteLayer(engine: MapEngine, id: string): Promise<boolean> {
  const p = persistence(engine);
  const backend = engine.backend;
  const layers = engine.layersBottomUp();
  const index = layers.findIndex((l) => l.id === id);
  const layer = layers[index];
  const dto = layerDto(engine, id);
  if (!p || !backend || !layer || !dto) return false;
  if (layers.length <= 1) {
    engine.notify('Le dernier calque ne se supprime pas.');
    return false;
  }
  const target = layers[index - 1] ?? layers[index + 1]!;
  const content = engine.layerContent(id).filter((e) => e.kind.stacking);
  const ok = await engine.confirm({
    title: `Supprimer le calque « ${layer.name} » ?`,
    message: content.length
      ? `Son contenu (${content.length} élément${content.length > 1 ? 's' : ''}) descend dans « ${target.name} ».`
      : 'Il est vide.',
    confirmLabel: 'Supprimer',
    danger: true,
  });
  if (!ok) return false;

  // Contenu déplacé : même `z`, calque du dessous (le serveur fait de même)
  const moves: ArrangeChange[] = content.map((e) => ({
    collection: e.kind.collection,
    kind: e.kind.stacking!.arrangeKind,
    before: e.data,
    after: engine.placed(e, target.id, e.z),
    from: { layerId: id, z: e.z },
    to: { layerId: target.id, z: e.z },
  }));

  const remove: Command = {
    label: 'Supprimer le calque',
    targets: (ctx) => [
      { collection: LAYERS_COLLECTION, id: ctx.resolve(id) },
      ...moves.map((m) => ({ collection: m.collection, id: ctx.resolve(m.after.id) })),
    ],
    apply(ctx) {
      const s = ctx.store.getState();
      s.remove(LAYERS_COLLECTION, [ctx.resolve(id)]);
      for (const m of moves)
        s.upsert(m.collection, [{ ...m.after, id: ctx.resolve(m.after.id) }], { force: true });
    },
    revert(ctx) {
      const s = ctx.store.getState();
      s.upsert(LAYERS_COLLECTION, [{ ...dto, id: ctx.resolve(id) }], { force: true });
      for (const m of moves)
        s.upsert(m.collection, [{ ...m.before, id: ctx.resolve(m.before.id) }], { force: true });
    },
    async send(ctx) {
      await backend.deleteLayer(ctx.resolve(id), ctx.resolve(target.id));
    },
    inverse: () =>
      groupSequential('Supprimer le calque', [
        createCommand({
          label: 'Supprimer le calque',
          collection: LAYERS_COLLECTION,
          persistence: p,
          items: [dto],
        }),
        ...(moves.length
          ? [
              arrangeCommand({
                label: 'Supprimer le calque',
                send: backend.arrange,
                changes: moves.map((m) => ({
                  ...m,
                  before: m.after,
                  after: m.before,
                  from: m.to,
                  to: m.from,
                })),
              }),
            ]
          : []),
      ]),
  };
  if (engine.ui.getState().activeLayerId === id) engine.setActiveLayer(null);
  return engine.execute(remove);
}

/**
 * Commandes enchaînées (la seconde a besoin du résultat de la première : recréer un calque,
 * puis y remettre son contenu). Contrairement à `groupCommands`, les envois partent l'un après
 * l'autre.
 */
function groupSequential(label: string, commands: readonly Command[]): Command {
  if (commands.length === 1) return commands[0]!;
  const group = groupCommands(label, commands);
  return {
    ...group,
    async send(ctx) {
      for (const c of commands) await c.send(ctx);
    },
    inverse: () =>
      groupSequential(
        label,
        [...commands].reverse().map((c) => c.inverse()),
      ),
  };
}
