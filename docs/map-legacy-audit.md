# Carte : état du portage et audit critique du legacy

Ce document sert au passage dédié de refonte de la carte (canvas, outils, PNJ, ombres, visibilité).
Le portage actuel est **une référence temporaire gelée**, pas l'architecture cible.

Backend prêt : [map.md](map.md), [api-map.md](api-map.md) (PostGIS, visibilité calculée par le
serveur, événements `map.*` / `token.*` / `map_<couche>.*`), temps réel : [api-realtime.md](api-realtime.md).

## Portage actuel (commits 9d679a99, 291eb584, 58e787c1)

- `frontend/src/app/(campaigns)/campaigns/[id]/play/map/` : `map-view.tsx` (ex-`page.tsx`, ~5 000
  lignes), `map-layout.tsx` (fournisseurs de l'ancien `layout.tsx`), `renderers/`, `shadows.tsx`…
- Copiés tels quels : `hooks/map/*`, `components/(map)`, menus de `(overlays)`, `CitiesManager`,
  contextes, `lib/visibility`, `lib/obstacle-utils`, `utils/paste*`.
- Accès aux données remplacé :
  - `lib/maps.ts` : client REST ;
  - `hooks/map/map-store.ts` : état par campagne, patché par les événements ;
  - `map-adapters.ts` : anciens champs → nouveaux ;
  - `map-writes.ts` : écritures sous les anciens noms de collection ;
  - `map-ephemeral.ts` : canal éphémère.
- Aucun import `firebase`, aucun `logHistoryEvent` : l'historique vient du bus.

### Fonctionne

- Lecture : fond (la carte `isDefault` remplace le fond global), tokens, objets, lumières, murs et
  portes, dessins, textes, zones sonores, portails, gabarits, brouillard, météo, calques. Un joueur
  suit la carte de son personnage.
- Écritures : déplacement de tokens (`POST …/tokens/move`), réglages MJ des tokens, vision
  augmentée, CRUD de toutes les couches, brouillard, réglages, fond, météo, spawn, portails
  (`/travel`), scènes, dossiers et groupe (`CitiesManager`), annuler/refaire.
- Temps réel : événements appliqués localement, relecture REST à la (re)connexion. Canal
  éphémère : curseurs, bulles, gabarits temporaires, drag (10/s, MJ seulement si caché).

### Désactivé (« Bientôt disponible »)

- Attaque et combat depuis la carte, interactions (marchand, mini-jeu, butin), partage d'écran.
- Bibliothèques de PNJ, d'objets et de sons, recherche unifiée, placement depuis une bibliothèque,
  coller ou dupliquer un PNJ.
- Nom, stats et états d'un token dans son panneau, entités de groupe (vaisseaux), modules/bundles.
- Envoi de fichiers audio et de fonds vidéo, lecture d'une zone sonore pour toute la table (en
  attente du service audio, [audio.md](audio.md)), surlignage des cibles attaquées.
- Discord et l'ancienne barre latérale.

### Manques backend relevés

- Envoi audio et vidéo : `/image` n'accepte que les images de 5 Mo au plus. L'audio relève du
  service audio.
- Un joueur qui déplace un allié reçoit un 403, alors que le legacy le permettait.
- Pas de champ d'états (conditions) sur un token.
- Pas de création de PNJ en une fois (personnage, engagement et token).
- Pas de rapports d'attaque ni de cibles engagées.
- Pas d'entités de groupe.
- Pas de route « où est mon personnage » : le front parcourt les `/tokens` de chaque carte.
- Curseurs et bulles sans état initial : un joueur qui arrive ne voit que les suivants.

## Critique de l'architecture legacy

Chemins relatifs à `legacy/src` ; `page.tsx` désigne `app/[roomid]/map/page.tsx`.

1. **Composant géant.** `page.tsx` fait 4 183 lignes, avec 196 `useState`, 60 `useRef` et
   66 `useEffect`. L'état de chaque outil vit à plat (`page.tsx:141-835`).
2. **Souris.** Trois hooks reçoivent des sacs de 152, 99 et 186 paramètres
   (`useCanvasMouseDown.ts:63-278`, `useCanvasMouseMove.ts:15-175`, `useCanvasMouseUp.ts:24-278`,
   appelés en `page.tsx:2451`, `2506`, `2544`). Les outils sont des chaînes de `if` sur des booléens,
   pas des machines à états (`useCanvasMouseDown.ts:457`, `484`, `539`, `722`, `740`, `811`,
   `965`, `1059`).
3. **État dupliqué.** Chaque donnée de rendu existe en state et en ref, recopiée par une vingtaine
   d'effets (`page.tsx:736-763`, `1314-1342`). Une ref est même passée par valeur, donc périmée
   (`page.tsx:782`).
4. **Rendu couplé à React.** Un seul effet redessine trois canvas avec environ 80 dépendances
   (`page.tsx:1572-1722`). Chaque mousemove re-rend toute la page, d'où des rustines : rAF
   (`page.tsx:2699`) et calcul d'ombres limité en fréquence (`page.tsx:1497`).
5. **Accès aux données éparpillé.** Firestore et la RTDB sont appelés partout (page, hooks,
   `MapContextMenus`, `MapDialogs`, `CitiesManager`). La position d'un personnage est coupée entre
   Firestore et une surcouche RTDB fusionnée à la main (`page.tsx:1204-1258`,
   `useCharacterPositions.ts`).
6. **Migrations de données lancées par n'importe quel client à la lecture** : polygones → murs
   (`useRtdbCollections.ts:167`), copie Firestore → RTDB (`useRtdbCollections.ts:230-265`,
   `useCharacterPositions.ts:50-71`).
7. **Visibilité seulement côté client.** Tous les personnages, cachés compris, sont envoyés à tous
   (`useMapData.ts:190`), puis filtrés dans le navigateur (`utils/visibility-checks.ts:85`) : les
   tokens cachés fuient chez les joueurs. Le nouveau backend filtre côté serveur.
8. **Annuler/refaire lié aux chemins Firebase** : un `getDoc` avant chaque écriture
   (`useFirestoreWithHistory.ts:49`, `83`, `121`) et un rejeu par chemin
   (`contexts/UndoRedoContext.tsx:71`, `153`).
9. **Modèle de scène incohérent** : « pas de `cityId` = fond global » est un cas particulier
   partout, avec des documents parallèles (`useMapData.ts:271` `fond1`, `310` `layers` contre
   `layers_{id}`, `382` `fogData` contre `fog_{id}`). La scène d'un joueur est recalculée à la main
   (`page.tsx:1349-1393`).
10. **Divers fragiles :**
    - brouillard réécrit en entier (`shadows.tsx:67`), avec des clés qui finissent par une espace
      (`shadows.tsx:13`) et une taille de case qui dépend de l'image chargée sur chaque client
      (`useVisibilityState.ts:71`) ;
    - gabarits temporaires nettoyés par un intervalle dans chaque client (`page.tsx:612`), et un
      nouveau gabarit supprime les permanents (`useCanvasMouseDown.ts:757`) ;
    - globales `window.__visibilityToolsActive` (`page.tsx:840`) et événements `window`
      (`page.tsx:237`) ;
    - `MapDialogs` a 79 props (`MapDialogs.tsx:38-150`) ;
    - `Character` mélange token et fiche derrière `[key: string]: unknown` (`types.ts:56`).

## Pistes pour la refonte

À trancher lors du passage dédié :

- moteur de rendu découplé de React (Canvas 2D par couches ou WebGL) ;
- store normalisé avec index spatial ;
- outils en machines à états testables sans DOM ;
- commandes sérialisables do/undo, pour l'annuler/refaire et l'optimiste ;
- visibilité faisant autorité côté serveur, le client ne faisant que le rendu du brouillard et des
  ombres ;
- UI (barre d'outils, inspecteur, menus) en composants du design system
  ([frontend-architecture.md](frontend-architecture.md)).
