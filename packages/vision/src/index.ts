/**
 * Visibilité de la carte : géométrie pure, sans DOM ni rendu, partagée par le navigateur
 * (rendu des ombres, du brouillard et des lumières) et le service campaign (filtrage de ce
 * qu'un joueur reçoit). Conception : docs/carte.md § 9 ; mode d'emploi : README.md.
 */
export type {
  FogMode,
  FogZone,
  Light,
  Polygon,
  PrepareOptions,
  Room,
  Segment,
  SegmentKind,
  Side,
  Vec,
  Viewer,
  VisionScene,
} from './types.js';
export { pointInPolygon, pseudoAngle, sideOf } from './geometry.js';
export {
  closedRooms,
  inFog,
  innermostRoom,
  prepareScene,
  PreparedScene,
  withLights,
  type PreparedRoom,
} from './prepare.js';
export { segmentsFromPolyline, type SegmentProps } from './segments.js';
export { translucentShadows, type TranslucentShadow } from './shadows.js';
export { sampleCircle, sampleRect } from './sampling.js';
export {
  isEntityVisible,
  lightArea,
  playerView,
  viewerView,
  visibilityPolygon,
  type LightArea,
  type RoomTerm,
  type View,
  type ViewerTerms,
} from './view.js';
