# Portraits et tokens

Un personnage a deux images : son **portrait** (fiche, listes, 3:4) et son **token** (carte,
carré). Les deux sortent du **Studio du portrait**, à partir d'une seule image d'origine.

## Le Studio

`frontend/src/components/portraits/portrait-studio.tsx`, ouvert par un clic sur le portrait de la
fiche (qui peut modifier le personnage) et par « Studio » à l'étape Portrait de la création.

- **Image d'origine** : glisser, coller, importer, ou un portrait de la bibliothèque.
- **Deux cadrages** (`react-easy-crop`) : Token (carré, guide rond dès l'arrondi fort) et Portrait
  (3:4). Glisser pour placer, molette ou curseur pour zoomer.
- **Token** : arrondi de 0 % (carré) à 50 % (cercle), marge de 0 à 30 % (l'image rentre dans le
  cadre), cadre choisi parmi ceux de la bibliothèque (catégorie `Token`) ou aucun.
- **Aperçus en direct** : le token à trois tailles sur une trame de carte, la vignette du portrait.

## Enregistrer

Tout est fabriqué dans le navigateur (`lib/portraits/compose.ts`), en WebP :

1. l'image d'origine, si elle vient d'être déposée : envoyée (usage `portrait`, 2400 px au plus) ;
   une adresse déjà en ligne est gardée telle quelle ;
2. le portrait : la zone 3:4, 1200 px de haut au plus (usage `portrait`) ;
3. le token : 512 px, image découpée à l'arrondi dans sa marge, cadre posé par-dessus sur toute la
   surface (usage `token`) ;
4. `PATCH /v1/characters/:id` : `{ avatarUrl, tokenUrl, portraitStudio }`.

`portraitStudio` (`@vtt/contracts`, `PortraitStudio`) garde de quoi rouvrir le Studio tel qu'il
était : `source`, cadrages `portrait` et `token` en **fractions** de l'image (indépendants de sa
taille), `frame`, `radius`, `inset`.

L'image est chargée une fois, sans le cache du navigateur (le CDN de la bibliothèque n'envoie
l'en-tête CORS qu'aux requêtes qui portent un `Origin` ; une copie en cache serait refusée), et
sert au cadrage, aux aperçus et à la fabrication. Une image d'un autre site que le navigateur ne
peut pas lire (Pinterest…) est d'abord importée sur notre stockage (`POST
/v1/characters/:id/uploads/import`, docs/uploads.md) : notre copie devient la source du Studio. Une image qu'on ne peut pas lire fait échouer l'enregistrement (rien
n'est enregistré à moitié).

## Sur la carte

Le token d'un personnage : `imageUrl` du token posé, sinon `tokenUrl` du personnage, sinon son
portrait. Un token du Studio est affiché **entier** (forme et cadre compris), avec un fin anneau de
la couleur de son camp ; un portrait brut reste découpé en rond comme avant.
