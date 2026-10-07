/**
 * Emprunter un portail (docs/carte.md § 10, Portails ; `POST …/portals/:id/use`), hors de
 * React : le serveur décide qui passe et où ; ici, on propose, on envoie, on applique.
 *
 * - Un joueur qui **lâche** son token (glisser, flèches : `engine.onEntitiesMoved`) dans un
 *   portail où il n'était pas : proposition « Emprunter : <nom> » (`state.prompt`), ou passage
 *   aussitôt si le portail est automatique. Arriver dans un portail ne le déclenche pas.
 * - La proposition disparaît si ses tokens quittent la zone, si le portail disparaît, ou sur
 *   « × » / Échap (`dismiss`).
 * - L'emprunt attend que le déplacement soit arrivé au serveur (il vérifie la zone), puis
 *   applique la réponse : tokens déplacés ici, ou partis sur une autre scène (`crossed` : la
 *   vue du joueur suit).
 * - Refus en clair : trop loin, sans destination, portail disparu…
 */
import { translate } from '@/i18n/runtime';
import type { MapPortalUseResult } from '@vtt/contracts';
import { createStore } from 'zustand/vanilla';
import { ApiError, messageErreur } from '@/lib/api';
import { isGm } from '@/lib/map/engine/entities/entity-kind';
import type { MapEngine, MovedEntity } from '@/lib/map/engine/map-engine';
import type { MapDto } from '@/lib/map/store/map-store';
import type { PortalApi } from './api';
import {
  enteredPortal,
  insidePortal,
  PORTALS,
  portalLabel,
  TOKEN_KIND,
  type PortalData,
} from './model';

export type UseTarget = { characterIds: readonly string[] } | { party: true };

export interface PortalPrompt {
  portalId: string;
  characterIds: readonly string[];
}

export interface TravelState {
  /** Proposition « Emprunter : <nom> » (joueur), au-dessus du portail. */
  prompt: PortalPrompt | null;
  /** Portail en cours d'emprunt. */
  busy: string | null;
}

export interface TravelHooks {
  notify(message: string): void;
}

/** Des personnages ont franchi un portail vers une autre scène (la vue du joueur suit). */
export type CrossedListener = (
  result: MapPortalUseResult,
  portal: PortalData,
  party: boolean,
) => void;

/** Message clair d'un refus du serveur. */
export function portalErrorMessage(err: unknown, portal: Pick<PortalData, 'name' | 'icon'>) {
  if (!(err instanceof ApiError)) return messageErreur(err);
  const name = portalLabel(portal);
  switch (err.problem.code) {
    case 'out_of_range':
      return translate('map.portals.errors.outOfRange', { name });
    case 'not_on_map':
      return translate('map.portals.errors.notOnMap');
    case 'portal_without_destination':
      return translate('map.portals.errors.noDestination', { name });
    case 'no_travellers':
      return translate('map.portals.errors.noTravellers');
    case 'character_not_engaged':
      return translate('map.portals.errors.notEngaged');
  }
  if (err.status === 404) return translate('map.portals.errors.gone');
  if (err.status === 403) return translate('map.portals.errors.forbidden');
  return messageErreur(err);
}

export class PortalTravel {
  readonly state = createStore<TravelState>()(() => ({ prompt: null, busy: null }));
  /** Dernier déplacement envoyé : l'emprunt part après lui (le serveur vérifie la zone). */
  private pendingMove: Promise<boolean> = Promise.resolve(true);
  private readonly crossedListeners = new Set<CrossedListener>();

  constructor(
    private readonly engine: MapEngine,
    private readonly api: PortalApi,
    private readonly hooks: TravelHooks,
  ) {}

  attach(): () => void {
    const offMoved = this.engine.onEntitiesMoved((moves, done) => this.onMoved(moves, done));
    const offStore = this.engine.store.subscribe((s, prev) => {
      if (
        s.collections.tokens !== prev.collections.tokens ||
        s.collections[PORTALS] !== prev.collections[PORTALS]
      )
        this.checkPrompt();
    });
    return () => {
      offMoved();
      offStore();
      this.state.setState({ prompt: null, busy: null });
    };
  }

  /** Écoute les passages vers une autre scène ; renvoie le retrait. */
  onCrossed(listener: CrossedListener): () => void {
    this.crossedListeners.add(listener);
    return () => void this.crossedListeners.delete(listener);
  }

  portal(id: string): PortalData | undefined {
    return this.engine.store.getState().collections[PORTALS]?.get(id) as PortalData | undefined;
  }

  private portals(): PortalData[] {
    return [...(this.engine.store.getState().collections[PORTALS]?.values() ?? [])] as PortalData[];
  }

  /**
   * Personnages dont le token est dans la zone (position enregistrée) : pour un joueur, les
   * siens ; pour le MJ, tous.
   */
  charactersInside(p: Pick<PortalData, 'pos' | 'radius'>): string[] {
    const viewer = this.engine.viewer;
    const out = new Set<string>();
    for (const e of this.engine.entitiesOfKind(TOKEN_KIND)) {
      const characterId = (e.data as { characterId?: unknown }).characterId;
      if (typeof characterId !== 'string') continue;
      if (!isGm(viewer) && !viewer.characterIds.includes(characterId)) continue;
      if (insidePortal(p, e.geometry)) out.add(characterId);
    }
    return [...out];
  }

  /** Un joueur a lâché ses tokens : ceux qui entrent dans un portail l'empruntent (ou on le propose). */
  private onMoved(moves: readonly MovedEntity[], done: Promise<boolean>) {
    const viewer = this.engine.viewer;
    if (viewer.role !== 'player') return;
    this.pendingMove = done;
    const portals = this.portals();
    const entered = new Map<string, { portal: PortalData; ids: string[] }>();
    for (const m of moves) {
      if (m.entity.kind.id !== TOKEN_KIND) continue;
      const characterId = (m.entity.data as { characterId?: unknown }).characterId;
      if (typeof characterId !== 'string' || !viewer.characterIds.includes(characterId)) continue;
      const p = enteredPortal(portals, m.from, m.to);
      if (!p) continue;
      const group = entered.get(p.id) ?? { portal: p, ids: [] };
      group.ids.push(characterId);
      entered.set(p.id, group);
    }
    let prompt: PortalPrompt | null = null;
    for (const { portal, ids } of entered.values()) {
      if (portal.auto) void this.use(portal, { characterIds: ids });
      else prompt ??= { portalId: portal.id, characterIds: ids };
    }
    if (prompt) this.state.setState({ prompt });
  }

  /** La proposition tient tant que ses tokens sont dans la zone. */
  private checkPrompt() {
    const prompt = this.state.getState().prompt;
    if (!prompt) return;
    const p = this.portal(prompt.portalId);
    const still = p
      ? this.charactersInside(p).filter((id) => prompt.characterIds.includes(id))
      : [];
    if (!still.length) this.state.setState({ prompt: null });
    else if (still.length !== prompt.characterIds.length)
      this.state.setState({ prompt: { ...prompt, characterIds: still } });
  }

  dismiss() {
    if (this.state.getState().prompt) this.state.setState({ prompt: null });
  }

  /** Emprunte le portail ; renvoie vrai si le serveur a fait passer. */
  async use(portal: PortalData, target: UseTarget): Promise<boolean> {
    if (this.state.getState().busy) return false;
    this.state.setState({ busy: portal.id, prompt: null });
    try {
      // Le déplacement d'abord : le serveur vérifie que le token est dans la zone
      if (!(await this.pendingMove)) return false;
      const party = 'party' in target;
      const result = await this.api.use(
        portal.id,
        party ? { party: true } : { characterIds: [...target.characterIds] },
      );
      this.apply(result);
      if (result.mapId !== this.engine.store.getState().mapId)
        for (const listener of this.crossedListeners) listener(result, portal, party);
      return true;
    } catch (err) {
      this.hooks.notify(portalErrorMessage(err, portal));
      return false;
    } finally {
      this.state.setState({ busy: null });
    }
  }

  /** Réponse du serveur : tokens arrivés ici, ou partis (un personnage n'est que sur une carte). */
  private apply(result: MapPortalUseResult) {
    const s = this.engine.store.getState();
    const here = result.items.filter((t) => t.mapId === s.mapId);
    if (here.length) s.upsert('tokens', here as unknown as MapDto[]);
    const gone = new Set(result.items.filter((t) => t.mapId !== s.mapId).map((t) => t.characterId));
    if (!gone.size) return;
    const ids = [...(s.collections.tokens?.values() ?? [])]
      .filter((t) => gone.has(String(t.characterId)))
      .map((t) => t.id);
    if (ids.length) s.remove('tokens', ids);
  }
}
