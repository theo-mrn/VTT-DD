# @vtt/vision

Géométrie de la visibilité de la carte, pure : aucune dépendance, aucun DOM. Le navigateur s'en
sert pour le rendu (obscurité, brouillard, lumières, ombres partielles, masquage des PNJ et
objets), le service campaign pour filtrer ce qu'un joueur reçoit. Un seul algorithme, donc aucun
écart entre ce qui est affiché et ce qui est envoyé. Conception : [docs/carte.md](../../docs/carte.md)
§ 9.

## Ce qu'un observateur voit

```
LOS(O)  = polygone de vue depuis O (murs opaques, portes fermées, sens unique vu depuis O)
Pièce   = LOS(O) ∩ R − (pièces fermées qui ne contiennent pas O)
          R : pièce fermée la plus intérieure contenant O (sans R, pas d'intersection)
Portée  = (hors brouillard) ∪ disque(O, visionRadius) ∪ (⋃ lumières allumées : disque(L) ∩ LOS(L))
Vu(O)   = Pièce ∩ Portée          Vu(joueur) = ⋃ Vu(O)
```

Aucune opération booléenne de polygones : `View.contains(p)` combine des tests ponctuels, et
`View.viewers` expose les termes pour que le rendu compose exactement la même chose.

## API

```ts
// Préparation (à refaire quand un mur, une porte, une pièce ou une zone change)
prepareScene(scene: VisionScene, options?: { snap?: number; doorTolerance?: number }): PreparedScene
withLights(prep, lights: Light[]): PreparedScene // mêmes murs, autres lumières (torche qui bouge)
segmentsFromPolyline(props: SegmentProps, points: Vec[], closed?: boolean): Segment[]

// Géométrie
visibilityPolygon(prep, origin: Vec, opts?: { maxRadius?: number }): Polygon
translucentShadows(prep, origin: Vec): { id: string; polygon: Polygon; opacity: number }[]
lightArea(prep, light: Light): { id; center: Vec; radius; falloff; polygon: Polygon }

// Vues
viewerView(prep, viewer: Viewer): View
playerView(prep, viewers: Viewer[]): View
interface View {
  contains(p: Vec): boolean;
  containsXY(x: number, y: number): boolean;
  containsAny(points: Float64Array | Vec[]): boolean;
  viewers: { viewer; origin: Vec; los: Polygon; clipRoom: RoomTerm | null;
             subtractRooms: RoomTerm[]; visionRadius: number }[];
  lights: LightArea[]; // lumières allumées de la scène
}

// Utilitaires
closedRooms(prep): Set<string>
innermostRoom(prep, p: Vec, options?: { closedOnly?: boolean }): Room | null
inFog(prep, p: Vec): boolean
pointInPolygon(p: Vec, polygon: Vec[] | Polygon): boolean
sideOf(a: Vec, b: Vec, p: Vec): 'left' | 'right' | null
sampleCircle(center: Vec, radius: number): Float64Array // centre + 8 points à 0,7 r
sampleRect(x, y, width, height, rotation?): Float64Array  // centre, coins, milieux des bords
isEntityVisible(view: View, samples: Float64Array | Vec[]): boolean
```

`Polygon` est un `Float64Array` à plat `[x0, y0, x1, y1, …]`, sans répéter le premier point.

## Conventions

- **Coordonnées** : pixels du monde (image de fond), y vers le bas. La vue est bornée au
  rectangle `[0, width] × [0, height]` ; ses bords sont des murs.
- **Ordre des polygones de vue** : angle croissant autour de l'origine en partant de +x, soit
  le sens horaire à l'écran. Sans doublon consécutif.
- **Sens unique** (`one_way`, ou `one_way_wall` comme dans le contrat) : segment orienté a→b ;
  `blocksFrom: 'left'` (défaut) bloque un observateur à gauche, c'est-à-dire
  `cross(b − a, p − a) < 0` en coordonnées écran. Exemple : un segment tracé vers le bas de
  l'écran a sa gauche à l'est. De l'autre côté, on voit à travers.
- **Opacité** : 1 (défaut) bloque ; entre 0 et 1, ombre partielle (`translucentShadows`) sans
  jamais masquer une entité ; 0 : sans effet. Fenêtres et portes ouvertes ne bloquent pas.
- **Salles détectées des murs** (`wallRooms`, vrai par défaut) : toute boucle fermée de
  segments est une pièce (`detectWallRooms` : sommets soudés à `snap`, jonctions en T
  découpées, bouts pendants ignorés, faces de moins de 16 px² écartées), en plus des pièces de
  `scene.rooms`. Fermée si ni fenêtre, ni porte ouverte, ni sens unique, ni mur translucide sur
  son contour.
- **Pièce posée fermée** : ni porte ouverte ni fenêtre sur son contour. Une porte (ou une
  fenêtre) est sur le contour si ses extrémités et son milieu sont à `doorTolerance` (3 px) du
  contour.
- **Brouillard** : zones appliquées dans l'ordre du tableau (trier par `order`), à partir de
  `fogFull` ; la dernière zone qui contient le point décide.
- **Soudure** : extrémités à moins de `snap` (0,5 px) fusionnées, extrémité à moins de `snap`
  de l'intérieur d'un mur soudée dessus, murs qui se croisent découpés au croisement. Aucune
  fente plus étroite que `snap` ne laisse passer la vue.
- **Observateur sur un mur ou une extrémité** : origine décalée de 4 × 10⁻⁷ × la taille de la
  carte dans la première de 16 directions fixes qui l'éloigne des murs (déterministe) ; hors
  de la carte : ramenée dedans. `View.viewers[i].origin` donne l'origine effective.
- **Lumières** : `radius` en pixels (contrat : unités × `pixelsPerUnit`). Leur polygone est
  coupé au disque, arcs à 0,25 px près.
- Une `PreparedScene` porte des tampons de travail réutilisés : ne pas la partager entre
  threads (workers). Dans un même thread, les appels sont synchrones et sans conflit.

## Côté navigateur

```ts
import { playerView, prepareScene, sampleCircle, segmentsFromPolyline, withLights, type VisionScene } from '@vtt/vision';

const scene: VisionScene = {
  bounds: { width: map.width, height: map.height },
  segments: obstacles.flatMap((o) =>
    segmentsFromPolyline(
      { id: o.id, kind: o.kind, open: o.isOpen, blocksFrom: o.blocksFrom ?? 'left', opacity: o.opacity },
      o.points,
    ),
  ),
  rooms: rooms.map((r) => ({ id: r.id, points: r.points })),
  fogFull: map.fogFull,
  fogZones: [...fogZones]
    .sort((a, b) => a.order - b.order)
    .map((z) =>
      z.shape === 'circle'
        ? { id: z.id, mode: z.mode, shape: 'circle', center: z.center!, radius: z.radius! }
        : { id: z.id, mode: z.mode, shape: z.shape, points: z.points },
    ),
  lights: lights.map((l) => ({ id: l.id, pos: l.pos, radius: l.radius * settings.pixelsPerUnit, falloff: l.falloff, on: l.visible })),
};

// Quand un mur, une porte, une pièce ou une zone change (quelques ms) :
let prep = prepareScene(scene);
// Torche qui suit un token pendant un glisser (rien d'autre n'est refait) :
prep = withLights(prep, movedLights);

// À chaque image où un observateur bouge :
const view = playerView(prep, myTokens.map((t) => ({ id: t.id, pos: t.pos, visionRadius: t.visionBoost ? 3 * t.visionRadius : t.visionRadius })));
for (const v of view.viewers) {
  // masque : v.los en blanc, ∩ v.clipRoom, − v.subtractRooms (ERASE) ; disque v.visionRadius
}
for (const l of view.lights) {
  // dégradé radial (l.center, l.radius, l.falloff) dessiné dans l.polygon
}
npc.display.visible = view.containsAny(sampleCircle(npc.pos, npcRadius));
```

## Côté serveur (campaign)

```ts
// Scène préparée gardée par carte et par version (LRU), refaite quand elle change.
const prep = cache.get(`${mapId}:${version}`) ?? prepareScene(await loadVisionScene(mapId));
const view = playerView(prep, viewersOf(userId));
const visibleTokens = tokens.filter((t) => view.containsAny(sampleCircle(t.pos, radiusOf(t))));
const visibleObjects = objects.filter((o) => view.containsAny(sampleRect(o.pos.x, o.pos.y, o.width, o.height, o.rotation)));
```

## Performances

`pnpm --filter @vtt/vision bench` (donjon de 2 000 segments, 85 pièces, 20 zones de
brouillard, 20 lumières ; Apple Silicon, Node 24, moyennes) :

| Opération                                   | Budget   | Mesuré  |
| ------------------------------------------- | -------- | ------- |
| `prepareScene`, 2 000 segments              | < 5 ms   | 1,7 ms |
| `visibilityPolygon`, 2 000 segments         | < 1,5 ms | 0,45 ms |
| `contains` × 10 000, joueur à 3 observateurs | < 5 ms   | 1,2 ms |

À titre indicatif, 2 000 segments courts jetés au hasard (un millier de croisements, 3 943
segments après découpe) : 4,7 ms et 1,25 ms. Une lumière de rayon 300 px (`maxRadius`) :
0,01 ms.

## Algorithme

- **Préparation** (`walls.ts`) : segments bloquants coupés à la carte, extrémités soudées,
  jonctions en T et croisements découpés jusqu'à ce qu'aucun segment n'en croise un autre,
  doublons retirés, grille spatiale. Seules les paires qui touchent un morceau neuf sont
  revérifiées après une découpe.
- **Polygone de vue** (`sweep.ts`) : balayage angulaire (Asano). Sommets triés par
  pseudo-angle (exact et identique pour un sommet partagé), segments actifs dans un tas ordonné
  par « qui est devant » (tests de côté indépendants de l'angle, repli sur la distance le long
  d'un rayon de référence), événements d'un même angle traités en un lot. Deux points émis à
  chaque changement du segment le plus proche.
- **Tests** (`View.contains`) : polygone étoilé testé en O(log n) (dichotomie sur l'angle puis
  côté d'une arête), zones et pièces par grille, lumières par grille puis disque puis polygone.

## Tests

`pnpm --filter @vtt/vision test` : règles du § 9 une par une, cas dégénérés, et tests de
propriété à graine fixe (plus de 6 000 scènes aléatoires comparées à un lancer de rayons naïf,
polygones de murs soudés et presque soudés sans aucune fuite, grandes coordonnées, pièces,
brouillard et lumières composés).
