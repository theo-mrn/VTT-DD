/**
 * Opérations des mesures (docs/carte.md § 10, Mesures) : ma mesure au direct, son effacement,
 * « Épingler » (un gabarit durable, une commande annulable), modifications et effacement des
 * gabarits, personnages dans la zone.
 */
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';
import type { LiveAudience, LiveMeasure } from '../../live/live-channel';
import {
  createCommand,
  deleteCommand,
  tempId,
  updateCommand,
  type Persistence,
} from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import type { LocalMeasure, MeasureModule } from './context';
import { EPHEMERAL_FADE_MS, EPHEMERAL_MS } from './live-measures';
import {
  MEASUREMENT_KIND,
  MEASUREMENTS,
  zoneContains,
  type MeasureSpec,
  type MeasurementData,
} from './model';

const TOKEN_KIND = 'token';

/** Audience de mes mesures au direct : MJ seulement si le MJ les garde pour lui. */
export function liveAudience(ctx: MeasureModule): LiveAudience {
  return ctx.engine.viewer.role === 'gm' && !ctx.settings.getState().shared ? 'gm' : 'public';
}

/** Options d'une forme telles que le direct les porte (nombres et textes courts). */
function liveOptions(options: Readonly<Record<string, unknown>>) {
  const out: Record<string, number | string> = {};
  for (const [k, v] of Object.entries(options))
    if (typeof v === 'number' || (typeof v === 'string' && v.length <= 40)) out[k] = v;
  return out;
}

export function toLive(m: LocalMeasure, pinned = false): LiveMeasure {
  return {
    id: m.id,
    shape: m.spec.shape,
    from: [m.spec.start.x, m.spec.start.y],
    to: [m.spec.end.x, m.spec.end.y],
    color: m.color,
    skin: m.skin,
    options: liveOptions(m.spec.options),
    ...(pinned ? { pinned: true as const } : {}),
  };
}

/** Ma mesure change : elle part au direct (15 Hz au plus, le canal regroupe). */
export function setLocal(ctx: MeasureModule, m: LocalMeasure | null, send = true) {
  ctx.local.setState({ measure: m });
  if (send && m && m.phase === 'drawing') ctx.engine.live?.measure(toLive(m), liveAudience(ctx));
  ctx.engine.invalidate();
}

const timers = new WeakMap<MeasureModule, ReturnType<typeof setTimeout>[]>();

function clearTimers(ctx: MeasureModule) {
  for (const t of timers.get(ctx) ?? []) clearTimeout(t);
  timers.delete(ctx);
}

/**
 * Fin du geste : la mesure reste `EPHEMERAL_MS` chez tous (« Épingler » chez moi), puis
 * s'efface. Les autres l'effacent d'eux-mêmes au même moment.
 */
export function release(ctx: MeasureModule, m: LocalMeasure) {
  const engine = ctx.engine;
  clearTimers(ctx);
  const recent: LocalMeasure = { ...m, phase: 'recent', releasedAt: engine.now() };
  ctx.local.setState({ measure: recent });
  engine.live?.measure(toLive(recent), liveAudience(ctx));
  engine.live?.end();
  timers.set(ctx, [
    // Début de l'effacement : une image à ce moment-là (rendu à la demande)
    setTimeout(() => engine.invalidate(), EPHEMERAL_MS),
    setTimeout(() => {
      if (ctx.local.getState().measure?.id === recent.id) ctx.local.setState({ measure: null });
      engine.invalidate();
    }, EPHEMERAL_MS + EPHEMERAL_FADE_MS),
  ]);
  engine.invalidate();
}

/** Efface ma mesure (Échap, « Effacer ») ; `broadcast` : chez les autres aussi. */
export function clearLocal(ctx: MeasureModule, broadcast = true) {
  clearTimers(ctx);
  if (!ctx.local.getState().measure) return;
  ctx.local.setState({ measure: null });
  if (broadcast) {
    ctx.engine.live?.measure(null, liveAudience(ctx));
    ctx.engine.live?.end();
  }
  ctx.engine.invalidate();
}

/** Gabarit durable tiré d'une mesure (identifiant provisoire). */
export function templateDraft(ctx: MeasureModule, m: LocalMeasure): MeasurementData {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    id: tempId(),
    mapId: ctx.engine.store.getState().mapId,
    version: 0,
    updatedAt: '',
    shape: m.spec.shape,
    start: { x: r(m.spec.start.x), y: r(m.spec.start.y) },
    end: { x: r(m.spec.end.x), y: r(m.spec.end.y) },
    color: m.color,
    skin: m.skin,
    options: { ...m.spec.options },
    createdBy: ctx.engine.viewer.userId,
  } as MeasurementData;
}

/**
 * Épingle ma mesure (en cours de geste au lâcher, ou récente) : un gabarit durable, une
 * commande annulable ; il est sélectionné. Chez les autres, le fantôme attend son arrivée.
 */
export function pin(ctx: MeasureModule, m = ctx.local.getState().measure): Promise<boolean> | null {
  if (!m || m.phase === 'reshape') return null;
  const engine = ctx.engine;
  const draft = templateDraft(ctx, m);
  const done = engine.execute(
    createCommand({
      label: 'Épingler la mesure',
      collection: MEASUREMENTS,
      persistence: ctx.persistence,
      items: [draft],
    }),
  );
  engine.selection.replace([draft.id]);
  engine.live?.measure(toLive(m, true), liveAudience(ctx));
  engine.live?.end();
  clearTimers(ctx);
  ctx.local.setState({ measure: null });
  engine.invalidate();
  return done;
}

/** Persistance des gabarits : `start` et `end` partent toujours ensemble (contrat). */
export function measurementPersistence(base: Persistence<MapDto>): Persistence<MeasurementData> {
  const p = base as unknown as Persistence<MeasurementData>;
  return {
    ...p,
    update: (updates) =>
      p.update(
        updates.map((u) =>
          'start' in u.changes || 'end' in u.changes
            ? { ...u, changes: { ...u.changes, start: u.after.start, end: u.after.end } }
            : u,
        ),
      ),
  };
}

const isTemplate = (e: MapEntity) => e.kind.id === MEASUREMENT_KIND;

/** Gabarits que ce viewer peut modifier (auteur ou MJ). */
export const editable = (engine: MapEngine, entities: readonly MapEntity[]) =>
  entities.filter((e) => isTemplate(e) && e.kind.can('move', e, engine.viewer));

/** Modifie des gabarits (couleur, options, effet) : une commande pour toute la sélection. */
export function updateTemplates(
  ctx: MeasureModule,
  label: string,
  entities: readonly MapEntity[],
  patch: (d: MeasurementData) => MeasurementData,
): Promise<boolean> | null {
  const changes = editable(ctx.engine, entities).flatMap((e) => {
    const before = e.data as MeasurementData;
    const after = patch(before);
    return after === before ? [] : [{ before, after }];
  });
  if (!changes.length) return null;
  return ctx.engine.execute(
    updateCommand({ label, collection: MEASUREMENTS, persistence: ctx.persistence, changes }),
  );
}

/** Efface mes gabarits, ou tous (MJ) : une commande annulable (⌘Z les fait revenir). */
export function clearTemplates(ctx: MeasureModule, all: boolean): Promise<boolean> | null {
  const { engine } = ctx;
  const items = engine
    .entitiesOfKind(MEASUREMENT_KIND)
    .filter((e) =>
      all
        ? e.kind.can('delete', e, engine.viewer)
        : (e.data as MeasurementData).createdBy === engine.viewer.userId,
    )
    .map((e) => e.data as MeasurementData);
  if (!items.length) return null;
  return engine.execute(
    deleteCommand({
      label: all ? 'Effacer tous les gabarits' : 'Effacer mes gabarits',
      collection: MEASUREMENTS,
      persistence: ctx.persistence,
      items,
    }),
  );
}

/** Tokens vus (aucun masque) dont le centre est dans la zone. */
export function tokensInZone(engine: MapEngine, spec: MeasureSpec): MapEntity[] {
  const ppu = engine.kindContext().pixelsPerUnit;
  return engine
    .entitiesOfKind(TOKEN_KIND)
    .filter((t) => !t.masks.size && zoneContains(spec, t.current, ppu));
}
