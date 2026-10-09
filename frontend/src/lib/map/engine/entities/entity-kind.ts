/**
 * `EntityKind` (docs/carte.md § 6) : ce qu'une sorte d'entité (token, objet, dessin, mur…)
 * déclare au moteur. Le moteur écrit une seule fois le comportement commun (toucher,
 * sélection, glisser, poignées, verrou, masquage, menu, clavier, direct, annuler) ; la sorte
 * dit seulement ce qu'elle sait faire (`capabilities`), qui a le droit (`can`), comment lire
 * et écrire sa géométrie et ses drapeaux dans sa donnée, comment se dessiner et comment
 * s'enregistrer au serveur (`persistence`).
 *
 * Exemple minimal (module `objects`) :
 *
 * ```ts
 * engine.registerKind<MapObject>({
 *   id: 'object',
 *   label: 'Objet',
 *   collection: 'objects',
 *   capabilities: ['select', 'move', 'rotate', 'resize', 'lock', 'hide', 'duplicate', 'delete', 'inspect', 'order'],
 *   plane: 'content',
 *   stacking: { arrangeKind: 'object', layerId: field('layerId'), z: field('z'), defaultRole: 'objects' },
 *   display: 'objects',
 *   geometry: (o) => ({ x: o.pos.x + o.width / 2, y: o.pos.y + o.height / 2, width: o.width, height: o.height, rotation: o.rotation }),
 *   applyGeometry: (o, g) => ({ ...o, pos: { x: g.x - g.width / 2, y: g.y - g.height / 2 }, width: g.width, height: g.height, rotation: g.rotation }),
 *   locked: field('isLocked'),
 *   hidden: { get: (o) => o.visibility === 'hidden', set: (o, h) => ({ ...o, visibility: h ? 'hidden' : 'visible' }) },
 *   name: (o) => o.name,
 *   can: gmOnly,
 *   render(entity, ctx) { … dessine dans entity.display, centré sur (0, 0) … },
 *   update(entity, ctx, change) { … },
 *   persistence: engine.api.layer('objects'),
 * });
 * ```
 */
import type { ComponentType } from 'react';
import type * as Pixi from 'pixi.js';
import type { EntityGeometry, Point, Rect } from '../geometry';
import type { DefaultLayerRole } from '../layers';
import type { DisplayKey, PlaneId } from '../planes';
import type { ScreenSpace } from '../screen-space';
import type { MapDto, SceneLike, SettingsLike } from '../../store/map-store';
import type { Persistence } from '../../store/commands';
import type { LiveAudience } from '../../live/live-channel';
import type { MapEntity } from './entity';

// ─── Qui regarde ─────────────────────────────────────────────────────────────

export type MapRole = 'gm' | 'player' | 'spectator';

/** L'utilisateur devant la carte, et ce qui décide de ses droits. */
export interface MapViewer {
  userId: string;
  role: MapRole;
  /** Personnages de la campagne qu'il possède ou incarne (ses tokens). */
  characterIds: readonly string[];
}

export const isGm = (viewer: MapViewer) => viewer.role === 'gm';

// ─── Capacités et droits ─────────────────────────────────────────────────────

export const CAPABILITIES = [
  'select',
  'move',
  'rotate',
  'resize',
  'lock',
  'hide',
  'restrictTo',
  'duplicate',
  'delete',
  'inspect',
  /** Ordre dans le calque et changement de calque (menus « Ordre » et « Calque »). */
  'order',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Ce que `can` tranche : une capacité, ou « voir » (menu, info-bulle). */
export type EntityAction = Capability | 'view';

/** Droits courants : tout le monde sélectionne et inspecte, le MJ fait le reste. */
export const gmOnly = <D extends MapDto>(
  action: EntityAction,
  _entity: MapEntity<D>,
  viewer: MapViewer,
): boolean => action === 'view' || action === 'select' || action === 'inspect' || isGm(viewer);

/**
 * Droits d'un élément créé par un membre (dessins, textes, gabarits) : l'auteur ou le MJ le
 * modifient, un spectateur ne fait que regarder.
 */
export const authorOrGm =
  (authorField = 'createdBy') =>
  <D extends MapDto>(action: EntityAction, entity: MapEntity<D>, viewer: MapViewer): boolean => {
    if (action === 'view' || action === 'select' || action === 'inspect') return true;
    if (viewer.role === 'spectator') return false;
    return isGm(viewer) || entity.data[authorField] === viewer.userId;
  };

// ─── Lecture et écriture de la donnée ───────────────────────────────────────

/** Un champ commun (verrou, masquage…) lu et écrit dans la donnée, sans la muter. */
export interface Field<D, V> {
  get(data: D): V;
  set(data: D, value: V): D;
}

/** Champ simple de la donnée (`field('isLocked')`). */
export function field<D extends MapDto, V = boolean>(name: keyof D & string): Field<D, V> {
  return {
    get: (d) => d[name] as V,
    set: (d, v) => ({ ...d, [name]: v }),
  };
}

// ─── Contextes ───────────────────────────────────────────────────────────────

/** Ce que la sorte connaît pour lire sa géométrie et trancher ses droits. */
export interface KindContext {
  viewer: MapViewer;
  scene: SceneLike | null;
  settings: SettingsLike | null;
  /** Pixels du monde par case (`map_settings.pixelsPerUnit`, 50 par défaut). */
  pixelsPerUnit: number;
  /** Échelle globale des tokens (`map_settings.tokenScale`, 1 par défaut). */
  tokenScale: number;
  /** Nom de l'unité (`map_settings.unitName`, « m » par défaut, comme le serveur). */
  unitName: string;
}

/** Couleurs du thème, lues dans les variables CSS de la page (jamais de couleur en dur). */
export interface MapTheme {
  primary: number;
  foreground: number;
  background: number;
  muted: number;
  destructive: number;
  success: number;
}

/** Ce que la sorte reçoit pour dessiner. */
export interface RenderContext extends KindContext {
  /** Module `pixi.js`, chargé à la demande (un fichier de module reste testable sans Pixi). */
  pixi: typeof Pixi;
  zoom: number;
  theme: MapTheme;
  /** Éléments à taille constante à l'écran (étiquettes, icônes). */
  screenSpace: ScreenSpace;
  /** Texture d'une image (chargée une fois, gardée par le moteur). */
  texture(url: string): Promise<Pixi.Texture>;
  /**
   * Texture réduite d'une image (petit côté à `size` pixels au plus, chargée une fois) : un
   * portrait de 70 px n'a pas besoin de l'original. Absente : `texture`.
   */
  thumbnail?(url: string, size: number): Promise<Pixi.Texture>;
  /** Redemande une image (après un chargement asynchrone). */
  invalidate(): void;
}

/** Ce qui a changé depuis le dernier rendu. */
export interface EntityChange<D> {
  /** Donnée précédente, si la donnée a changé. */
  previous?: D;
  /** L'état d'affichage (survol, sélection…) a changé. */
  state?: boolean;
  /** Le zoom a changé (éléments à taille constante déjà gérés par `screenSpace`). */
  zoom?: boolean;
}

// ─── Menu contextuel ─────────────────────────────────────────────────────────

export interface MenuItem {
  /**
   * Identifiant ; deux préfixes réservés : `sep:` (séparateur) et `label:` (titre de section,
   * non cliquable, dans un sous-menu).
   */
  id: string;
  label: string;
  icon?: ComponentType<{ className?: string }>;
  /** Raccourci affiché (« ⌘D », « Suppr »). */
  shortcut?: string;
  /** Action destructrice (rouge). */
  danger?: boolean;
  /** Action principale de la sorte : bouton libellé dans la barre de la sélection. */
  primary?: boolean;
  /** À faire d'abord (« Relever » un personnage hors de combat) : en tête du menu. */
  urgent?: boolean;
  /**
   * Montrée aussi à un joueur dans la barre de la sélection (« Fouiller »). Un joueur n'a pas
   * de barre au clic, sinon (il clique sans cesse son token pour le déplacer) : ses actions
   * restent au clic droit.
   */
  forPlayers?: boolean;
  disabled?: boolean;
  /** Case cochée (bascule). */
  checked?: boolean;
  run?(): void;
  /** Sous-menu. */
  children?: MenuItem[];
}

/** Ce que reçoit `actions` : le moteur (commandes, sélection) et qui regarde. */
export interface ActionContext {
  viewer: MapViewer;
  /** Le moteur ; typé largement pour éviter un import circulaire. */
  engine: unknown;
}

export type { LiveAudience };

/** Ce que reçoit `click` : le moteur, qui regarde, et le pointeur. */
export interface ClickContext extends ActionContext {
  world: Point;
}

// ─── La sorte ────────────────────────────────────────────────────────────────

export interface EntityKind<D extends MapDto = MapDto> {
  /** Identifiant de la sorte (`token`, `object`, `drawing`, `wall`…). */
  readonly id: string;
  /** Nom affiché (« Objet »), au singulier. */
  readonly label: string;
  /** Couche du magasin d'où viennent les données (`objects`). */
  readonly collection: string;
  /**
   * Filtre facultatif : plusieurs sortes peuvent partager une couche (murs et portes dans
   * `obstacles`) ; chaque élément va à la première sorte qui l'accepte.
   */
  accepts?(data: D): boolean;
  readonly capabilities: readonly Capability[];
  /**
   * Plan de rendu (§ 5) des entités hors calque : `gm` (murs, lumières…), `annotations`
   * (dessins et textes sans calque)… Une entité rangée dans un calque (`stacking`) est
   * toujours dans le plan `content`.
   */
  readonly plane: PlaneId | ((data: D) => PlaneId);
  /** Calque du MJ et ordre `z` (tokens, objets ; dessins et textes, facultatif). */
  readonly stacking?: Stacking<D>;
  /** Famille du réglage « Affichage » (`map.display`) qui masque cette sorte. */
  readonly display?: DisplayKey;
  /**
   * Outil qui édite cette sorte (murs et pièces : `obstacles`, W) : hors de lui, elle ne se
   * sélectionne pas au clic ni au menu ; seule son action de clic (`click`) reste permise. Un mur
   * ne vole ainsi jamais le clic d'un token posé contre lui. Le lasso de l'outil Sélection la
   * prend quand même (`entitiesInLasso`).
   */
  readonly editTool?: string;
  /**
   * Avec `editTool` : hors de son outil (outil sélection), l'entité se touche quand même, mais
   * en dernier recours, seulement si rien d'autre n'est sous le pointeur. On la sélectionne, on
   * ouvre son menu et son inspecteur, on la supprime ; on ne la glisse pas (son outil garde les
   * gestes qui la déforment : soudures des murs). Le lasso (⇧ + glisser) la prend, comme toute
   * sorte sélectionnable (`entitiesInLasso`), sans la rendre glissable. Murs, pièces,
   * lumières ; pas les zones de brouillard, qui couvrent la carte et prendraient chaque clic.
   */
  readonly pickOutsideTool?: boolean;
  /**
   * La sorte dessine elle-même sa marque « masqué aux joueurs » (voile, badge) : le moteur ne
   * pose pas ses hachures ni son badge commun (token rond : voile blanc et œil barré).
   */
  readonly selfHiddenMark?: boolean;
  /** Le nom est déjà écrit sur l'entité (token) : pas d'info-bulle du nom au survol. */
  readonly showsName?: boolean;
  /** Image qui la représente (menu de choix entre éléments superposés), si elle en a une. */
  thumbnail?(data: D): string | null;
  /**
   * Action d'un clic simple (sans glisser ni modificateur), pour tous : ouvrir ou fermer une
   * porte. Renvoie vrai si le clic est pris (la sélection ne change pas). Une sorte qui la
   * déclare reste touchable hors de son outil là où son `hitTest` le dit (icône de porte).
   */
  click?(entity: MapEntity<D>, ctx: ClickContext): boolean;
  /**
   * La sorte dessine elle-même son survol et sa sélection (mur, zone, lumière) : pas de contour
   * rectangulaire commun.
   */
  readonly selfOutline?: boolean;
  /**
   * Points d'échantillon de la visibilité, à plat (`x0, y0, x1, y1…`, pixels du monde) : pour
   * un joueur, le module vision ne montre l'entité (et elle ne se touche) que si l'un d'eux est
   * dans sa vue (icône de porte : son milieu, un peu de chaque côté). null ou absent : la vision
   * ne la masque pas (tokens et objets suivent leurs propres règles, § 9).
   */
  visionSamples?(entity: MapEntity<D>): Float64Array | null;

  /** Géométrie (centre, taille, rotation en degrés) lue dans la donnée. */
  geometry(data: D, ctx: KindContext): EntityGeometry;
  /**
   * Donnée après une transformation (déplacer, pivoter, redimensionner). Requise avec les
   * capacités `move`, `rotate` ou `resize`. Une sorte à points (dessin, mur) translate ses points
   * de l'écart entre l'ancien et le nouveau centre.
   */
  applyGeometry?(data: D, next: EntityGeometry, ctx: KindContext): D;

  /** Verrou (capacité `lock`). */
  readonly locked?: Field<D, boolean>;
  /** Masqué aux joueurs (capacité `hide`). */
  readonly hidden?: Field<D, boolean>;
  /** Visible seulement pour ces personnages (capacité `restrictTo`) ; null : pour tous. */
  readonly restrictedTo?: Field<D, readonly string[] | null>;

  /**
   * L'élément appartient à ce viewer (token de son personnage) : il reste touchable dans un
   * calque verrouillé.
   */
  isOwn?(data: D, viewer: MapViewer): boolean;
  /** Nom (info-bulle après 400 ms, menus, inspecteur). */
  name?(data: D, ctx: KindContext): string | null;
  /** Droits, miroir exact du backend. */
  can(action: EntityAction, entity: MapEntity<D>, viewer: MapViewer): boolean;

  /** Test de toucher précis (défaut : rectangle tourné de la géométrie). */
  hitTest?(entity: MapEntity<D>, p: Point, tolerance: number): boolean;
  /** Boîte englobante (défaut : celle du rectangle tourné). */
  bounds?(entity: MapEntity<D>): Rect;

  /** Premier rendu dans `entity.display`, en coordonnées locales centrées sur la géométrie. */
  render?(entity: MapEntity<D>, ctx: RenderContext): void;
  /** Mise à jour incrémentale ; sans elle, le moteur vide le conteneur et rappelle `render`. */
  update?(entity: MapEntity<D>, ctx: RenderContext, change: EntityChange<D>): void;
  /** Libère ce que `render` a créé hors du conteneur (textures propres…). */
  dispose?(entity: MapEntity<D>): void;
  /**
   * Le moteur place et tourne le conteneur (défaut). `false` : la sorte dessine en coordonnées
   * du monde (murs, pièces, zones) et le moteur ne touche pas à la transformation.
   */
  readonly transformDisplay?: boolean;
  /** Redimensionner garde toujours les proportions (token rond ou carré). */
  readonly keepAspectRatio?: boolean;
  /** Taille minimale à la poignée, en pixels du monde (défaut 8). */
  readonly minSize?: number;

  /** Entrées propres au menu contextuel (après les actions communes). */
  actions?(entities: readonly MapEntity<D>[], ctx: ActionContext): MenuItem[];
  /**
   * Double clic sur l'entité avec l'outil sélection : la sorte le prend (éditer un texte en
   * place) en renvoyant vrai ; sinon, l'inspecteur s'ouvre.
   */
  doubleClick?(entity: MapEntity<D>, ctx: ActionContext & { world: Point }): boolean;
  /** Copie à dupliquer, décalée (capacité `duplicate`) ; l'identifiant est fourni par le moteur. */
  duplicate?(data: D, offset: Point, ctx: KindContext): D;
  /** Message de confirmation avant suppression (instance de PNJ), ou null. */
  confirmDelete?(entities: readonly MapEntity<D>[]): string | null;
  /**
   * Suppression propre à la sorte, après la confirmation (instance de PNJ : supprimée avec son
   * personnage, définitivement, hors de la pile d'annulation). Absente : suppression commune,
   * annulable, par `persistence.remove`.
   */
  remove?(entities: readonly MapEntity<D>[]): Promise<boolean>;
  /** Audience du direct (défaut : `gm` si masqué aux joueurs, sinon `public`). */
  liveAudience?(entity: MapEntity<D>, viewer: MapViewer): LiveAudience;

  /** Écritures au serveur (créer, modifier, supprimer). */
  readonly persistence: Persistence<D>;
}

/**
 * Rangement d'une sorte dans les calques du MJ (docs/carte.md § 5, Calques). L'ordre et le
 * calque se changent par `POST /maps/:mapId/arrange` (une commande pour toute la sélection).
 */
export interface Stacking<D> {
  /** Valeur `kind` de `/arrange` (`token`, `object`, `drawing`, `note`). */
  arrangeKind: string;
  /** Calque ; null : aucun (annotation), seulement si `optional`. */
  layerId: Field<D, string | null>;
  z: Field<D, number>;
  /** `layerId` nul permis : l'entité est alors une annotation (plan `annotations`). */
  optional?: boolean;
  /** Calque par défaut de la sorte (`role` du calque) quand la donnée n'en a pas. */
  defaultRole?: DefaultLayerRole;
}

export const hasCapability = (kind: { capabilities: readonly Capability[] }, cap: Capability) =>
  kind.capabilities.includes(cap);

/** Plan de la sorte pour cette donnée (hors calque). */
export const planeOf = <D extends MapDto>(kind: EntityKind<D>, data: D): PlaneId =>
  typeof kind.plane === 'function' ? kind.plane(data) : kind.plane;
