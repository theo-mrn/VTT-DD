# Import de cartes UVTT (murs, portes, lumières)

> Conception du 2026-11-11, validée par Théo le même jour. Feuille de route : priorité 1.

## 1. Le besoin

Un MJ qui dessine ses cartes dans Dungeondraft, DungeonAlchemist, Dungeon Painter ou DungeonFog
exporte un fichier **Universal VTT** (`.dd2vtt`, `.uvtt`, `.df2vtt`). Ce fichier contient l'image
et tout ce qui sert à la vue : murs, portes, lumières, quadrillage. Aujourd'hui, il retrace tous
ses murs à la main dans Yner. L'import le fait en une fois.

## 2. Le format

Un seul document JSON (le format est le même pour les trois extensions) :

| Champ                        | Contenu                                                                   |
| ---------------------------- | ------------------------------------------------------------------------- |
| `resolution.pixels_per_grid` | côté d'une case, en pixels de l'image                                     |
| `resolution.map_origin`      | origine, en cases (souvent 0, 0)                                          |
| `resolution.map_size`        | taille de la carte, en cases                                              |
| `line_of_sight`              | murs : listes de points, en cases                                         |
| `objects_line_of_sight`      | murs des objets (DungeonAlchemist : rochers, colonnes), même forme        |
| `portals`                    | portes : `bounds` (2 points), `closed`, `freestanding`                    |
| `lights`                     | `position`, `range` (cases), `intensity`, `color` (`AARRGGBB`), `shadows` |
| `environment`                | `baked_lighting` (ombres peintes dans l'image), `ambient_light`           |
| `image`                      | l'image en base64 (PNG ou WebP), souvent 5 à 30 Mo                        |

Coordonnées en cases : `pixel = (point − map_origin) × pixels_per_grid`.

## 3. Ce qui existe déjà et suffit

Rien à ajouter côté serveur :

- **Fond** : envoi d'image de la médiathèque (`map-background`, réduite à 4096 px de côté au
  plus, WebP, R2).
- **Scène** : `POST /maps` avec `width`, `height`, `grids` (grille de jeu).
- **Murs et portes** : `POST /maps/:id/obstacles/batch`, 500 éléments par lot, en une
  transaction. Une carte de DungeonAlchemist compte souvent 1 000 à 3 000 segments, soit 2 à
  6 lots.
- **Lumières** : `POST /maps/:id/lights/batch`, rayon en cases (comme `range`).

L'import est donc **entièrement dans le navigateur** : lecture du fichier, conversion, puis
appels existants. Le format des scènes de pack (`PackScene`, marketplace) sert de forme
intermédiaire : la même conversion servira plus tard à proposer des cartes UVTT dans un pack.

## 4. Conversion

1. **Image** : base64 → `File`, préparée comme un fond importé. Si elle est réduite (côté au-delà
   de 4096 px), un facteur `k = largeur envoyée / largeur d'origine` s'applique à tout ce qui suit.
2. **Quadrillage** : une grille de jeu de côté `pixels_per_grid × k`, décalage 0, cachée aux
   joueurs (la grille est souvent déjà dessinée dans l'image).
3. **Murs** : chaque liste de `line_of_sight` → un obstacle `wall`. Points consécutifs alignés
   fusionnés, points en double retirés, segments de moins d'un pixel écartés. Les listes de plus
   de 1 000 points (limite du contrat) sont coupées en plusieurs murs soudés bout à bout.
4. **Murs d'objets** (`objects_line_of_sight`) : murs à part, même traitement.
5. **Portes** : chaque `portal` → obstacle `door`, `isOpen = !closed`, jamais verrouillée.
6. **Lumières** : `range` → rayon en cases, `color` (`AARRGGBB`) → `#RRGGBB`, `intensity`
   bornée à 0–1, `falloff` 0,5 (valeur par défaut de l'outil). Ignorées si `baked_lighting` :
   l'image porte déjà ses ombres.
7. **Cadre de l'image** : murs coupés au bord, portes et lumières hors de l'image écartées.
   Dungeondraft exporte les murs de tout le niveau même quand l'image n'en montre qu'une partie
   (« Red Tower » : image de 10 × 12 cases, murs sur 60 × 42).
8. **Brouillard** : comme une scène neuve (réglage de la campagne).

En cas d'échec en cours d'import (réseau), la scène créée est supprimée : jamais de scène à
moitié importée.

## 5. Interface

Un bouton « Importer une carte » (icône seule, info-bulle) dans le panneau des scènes, à côté
de « Scène » ; la scène arrive dans le dossier filtré, comme une nouvelle scène. Une fenêtre courte : aperçu de l'image,
nom (celui du fichier), compteurs (murs, portes, lumières) et deux cases repliées (murs
d'objets, lumières). Puis une barre de progression ; à la fin, la nouvelle scène s'ouvre.

## 6. Hors périmètre

- Détection automatique des murs dans une image sans fichier UVTT (vision par ordinateur).
- Export d'une scène Yner en UVTT.
- Fenêtres : le format ne les distingue pas des murs.

## 7. Questions à trancher

Tranchées par Théo le 2026-11-11 :

- **Destination** : toujours une nouvelle scène (pas d'import dans la scène ouverte).
- **Lumières** : importées, sauf si `environment.baked_lighting` (ombres déjà peintes).
- **Taille** : image réduite à 4096 px de côté comme tout fond ; murs, portes, lumières et
  grille suivent le facteur de réduction.

## 8. Lots

| Lot | Contenu                                                                       | État                                   |
| --- | ----------------------------------------------------------------------------- | -------------------------------------- |
| 1   | Conversion pure (`lib/map/uvtt/convert.ts`)                                   | fait, testé sur des fichiers fabriqués |
| 2   | Import (`lib/map/uvtt/import.ts`) : image, scène, lots, suppression si échec  | fait                                   |
| 3   | Fenêtre (`components/map/scenes/uvtt-import-dialog.tsx`) et bouton du panneau | fait                                   |
| 4   | Glisser un `.dd2vtt` sur la carte                                             | à faire                                |
| 5   | Essai sur de vrais exports (Dungeondraft, DungeonAlchemist)                   | à faire par Théo                       |
