/**
 * Sorte `portal` (docs/carte.md § 10, Portails) : un portail est une entrée, élément comme les
 * autres (sélection, glisser avec l'outil X, Suppr, ⌘Z, ⌘D, menu, barre, inspecteur).
 *
 * - Plan `gm` (au-dessus de l'ombre), réservée à l'outil portails ; hors de lui, touchée en
 *   dernier recours, sur son icône seulement : un token posé sur un portail reste prioritaire.
 * - « Masquer aux joueurs » et « Montrer » : `visible`.
 * - Pour un joueur : montrée (et touchée) seulement si son centre ou un point de sa zone est
 *   dans sa vue (`visionSamples`) ; « Emprunter » dans la barre de la sélection si un de ses
 *   tokens est dans la zone, « Trop loin » grisé sinon.
 */
import {
  ArrowRightLeft,
  DoorOpen,
  Focus,
  Link2Off,
  LogIn,
  MapPinned,
  Users,
  UsersRound,
  Zap,
} from 'lucide-react';
import type { MapEntity } from '../../engine/entities/entity';
import {
  isGm,
  type EntityAction,
  type EntityKind,
  type MapViewer,
  type MenuItem,
} from '../../engine/entities/entity-kind';
import type { MapEngine } from '../../engine/map-engine';
import { updateCommand, type Persistence } from '../../store/commands';
import type { MapDto } from '../../store/map-store';
import type { PortalApi } from './api';
import {
  hasDestination,
  PORTAL_KIND,
  portalLabel,
  PORTALS,
  PORTALS_TOOL_ID,
  roundPoint,
  type PortalData,
  type SceneRef,
} from './model';
import type { PortalTravel } from './travel';
import { PORTAL_ICON_PX, type PortalView } from './view';

const portalOf = (e: MapEntity) => e.data as PortalData;

/** Ce que partagent la sorte, l'outil, l'emprunt et l'interface. */
export interface PortalContext {
  engine: MapEngine;
  persistence: Persistence<MapDto>;
  api: PortalApi;
  view: PortalView;
  travel: PortalTravel;
  /** Scènes de la campagne (MJ), données par React. */
  scenes(): readonly SceneRef[];
  /** Ouvre une scène à la table (MJ, `?scene=`) ; null : celle du groupe. */
  openScene?(mapId: string | null): void;
  /** Pose le retour d'un portail (outil). */
  placeReturn(portal: PortalData): void;
}

/** Modifie des portails : une commande (rien si rien ne change). */
export function patchPortals(
  ctx: Pick<PortalContext, 'engine' | 'persistence'>,
  entities: readonly MapEntity[],
  patch: (p: PortalData) => Partial<PortalData>,
  label: string,
) {
  const changes = entities.flatMap((e) => {
    const before = portalOf(e);
    const p = patch(before);
    const changed = Object.entries(p).some(
      ([k, v]) => JSON.stringify((before as Record<string, unknown>)[k]) !== JSON.stringify(v),
    );
    return changed ? [{ before: before as MapDto, after: { ...before, ...p } as MapDto }] : [];
  });
  if (!changes.length) return null;
  return ctx.engine.execute(
    updateCommand({ label, collection: PORTALS, persistence: ctx.persistence, changes }),
  );
}

/** Droits, miroir du serveur : tous voient et sélectionnent, le MJ fait le reste. */
const portalCan = (action: EntityAction, _e: MapEntity, viewer: MapViewer) =>
  action === 'view' || action === 'select' || isGm(viewer);

/** Nom d'une scène connue, sinon un libellé neutre. */
export const sceneName = (ctx: Pick<PortalContext, 'scenes'>, id: string | null) =>
  ctx.scenes().find((s) => s.id === id)?.name ?? 'une autre scène';

/** Entrées du menu d'un portail (MJ) et « Emprunter » (joueur). */
export function portalActions(ctx: PortalContext, entities: readonly MapEntity[]): MenuItem[] {
  const { engine, travel } = ctx;
  const single = entities.length === 1 ? entities[0]! : null;
  if (!isGm(engine.viewer)) {
    if (!single) return [];
    const p = portalOf(single);
    const mine = travel.charactersInside(p);
    return [
      {
        id: 'portal:use',
        label: mine.length ? 'Emprunter' : 'Trop loin',
        icon: LogIn,
        primary: true,
        forPlayers: true,
        disabled: !mine.length,
        run: () => void travel.use(p, { characterIds: mine }),
      },
    ];
  }
  const items: MenuItem[] = [];
  if (single) {
    const p = portalOf(single);
    const inside = travel.charactersInside(p);
    const ready = hasDestination(p);
    items.push(
      {
        id: 'portal:party',
        label: 'Faire passer tout le groupe',
        icon: Users,
        disabled: !ready,
        run: () => void travel.use(p, { party: true }),
      },
      {
        id: 'portal:zone',
        label: inside.length
          ? `Faire passer la zone (${inside.length})`
          : 'Faire passer la zone (personne)',
        icon: UsersRound,
        disabled: !ready || !inside.length,
        run: () => void travel.use(p, { characterIds: inside }),
      },
    );
    if (p.kind === 'same_map' && p.target) {
      const twin = p.linkedPortalId ? engine.entity(p.linkedPortalId) : undefined;
      items.push({
        id: 'portal:goto',
        label: twin ? 'Aller au retour' : 'Aller à l’arrivée',
        icon: Focus,
        run: () => {
          if (twin) engine.selection.replace([twin.id]);
          engine.focusOn(p.target!);
        },
      });
    } else if (p.kind === 'scene_change' && p.targetMapId && ctx.openScene)
      items.push({
        id: 'portal:open',
        label: `Ouvrir « ${sceneName(ctx, p.targetMapId)} »`,
        icon: MapPinned,
        run: () => ctx.openScene?.(p.targetMapId),
      });
    if (p.linkedPortalId)
      items.push({
        id: 'portal:unlink',
        label: 'Délier le retour',
        icon: Link2Off,
        run: () =>
          void patchPortals(ctx, [single], () => ({ linkedPortalId: null }), 'Délier le retour'),
      });
    else if (ready)
      items.push({
        id: 'portal:return',
        label: 'Poser le retour',
        icon: ArrowRightLeft,
        run: () => ctx.placeReturn(p),
      });
  }
  const allAuto = entities.every((e) => portalOf(e).auto);
  items.push({
    id: 'portal:auto',
    label: 'Automatique',
    icon: Zap,
    checked: allAuto,
    run: () =>
      void patchPortals(
        ctx,
        entities,
        () => ({ auto: !allAuto }),
        allAuto ? 'Portail sur demande' : 'Portail automatique',
      ),
  });
  return items;
}

const samplesCache = new WeakMap<MapDto, Float64Array>();

/** Points d'échantillon de la vue : le centre, et huit points à 0,7 × le rayon de la zone. */
export function portalSamples(x: number, y: number, radius: number): Float64Array {
  const out = new Float64Array(18);
  out[0] = x;
  out[1] = y;
  const r = radius * 0.7;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out[2 + i * 2] = x + Math.cos(a) * r;
    out[3 + i * 2] = y + Math.sin(a) * r;
  }
  return out;
}

export function portalKind(ctx: PortalContext): EntityKind<MapDto> {
  const { engine, view } = ctx;
  return {
    id: PORTAL_KIND,
    label: 'Portail',
    collection: PORTALS,
    capabilities: ['select', 'move', 'hide', 'duplicate', 'delete', 'inspect'],
    plane: 'gm',
    editTool: PORTALS_TOOL_ID,
    pickOutsideTool: true,
    selfOutline: true,
    selfHiddenMark: true,
    showsName: true,
    transformDisplay: false,
    geometry: (d) => {
      const p = d as PortalData;
      return { x: p.pos.x, y: p.pos.y, width: 0, height: 0, rotation: 0 };
    },
    applyGeometry: (d, g) => ({ ...(d as PortalData), pos: roundPoint(g) }),
    hidden: {
      get: (d) => !(d as PortalData).visible,
      set: (d, hidden) => ({ ...(d as PortalData), visible: !hidden }),
    },
    name: (d) => portalLabel(d as PortalData),
    can: portalCan,
    // L'icône seulement : la zone ne vole pas le clic de la carte
    hitTest: (e, p, tol) =>
      Math.hypot(p.x - e.current.x, p.y - e.current.y) <=
      (PORTAL_ICON_PX + 2) / engine.camera.zoom + tol,
    bounds: (e) => {
      const r = Math.max(view.radiusOf(e), 24);
      return { x: e.current.x - r, y: e.current.y - r, width: 2 * r, height: 2 * r };
    },
    visionSamples: (e) => {
      if (e.preview) return portalSamples(e.current.x, e.current.y, portalOf(e).radius);
      let samples = samplesCache.get(e.data);
      if (!samples) {
        const p = portalOf(e);
        samples = portalSamples(p.pos.x, p.pos.y, p.radius);
        samplesCache.set(e.data, samples);
      }
      return samples;
    },
    render: (e) => view.mount(e),
    update: (e) => view.draw(e),
    dispose: (e) => view.unmount(e),
    actions: (entities) => portalActions(ctx, entities),
    // Une copie n'est pas reliée : elle garde la destination
    duplicate: (d, offset) => {
      const p = d as PortalData;
      return {
        ...p,
        linkedPortalId: null,
        pos: roundPoint({ x: p.pos.x + offset.x, y: p.pos.y + offset.y }),
      };
    },
    // Masqué aux joueurs : son direct reste chez le MJ
    liveAudience: (e) => (portalOf(e).visible ? 'public' : 'gm'),
    persistence: ctx.persistence as never,
  };
}

/** Icône de la porte, pour les menus des tokens (une porte vers ailleurs). */
export const portalMenuIcon = DoorOpen;
