/**
 * Fouille d'un objet par un joueur (docs/carte.md § 10, Objets ; docs/api-map.md, « Fouille
 * des objets ») : l'état de la fenêtre du contenu, hors de React.
 *
 * - `open(objectId)` : personnage proposé = celui que le joueur incarne s'il est à portée,
 *   sinon le plus proche à portée ; puis `POST …/search` (le MJ en est prévenu).
 * - `take(itemId, quantity)` : `POST …/take` avec le personnage choisi ; la réponse remplace le
 *   contenu affiché ; le personnage reçoit l'objet dans son inventaire (`onTaken` : relire sa
 *   fiche).
 * - Refus du serveur traduits en français clair (hors de portée, déjà pris, service des
 *   personnages injoignable…). Un contenu qui a changé entre-temps est relu.
 */
import { formatter, translate } from '@/i18n/runtime';
import type { MapObjectSearchResult } from '@vtt/contracts';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ApiError, messageErreur } from '@/lib/api';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import type { SearchApi } from './api';
import { quantityLabel } from './contents';
import { reachOf } from './object-kind';
import { preferredSearcher } from './reach';
import { OBJECTS_COLLECTION, type ObjectData } from './types';

export type SearchStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface SearchState {
  /** Objet fouillé (fenêtre ouverte), sinon null. */
  objectId: string | null;
  /** Personnage qui fouille et qui prend. */
  characterId: string | null;
  status: SearchStatus;
  /** Contenu rendu par le serveur (version comprise). */
  result: MapObjectSearchResult | null;
  error: string | null;
  /** Contenu en cours de prise. */
  taking: string | null;
}

const CLOSED: SearchState = {
  objectId: null,
  characterId: null,
  status: 'idle',
  result: null,
  error: null,
  taking: null,
};

/** Message clair d'un refus de la fouille ou de la prise. */
export function searchErrorMessage(
  err: unknown,
  ctx: { characterName: string; reach?: string; action: 'search' | 'take' },
): string {
  if (!(err instanceof ApiError)) return messageErreur(err);
  switch (err.problem.code) {
    case 'out_of_range':
      return ctx.reach
        ? translate('map.objects.errors.tooFarReach', { name: ctx.characterName, reach: ctx.reach })
        : translate('map.objects.errors.tooFar', { name: ctx.characterName });
    case 'not_searchable':
      return translate('map.objects.errors.notSearchable');
    case 'character_not_engaged':
      return translate('map.objects.errors.notEngaged', { name: ctx.characterName });
    case 'quantity_exceeded':
      return translate('map.objects.errors.quantityExceeded');
    case 'character_unavailable':
      return translate('map.objects.errors.unavailable');
  }
  if (err.status === 404)
    return ctx.action === 'take'
      ? translate('map.objects.errors.alreadyTaken')
      : translate('map.objects.errors.gone');
  if (err.status === 403)
    return translate('map.objects.errors.forbidden', { name: ctx.characterName });
  return messageErreur(err);
}

export interface SearchHooks {
  /** Toast d'information (prise réussie). */
  notify(message: string): void;
}

export class SearchController {
  readonly state: StoreApi<SearchState> = createStore<SearchState>()(() => CLOSED);
  private seq = 0;
  private readonly takenListeners = new Set<(characterId: string) => void>();

  constructor(
    private readonly engine: MapEngine,
    private readonly api: SearchApi,
    private readonly hooks: SearchHooks,
  ) {}

  private get s() {
    return this.state.getState();
  }

  /** Un personnage a reçu un objet (la fenêtre relit sa fiche). */
  onTaken(listener: (characterId: string) => void): () => void {
    this.takenListeners.add(listener);
    return () => void this.takenListeners.delete(listener);
  }

  characterName(id: string | null): string {
    if (!id) return translate('map.objects.yourCharacter');
    return (
      this.engine.directory.characters().find((c) => c.id === id)?.name ??
      translate('map.objects.yourCharacter')
    );
  }

  private object(id: string): ObjectData | undefined {
    return this.engine.store.getState().collections[OBJECTS_COLLECTION]?.get(id) as
      ObjectData | undefined;
  }

  /** Portée lisible (« 1,5 m »). */
  reachText(o: ObjectData | undefined): string | undefined {
    if (!o) return undefined;
    const unit = this.engine.kindContext().unitName;
    return `${formatter().number(o.searchRadius ?? 0)} ${unit}`;
  }

  /** Ouvre la fenêtre et fouille avec le personnage proposé (ou celui donné). */
  open(objectId: string, characterId?: string) {
    const o = this.object(objectId);
    const reach = o ? reachOf(this.engine, o) : [];
    const chosen =
      characterId ??
      preferredSearcher(reach, this.engine.viewer.characterIds) ??
      reach[0]?.characterId ??
      this.engine.viewer.characterIds[0] ??
      null;
    this.state.setState({ ...CLOSED, objectId, characterId: chosen });
    void this.search();
  }

  /** Change de personnage (un autre à portée) et refouille. */
  setCharacter(characterId: string) {
    if (!this.s.objectId || characterId === this.s.characterId) return;
    this.state.setState({ characterId });
    void this.search();
  }

  close() {
    this.seq++;
    this.state.setState(CLOSED);
  }

  /** Fouille (ou relit le contenu). */
  async search(): Promise<void> {
    const { objectId, characterId } = this.s;
    if (!objectId) return;
    const seq = ++this.seq;
    if (!characterId) {
      this.state.setState({
        status: 'error',
        error: translate('map.objects.noCharacterHere'),
      });
      return;
    }
    this.state.setState({ status: 'loading', error: null });
    try {
      const result = await this.api.search(objectId, characterId);
      if (seq !== this.seq) return;
      this.state.setState({ status: 'ready', result, error: null });
    } catch (err) {
      if (seq !== this.seq) return;
      this.state.setState({
        status: 'error',
        error: searchErrorMessage(err, {
          characterName: this.characterName(characterId),
          reach: this.reachText(this.object(objectId)),
          action: 'search',
        }),
      });
    }
  }

  /** Prend `quantity` (défaut : tout) d'un contenu. Renvoie vrai si c'est fait. */
  async take(itemId: string, quantity?: number): Promise<boolean> {
    const { objectId, characterId, taking } = this.s;
    if (!objectId || !characterId || taking) return false;
    const seq = this.seq;
    this.state.setState({ taking: itemId, error: null });
    try {
      const r = await this.api.take(objectId, {
        characterId,
        itemId,
        ...(quantity !== undefined ? { quantity } : {}),
      });
      if (seq !== this.seq) return true;
      this.state.setState({ taking: null, result: r.object, status: 'ready' });
      this.hooks.notify(
        `${this.characterName(characterId)} a pris ${quantityLabel(r.taken.name, r.taken.quantity)}.`,
      );
      for (const l of this.takenListeners) l(characterId);
      return true;
    } catch (err) {
      if (seq === this.seq) await this.takeFailed(err, seq, objectId, characterId);
      return false;
    }
  }

  /** Prise refusée : le message s'affiche ; contenu changé, il est relu (message gardé). */
  private async takeFailed(err: unknown, seq: number, objectId: string, characterId: string) {
    const stale =
      err instanceof ApiError && (err.status === 404 || err.problem.code === 'quantity_exceeded');
    this.state.setState({
      taking: null,
      error: searchErrorMessage(err, {
        characterName: this.characterName(characterId),
        reach: this.reachText(this.object(objectId)),
        action: 'take',
      }),
    });
    if (!stale) return;
    const error = this.s.error;
    await this.search();
    if (seq + 1 === this.seq && this.s.status === 'ready') this.state.setState({ error });
  }
}

const controllers = new WeakMap<MapEngine, SearchController>();

/** Fouille de la carte montée (créée par le module). */
export const searchControllerOf = (engine: MapEngine) => controllers.get(engine) ?? null;

export function attachSearchController(engine: MapEngine, controller: SearchController) {
  controllers.set(engine, controller);
  return () => {
    if (controllers.get(engine) === controller) controllers.delete(engine);
    controller.close();
  };
}
