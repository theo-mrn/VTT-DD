/**
 * Modules chargés par le moteur de la carte (docs/carte.md § 3, § 6, § 10), une ligne par
 * module : retirer une ligne retire la fonction, sa touche et ses boutons.
 *
 * Un module exporte un `MapModule` : `register(engine)` y enregistre ses sortes d'entités, ses
 * outils, ses actions (bouton et/ou touche), ses entrées de barre d'outils, ses sections
 * d'inspecteur, ses entrées de menu et ses abonnements, et renvoie son nettoyage (une fonction
 * ou une liste). Un bouton de plus (module `camera`) :
 *
 * ```ts
 * export const cameraModule: MapModule = {
 *   id: 'camera',
 *   register: (engine) => [
 *     engine.registerAction({ id: 'camera.fit', label: 'Recadrer la vue', icon: Focus,
 *       run: (e) => e.fitView(), toolbar: { group: 'assist', order: 30 } }),
 *   ],
 * };
 * ```
 *
 * Exemple complet (module `objects`) :
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
import { gridModule } from './grid';
import { sceneModule } from './scene';
import { drawingsModule } from './drawings';
import { tokensModule } from './tokens';
import { objectsModule } from './objects';
import { obstaclesModule } from './obstacles';
import { fogModule } from './fog';
import { lightsModule } from './lights';
import { portalsModule } from './portals';
import { soundsModule } from './sounds';
import { measurementsModule } from './measurements';
import { visionModule } from './vision';
import { weatherModule } from './weather';
import { combatModule } from './combat';
import { historyModule } from './history';
import { bubblesModule } from './bubbles';
import { layersModule } from './layers';
import { sceneDisplayModule } from './scene-display';
import { snapModule } from './snap';
import { presenceModule } from './presence';
import { cameraModule } from './camera';

export const MAP_MODULES: readonly MapModule[] = [
  // Socle de la barre : annuler et refaire, bulle du joueur, calques (K), fond et affichage de la
  // scène, aimantation, curseur partagé, recadrer
  historyModule,
  bubblesModule,
  layersModule,
  sceneDisplayModule,
  snapModule,
  presenceModule,
  cameraModule,
  // Moteur : point d'apparition de la scène
  sceneModule,
  // Quadrillages de la scène et leur calibrage sur l'image
  gridModule,
  // Lot 2 « Dessins » : main levée, formes, gomme, textes (P, T)
  drawingsModule,
  // Lot 2 « Personnages » : tokens, PNJ, bibliothèque du MJ
  tokensModule,
  // Lot 2 « Objets » : objets, fouille
  objectsModule,
  // Lot 2 « Outils de visibilité » : murs, portes, fenêtres, sens unique, pièces (W)
  obstaclesModule,
  // Lot 2 « Outils de visibilité » : zones de brouillard (G)
  fogModule,
  // Lot 2 « Outils de visibilité » : lumières (L)
  lightsModule,
  // Portails : même carte, autre scène, aller-retour, emprunt (X)
  portalsModule,
  // Zones sonores : posées par le MJ (F, glisser un son), entendues selon le token du joueur
  soundsModule,
  // Mesures : distance au clic, outil Mesurer (Z), gabarits épinglés
  measurementsModule,
  // Lot 2 « Rendu de la visibilité » : ombres, brouillard, lueurs, masquage, sélecteur « Vue »
  visionModule,
  // Météo de la scène : pluie, neige, brouillard… (plan weather, espace écran)
  weatherModule,
  // Combat : anneaux du tour et des cibles, visée, entrées « Attaquer », menu d'attaque
  combatModule,
];
