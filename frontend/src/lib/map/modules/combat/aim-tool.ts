/**
 * Outil de visée du menu d'attaque (docs/combat.md § 12.1, 4 ; § 12.5) : lancé par le menu
 * (« Viser sur la carte »), hors de la barre d'outils. Il ne touche que les tokens et ne vole
 * aucun autre geste : un clic dans le vide ou un glisser déplace la vue.
 *
 * | État    | Entrée                                        | Sortie                                   |
 * | ------- | --------------------------------------------- | ---------------------------------------- |
 * | `idle`  | clic sur un token : il est ajouté ou retiré   | → `picked` (⇧ : on reste en visée)       |
 * | `picked`| lâcher sans ⇧                                 | retour à la sélection (visée finie)      |
 * | —       | Échap, autre outil                            | visée finie, cibles gardées              |
 */
import type { MapEntity } from '../../engine/entities/entity';
import type { MapEngine } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import { SELECT_TOOL_ID } from '../../engine/tools/tool-manager';
import { characterOf, isToken } from './model';

export const AIM_TOOL_ID = 'combat-aim';

export interface AimToolHandlers {
  /** Un token visé : son personnage est ajouté ou retiré des cibles. */
  pick(characterId: string): void;
  /** L'outil est quitté (Échap, autre outil, visée finie). */
  exit(): void;
}

export class AimTool implements Tool {
  readonly id = AIM_TOOL_ID;
  state: 'idle' | 'picked' = 'idle';
  private finish = false;

  constructor(private readonly handlers: AimToolHandlers) {}

  cursor() {
    return 'crosshair';
  }

  targets(e: MapEntity) {
    return isToken(e);
  }

  move(e: MapPointer, engine: MapEngine) {
    if (e.buttons === 0) engine.setHovered(engine.hitTest(e.world)?.id ?? null, e);
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0 || e.alt) return false;
    const hit = engine.hitTest(e.world);
    const characterId = hit ? characterOf(hit) : null;
    // Le vide (ou un brouillon) : les gestes communs de la vue
    if (!characterId) return false;
    this.handlers.pick(characterId);
    this.state = 'picked';
    this.finish = !e.shift;
    engine.invalidate();
    return true;
  }

  up(_e: MapPointer, engine: MapEngine) {
    const finish = this.finish;
    this.state = 'idle';
    this.finish = false;
    if (finish) engine.tools.activate(SELECT_TOOL_ID);
  }

  cancel(): boolean {
    const had = this.state !== 'idle';
    this.state = 'idle';
    this.finish = false;
    return had;
  }

  deactivate(engine: MapEngine) {
    this.state = 'idle';
    this.finish = false;
    engine.setHovered(null);
    // Après le changement d'outil (le gestionnaire n'a pas encore changé d'outil actif)
    queueMicrotask(() => this.handlers.exit());
  }
}
