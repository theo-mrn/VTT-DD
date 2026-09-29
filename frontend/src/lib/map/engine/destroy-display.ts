/**
 * Destruction d'un sous-arbre Pixi, sans fuite et sans rien casser de partagé (Pixi 8).
 *
 * `container.destroy({ children: true })` ne libère pas la géométrie des `Graphics` enfants :
 * `Graphics.destroy(options)` ne détruit son `GraphicsContext` propre que s'il est appelé sans
 * options (et `{ context: true }` détruirait aussi un contexte partagé). On détruit donc chaque
 * nœud sans options, des feuilles vers la racine :
 * - un `Graphics` libère son contexte propre et se détache d'un contexte partagé (icônes de
 *   porte, de lumière, repères d'objet), qui reste utilisable par les autres ;
 * - un `Sprite` garde sa texture (chargée une fois par adresse, libérée par le moteur) ;
 * - un texte garde son style.
 *
 * Aucun import de `pixi.js` à l'exécution : un module l'utilise sans charger Pixi.
 */
import type { Container } from 'pixi.js';

export function destroyDisplay(node: Container): void {
  if (node.destroyed) return;
  node.removeFromParent();
  for (const child of node.removeChildren()) destroyDisplay(child);
  node.destroy();
}
