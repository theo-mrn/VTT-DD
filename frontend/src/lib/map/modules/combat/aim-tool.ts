/**
 * Outil de visée du menu d'attaque (docs/combat.md § 12.1, § 12.5) : lancé par le menu
 * (« Viser sur la carte »), ou par le clic d'un joueur sur un PNJ (visée rapide), hors de la
 * barre d'outils. Il ne touche que les tokens et ne vole aucun geste de la vue : un glisser,
 * dans le vide comme sur un token, déplace la carte.
 *
 * | État      | Entrée                                        | Sortie                                   |
 * | --------- | --------------------------------------------- | ---------------------------------------- |
 * | `idle`    | bouton sur un token : il est visé             | → `picked`                               |
 * |           | bouton dans le vide                           | → `void`                                 |
 * | `picked`  | lâcher : la visée continue ou rend la main    | (le menu dit laquelle, `pick`)           |
 * | `void`    | +4 px → `panning` ; lâcher → clic dans le vide | (visée rapide : l'attaque est annulée)  |
 * | `panning` | la carte suit le pointeur                     | lâcher → la vue reste là                 |
 * | —         | Échap, autre outil                            | visée finie (`exit`)                     |
 */
import type { MapEntity } from '../../engine/entities/entity';
import { exceedsThreshold } from '../../engine/interaction/drag';
import type { MapEngine } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import { characterOf, isToken } from './model';

export const AIM_TOOL_ID = 'combat-aim';

export interface AimToolHandlers {
  /**
   * Un token visé (⇧ ou non) : son personnage est pris, ajouté ou retiré ; renvoie vrai si
   * la visée continue, faux si elle rend la main au lâcher.
   */
  pick(characterId: string, shift: boolean): boolean;
  /** Clic simple dans le vide (sans glisser). */
  voidClick?(): void;
  /** L'outil est quitté (Échap, autre outil, visée finie). */
  exit(): void;
}

export class AimTool implements Tool {
  readonly id = AIM_TOOL_ID;
  state: 'idle' | 'picked' | 'void' | 'panning' = 'idle';
  private finish = false;
  private start: MapPointer | null = null;
  private panFrom: { x: number; y: number } | null = null;

  constructor(private readonly handlers: AimToolHandlers) {}

  cursor() {
    return this.state === 'panning' ? 'grabbing' : 'crosshair';
  }

  targets(e: MapEntity) {
    return isToken(e);
  }

  move(e: MapPointer, engine: MapEngine) {
    if (this.state === 'void' && this.start && exceedsThreshold(this.start.screen, e.screen)) {
      // Glisser dans le vide : la carte se déplace, ce n'est plus un clic
      this.state = 'panning';
      engine.camera.cancelAnimation();
      engine.camera.panBy(e.screen.x - this.start.screen.x, e.screen.y - this.start.screen.y);
      this.panFrom = e.screen;
      engine.refreshCursor();
      return;
    }
    if (this.state === 'panning' && this.panFrom) {
      engine.camera.panBy(e.screen.x - this.panFrom.x, e.screen.y - this.panFrom.y);
      this.panFrom = e.screen;
      return;
    }
    if (e.buttons === 0) engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || e.alt) return false;
    const hit = engine.hitTest(e.world);
    const characterId = hit ? characterOf(hit) : null;
    if (!characterId) {
      // Le vide (ou un brouillon) : un clic, ou le début d'un glisser de la vue
      this.state = 'void';
      this.start = e;
      return true;
    }
    this.finish = !this.handlers.pick(characterId, e.shift);
    this.state = 'picked';
    engine.invalidate();
    return true;
  }

  up(_e: MapPointer, engine: MapEngine) {
    const state = this.state;
    const finish = this.finish;
    this.reset();
    if (state === 'void') this.handlers.voidClick?.();
    else if (state === 'panning') engine.cameraSettled();
    engine.refreshCursor();
    if (state === 'picked' && finish) engine.tools.activate(SELECT_TOOL_ID);
  }

  cancel(engine: MapEngine): boolean {
    const had = this.state !== 'idle';
    if (this.state === 'panning') engine.cameraSettled();
    this.reset();
    return had;
  }

  deactivate(engine: MapEngine) {
    if (this.state === 'panning') engine.cameraSettled();
    this.reset();
    engine.setHovered(null);
    // Après le changement d'outil (le gestionnaire n'a pas encore changé d'outil actif)
    queueMicrotask(() => this.handlers.exit());
  }

  private reset() {
    this.state = 'idle';
    this.finish = false;
    this.start = null;
    this.panFrom = null;
  }
}
