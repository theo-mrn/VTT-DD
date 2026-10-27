# Landing (`/`)

Page publique sombre, construite selon la méthode landing-page-design : une offre (une table de
jeu en ligne complète), un public (les MJ), une action (« Créer ma table gratuitement », la même
en haut et en bas). Code : `frontend/src/components/landing/` ; textes dans
`i18n/messages/{fr,en}/landing.ts`, aucune donnée chargée (seule la session choisit entre
« Commencer » et « Ouvrir Yner »).

Ordre des sections (`app/page.tsx`) : navigation flottante, hero, problème (cinq outils remplacés),
scène de la taverne, bénéfices (combat, vision, fiches, ambiance), slogan, étapes, dés 3D, reste de la table, vidéo de
partie, FAQ (avec JSON-LD FAQPage), dernier appel, pied de page.

## Règles visuelles

- Police Geist seule, fonds plats `#000000`, `#181818`, `#272727`, `#313131` ; un seul dégradé,
  sur le texte du titre du hero (blanc vers `#9B9B9B`).
- Icônes Phosphor (`@phosphor-icons/react/ssr`), pas de lucide sur la landing.
- Cadres : 16 px d'arrondi et 8 px de marge, le média dedans garde 8 px.
- Mouvement : courbe `ease-weighted` (`tailwind.config.ts`, la classe arbitraire
  `ease-[cubic-bezier(...)]` ne génère rien), `EASE` dans `apparition.tsx` pour Framer Motion.
  Seuls `transform` et `opacity` s'animent ; les animations réduites ne gardent que l'opacité.

## Animations au défilement

- **Scène de la taverne** (`scene.tsx`), juste après le problème : la section fait quatre écrans
  de haut, la vraie capture `table.webp` reste épinglée et chaque quart du défilement joue un
  chapitre, dans les deux sens :
  1. le noir, sauf la lueur autour du groupe (vision des personnages) ;
  2. la lueur s'élargit à toute la salle, le signal du MJ pointe le capitaine (embuscade) ;
  3. la grille se trace lentement, ligne à ligne, en grandes cases (deux cases de la capture,
     calées sur ses lignes, `GRILLE`), sous les jetons et les panneaux de l'interface ;
  4. les jets d'initiative apparaissent au-dessus de chaque jeton, dans l'ordre du tour.

  Le défilement passe par un ressort (`useSpring`) : la scène suit le doigt sans à-coups.
  Les positions des jetons sont relevées en pourcentage de l'image : une nouvelle capture
  demande de les relever (constantes en tête du fichier).

- `Apparition` : chaque bloc monte de 32 px en s'affichant, une seule fois.
- Problème : chaque ancien outil se barre et la table prend sa place.
- Slogan : les mots s'allument un à un.
- Étapes : un trait se remplit d'une étape à l'autre, chaque pastille s'allume quand il l'atteint.

Les boucles vidéo sont produites par `promotion/landing.mjs` et servies par R2
(`assets.yner.fr/landing/<nom>.{webm,mp4,webp}`).

## Boucles vidéo

`Boucle` pose les sources à 300 px de l'écran et ne lit la vidéo que lorsqu'elle est vraiment à
l'écran (15 %), la reprend au retour sur l'onglet ; si le navigateur refuse la lecture
automatique, ou si les animations sont réduites, l'image d'attente reste avec un bouton de
lecture.

Dés 3D (`des.tsx`) : pas de vidéo. Les rendus de la boutique (`promotion/public/clips/skin-*.mp4`,
1080 × 1080, 79 images) sont découpés image par image, recadrés en 1040 × 1040 sur le dé :
`landing/des-tour-<skin>-<nn>.webp` sur R2 (`nn` de 00 à 78). Un canvas les dessine selon le
défilement : la section fait deux écrans et demi de haut (un quart d'écran de défilement par
skin), une seule rotation dans le même sens la couvre, et chaque skin en tient un sixième. Tous les rendus ont la même pose au même instant :
le skin suivant apparaît en fondu sans que le dé saute ; entre deux poses, la suivante est
dessinée en transparence. Seules les poses utiles à chaque skin se chargent (99 images,
environ 3 Mo), la première de chaque skin d'abord, à 800 px de la section.

Pour refaire les images (depuis `promotion/`), un skin par rendu :
`ffmpeg -i public/clips/skin-<rendu>.mp4 -vf crop=1040:1040:20:10 -start_number 0 <skin>-%02d.png`,
puis `cwebp -q 78`, renommées `des-tour-<skin>-<nn>.webp` dans `out/landing/` et envoyées avec
`./upload-landing.sh <fichiers>`, **toujours avec une liste** : sans argument, le script renvoie
tout `out/landing/`.

Une nouvelle boucle se dépose sur R2 **avant** que le code ne la demande : Cloudflare garde un
404 en cache quatre heures, et un nom déjà demandé trop tôt reste cassé jusque-là.

## Captures

Les visuels de `frontend/public/landing/` sont de vraies captures du staging, prises sur une
campagne de démonstration, « Les Cendres d’Elfsong » (D&D classique) :

- compte MJ et compte joueur de démo, identifiants dans `~/.config/vtt/demo.env` (hors dépôt) ;
- scène « Taverne d’Elfsong » : le groupe face aux bandits, combat lancé (hero, combat) ;
- scène « Cimetière de Brumefonds » : murs simples sur la face arrière d’un tombeau et le long
  d’un muret (ombres portées, squelettes cachés derrière), brouillard sur le flanc gauche, vue de
  la joueuse (vision). Un mur fermé cacherait aussi l’intérieur de ce qu’il entoure ;
- scène « Carrefour des Pendus » : brouillard total, feu de camp, braises, loups cachés ;
- fiche d’Aelwen, rôdeuse elfe du compte joueur (fiches), en 1280 × 820, menu latéral replié.

Pour refaire une capture : se connecter avec le compte voulu (Playwright, Chromium en WebGL
logiciel, 1440 × 900 à l’échelle 2), ouvrir la page, recadrer, exporter en WebP (qualité ≈ 85),
et **changer le nom du fichier** : le cache d’images de Next garde l’ancien rendu sous le même nom.

Les dés de la section « Dés 3D » sont les images cuites par `dice:bake` (`public/dice`).
