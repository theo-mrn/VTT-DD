/**
 * Outil Texte (T, docs/carte.md § 10) : un clic pose un texte, édité en place (champ DOM sur la
 * carte : Entrée valide, Maj+Entrée va à la ligne, Échap annule). Un clic sur un texte que je
 * peux modifier le rouvre. Taille, couleur et police : barre contextuelle de l'outil.
 *
 * | État      | Entrée                                   | Sortie                                  |
 * | --------- | ---------------------------------------- | --------------------------------------- |
 * | `idle`    | clic dans le vide → `editing` (nouveau)  | clic sur un texte → `editing` (modifier) |
 * | `editing` | saisie (surcouche React)                 | Entrée, clic ailleurs → écrit ; Échap    |
 */
import type { MapEngine } from '../../engine/map-engine';
import type { MapPointer, Tool } from '../../engine/tools/tool';
import type { DrawingsRuntime } from './runtime';
import { NOTE_KIND, TEXT_TOOL_ID } from './types';

export class TextTool implements Tool {
  readonly id = TEXT_TOOL_ID;

  constructor(private readonly rt: DrawingsRuntime) {}

  get state(): 'idle' | 'editing' {
    return this.rt.editor.session ? 'editing' : 'idle';
  }

  cursor() {
    return 'text';
  }

  down(e: MapPointer, engine: MapEngine): boolean {
    if (e.button !== 0) return false;
    if (e.alt) {
      engine.ping(e.world);
      return true;
    }
    const editor = this.rt.editor;
    // Le clic qui ferme l'éditeur (ou qui le trouve ouvert) ne pose pas un autre texte
    if (editor.session) {
      void editor.commit();
      return true;
    }
    if (editor.recentlyClosed(engine.now())) return true;
    const hit = engine.hitTest(e.world, {
      filter: (x) => x.kind.id === NOTE_KIND && x.kind.can('move', x, engine.viewer),
    });
    if (hit) editor.openExisting(hit);
    else editor.openNew(e.world);
    return true;
  }

  /**
   * Rien à annuler côté carte : Échap dans le champ l'annule (surcouche) ; quitter l'outil
   * (changement d'outil, Échap carte focalisée) écrit le texte en cours plutôt que le perdre.
   */
  cancel(): boolean {
    return false;
  }

  deactivate() {
    void this.rt.editor.commit();
  }
}
