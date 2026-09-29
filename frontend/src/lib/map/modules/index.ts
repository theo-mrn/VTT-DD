/**
 * Modules chargés par le moteur de la carte (docs/carte.md § 3, § 10), une ligne par module.
 * Chaque agent du lot 2 décommente la sienne quand son module est prêt.
 *
 * Un module exporte un `MapModule` : `register(engine)` y enregistre ses sortes d'entités, ses
 * outils, ses sections d'inspecteur, ses entrées de barre d'outils, ses entrées de menu et ses
 * abonnements, et renvoie son nettoyage. Exemple (module `objects`) :
 *
 * ```ts
 * import { Box } from 'lucide-react';
 * import { field, gmOnly, type EntityKind } from '../../engine/entities/entity-kind';
 * import type { MapModule } from '../../engine/map-engine';
 * import type { MapObject } from '@vtt/contracts';
 *
 * export const objectsModule: MapModule = {
 *   id: 'objects',
 *   register(engine) {
 *     const kind: EntityKind<MapObject & MapDto> = {
 *       id: 'object',
 *       label: 'Objet',
 *       collection: 'objects',
 *       capabilities: ['select', 'move', 'rotate', 'resize', 'lock', 'hide', 'restrictTo',
 *         'duplicate', 'delete', 'inspect', 'order'],
 *       plane: 'content',
 *       stacking: { arrangeKind: 'object', layerId: field('layerId'), z: field('z'), defaultRole: 'objects' },
 *       display: 'objects',
 *       geometry: (o) => ({ x: o.pos.x + o.width / 2, y: o.pos.y + o.height / 2,
 *         width: o.width, height: o.height, rotation: o.rotation }),
 *       applyGeometry: (o, g) => ({ ...o, pos: { x: g.x - g.width / 2, y: g.y - g.height / 2 },
 *         width: g.width, height: g.height, rotation: g.rotation }),
 *       locked: field('isLocked'),
 *       hidden: { get: (o) => o.visibility === 'hidden',
 *         set: (o, h) => ({ ...o, visibility: h ? 'hidden' : 'visible' }) },
 *       name: (o) => o.name || null,
 *       can: gmOnly,
 *       render(entity, ctx) {
 *         // Dessin local centré sur (0, 0) ; le moteur place et tourne `entity.display`
 *         const sprite = new ctx.pixi.Sprite();
 *         sprite.anchor.set(0.5);
 *         entity.display!.addChild(sprite);
 *         void ctx.texture(entity.data.imageUrl).then((t) => { sprite.texture = t; ctx.invalidate(); });
 *       },
 *       persistence: engine.backend!.collection('objects'),
 *     };
 *     const unregister = [
 *       engine.registerKind(kind),
 *       engine.registerTool({ id: 'object-place', label: 'Objet', icon: Box, create: () => new PlaceTool() }),
 *       engine.registerInspectorSection({ id: 'object', title: 'Objet',
 *         appliesTo: (es) => es.every((e) => e.kind.id === 'object'), component: ObjectInspector }),
 *     ];
 *     return () => unregister.forEach((u) => u());
 *   },
 * };
 * ```
 */
import type { MapModule } from '../engine/map-engine';
import { sceneModule } from './scene';
import { drawingsModule } from './drawings';
// import { tokensModule } from './tokens';
import { objectsModule } from './objects';
// import { obstaclesModule } from './obstacles';
// import { fogModule } from './fog';
// import { lightsModule } from './lights';
// import { visionModule } from './vision';

export const MAP_MODULES: readonly MapModule[] = [
  // Moteur : point d'apparition de la scène
  sceneModule,
  // Lot 2 « Dessins » : main levée, formes, gomme, textes (P, T)
  drawingsModule,
  // Lot 2 « Personnages » : tokens, PNJ, bibliothèque du MJ
  // tokensModule,
  // Lot 2 « Objets » : objets, fouille
  objectsModule,
  // Lot 2 « Outils de visibilité » : murs, portes, fenêtres, sens unique, pièces (W)
  // obstaclesModule,
  // Lot 2 « Outils de visibilité » : zones de brouillard (G)
  // fogModule,
  // Lot 2 « Outils de visibilité » : lumières (L)
  // lightsModule,
  // Lot 2 « Rendu de la visibilité » : ombres, brouillard, lueurs, masquage, sélecteur « Vue »
  // visionModule,
];
