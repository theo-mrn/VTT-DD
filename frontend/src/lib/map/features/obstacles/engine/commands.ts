/**
 * Commandes des obstacles : un `EditPlan` devient **une** commande annulable, un `/batch` par
 * couche touchée (murs, pièces). Ouvrir une porte est une commande hors de la pile d'annulation
 * (comme avant : c'est du jeu, pas de l'édition).
 */
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import {
  batchCommand,
  groupCommands,
  updateCommand,
  type Command,
  type Persistence,
} from '@/lib/map/store/commands';
import type { MapDto } from '@/lib/map/store/map-store';
import type { EditPlan } from './edits';
import { OBSTACLES, ROOMS, type ObstacleData, type RoomData } from './model';

export interface ObstaclePersistences {
  obstacles: Persistence<ObstacleData>;
  rooms: Persistence<RoomData>;
}

/** Persistance hors ligne (moteur sans serveur) : répond ce qu'on lui envoie. */
export function echoPersistence<D extends MapDto>(): Persistence<D> {
  return {
    create: async (drafts) => drafts.map((d) => ({ ...d })),
    update: async (updates) => updates.map((u) => ({ ...u.after, version: u.version + 1 })),
    remove: async () => undefined,
  };
}

/** Le plan en une commande (null s'il n'y a rien à écrire). */
export function planCommand(
  label: string,
  plan: EditPlan,
  persistences: ObstaclePersistences,
): Command | null {
  const r = plan.result();
  const cmds: Command[] = [];
  if (r.obstacles.create.length || r.obstacles.update.length || r.obstacles.remove.length)
    cmds.push(
      batchCommand({
        label,
        collection: OBSTACLES,
        persistence: persistences.obstacles,
        ...r.obstacles,
      }),
    );
  if (r.rooms.create.length || r.rooms.update.length || r.rooms.remove.length)
    cmds.push(
      batchCommand({ label, collection: ROOMS, persistence: persistences.rooms, ...r.rooms }),
    );
  return cmds.length ? groupCommands(label, cmds) : null;
}

/** Exécute le plan ; renvoie la promesse de l'envoi, ou null s'il n'y avait rien à écrire. */
export function executePlan(
  engine: MapEngine,
  label: string,
  plan: EditPlan,
  persistences: ObstaclePersistences,
): Promise<boolean> | null {
  const cmd = planCommand(label, plan, persistences);
  return cmd ? engine.execute(cmd) : null;
}

/** Modifie des champs d'obstacles (inspecteur, menus) : une commande. */
export function patchObstacles(
  engine: MapEngine,
  entities: readonly MapEntity[],
  patch: (o: ObstacleData) => Partial<ObstacleData>,
  label: string,
  persistence: Persistence<ObstacleData>,
  options?: { undoable?: boolean },
): Promise<boolean> | null {
  const changes = entities.flatMap((e) => {
    const before = e.data as ObstacleData;
    const after = { ...before, ...patch(before) };
    return Object.keys(patch(before)).some(
      (k) => (before as Record<string, unknown>)[k] !== (after as Record<string, unknown>)[k],
    )
      ? [{ before, after }]
      : [];
  });
  if (!changes.length) return null;
  return engine.execute(
    updateCommand({ label, collection: OBSTACLES, persistence, changes }),
    options,
  );
}

/** Modifie des pièces (nom). */
export function patchRooms(
  engine: MapEngine,
  entities: readonly MapEntity[],
  patch: (r: RoomData) => Partial<RoomData>,
  label: string,
  persistence: Persistence<RoomData>,
): Promise<boolean> | null {
  const changes = entities.map((e) => {
    const before = e.data as RoomData;
    return { before, after: { ...before, ...patch(before) } };
  });
  if (!changes.length) return null;
  return engine.execute(updateCommand({ label, collection: ROOMS, persistence, changes }));
}
