/**
 * Fonctions de la carte chargées par le moteur (docs/carte.md § 3, § 6, § 10), une ligne par
 * fonction : retirer une ligne retire la fonction, ses touches, ses boutons et ses panneaux.
 *
 * Une fonction vit dans `features/<id>/` : `index.ts` (le manifeste, un `MapFeature`), `engine/`
 * (sortes, outils, rendu, logique, testés sans React, qui n'importent jamais `ui/`) et `ui/`
 * (composants React). `register(engine)` y enregistre ses sortes d'entités, ses outils, ses
 * actions (bouton et/ou touche), ses entrées de barre d'outils, ses surcouches, ses sections
 * d'inspecteur, ses entrées de menu et ses abonnements, et renvoie son nettoyage (une fonction
 * ou une liste). Un bouton de plus (`camera/index.ts`) :
 *
 * ```ts
 * export const cameraFeature: MapFeature = {
 *   id: 'camera',
 *   register: (engine) => [
 *     engine.registerAction({ id: 'camera.fit', label: 'Recadrer la vue', icon: Focus,
 *       run: (e) => e.fitView(), toolbar: { group: 'assist', order: 30 } }),
 *   ],
 * };
 * ```
 *
 * Exemple complet (`objects`) :
 *
 * ```ts
 * import { Box } from 'lucide-react';
 * import { field, gmOnly, type EntityKind } from '@/lib/map/engine/entities/entity-kind';
 * import type { MapFeature } from '@/lib/map/engine/map-engine';
 * import type { MapObject } from '@vtt/contracts';
 *
 * export const objectsFeature: MapFeature = {
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
import type { MapFeature } from '@/lib/map/engine/map-engine';
import { gridFeature } from './grid';
import { sceneFeature } from './scene';
import { drawingsFeature } from './drawings';
import { tokensFeature } from './tokens';
import { objectsFeature } from './objects';
import { obstaclesFeature } from './obstacles';
import { fogFeature } from './fog';
import { lightsFeature } from './lights';
import { portalsFeature } from './portals';
import { soundsFeature } from './sounds';
import { measurementsFeature } from './measurements';
import { movementPathFeature } from './movement-path';
import { visionFeature } from './vision';
import { explorationFeature } from './exploration';
import { voiceFeature } from './voice';
import { weatherFeature } from './weather';
import { combatFeature } from './combat';
import { historyFeature } from './history';
import { bubblesFeature } from './bubbles';
import { layersFeature } from './layers';
import { sceneDisplayFeature } from './scene-display';
import { snapFeature } from './snap';
import { presenceFeature } from './presence';
import { cameraFeature } from './camera';
import { partyFeature } from './party';
import { fullscreenFeature } from './fullscreen';

export const MAP_FEATURES: readonly MapFeature[] = [
  // Socle de la barre : annuler et refaire, bulle du joueur, calques (K), fond et affichage de la
  // scène, aimantation, curseur partagé, recadrer, plein écran
  historyFeature,
  bubblesFeature,
  layersFeature,
  sceneDisplayFeature,
  snapFeature,
  presenceFeature,
  cameraFeature,
  fullscreenFeature,
  // Barre du groupe, dans le HUD gauche de la table
  partyFeature,
  // Moteur : point d'apparition de la scène
  sceneFeature,
  // Quadrillages de la scène et leur calibrage sur l'image
  gridFeature,
  // Lot 2 « Dessins » : main levée, formes, gomme, textes (P, T)
  drawingsFeature,
  // Lot 2 « Personnages » : tokens, PNJ, bibliothèque du MJ
  tokensFeature,
  // Lot 2 « Objets » : objets, fouille
  objectsFeature,
  // Lot 2 « Outils de visibilité » : murs, portes, fenêtres, sens unique, pièces (W)
  obstaclesFeature,
  // Lot 2 « Outils de visibilité » : zones de brouillard (G)
  fogFeature,
  // Lot 2 « Outils de visibilité » : lumières (L)
  lightsFeature,
  // Portails : même carte, autre scène, aller-retour, emprunt (X)
  portalsFeature,
  // Zones sonores : posées par le MJ (F, glisser un son), entendues selon le token du joueur
  soundsFeature,
  // Mesures : distance au clic, outil Mesurer (Z), gabarits épinglés
  measurementsFeature,
  // Trajet des déplacements : chemin, cases, distance d'un token glissé, au direct (⇧T)
  movementPathFeature,
  // Lot 2 « Rendu de la visibilité » : ombres, brouillard, lueurs, masquage, sélecteur « Vue »
  visionFeature,
  // Mémoire de l'exploration : ce que le groupe a vu reste grisé, outil du MJ (exploration.md)
  explorationFeature,
  // Météo de la scène : pluie, neige, brouillard… (plan weather, espace écran)
  weatherFeature,
  // Voix à la table : Table ou Proximité par scène, mixage selon les tokens (docs/voix.md)
  voiceFeature,
  // Combat : anneaux du tour et des cibles, visée, entrées « Attaquer », menu d'attaque
  combatFeature,
];
