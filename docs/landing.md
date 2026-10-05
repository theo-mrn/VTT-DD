# Landing (`/`)

Page publique, sombre et aérée : hero (promesse, inscription, la table en grand), trois
fonctionnalités en alternance (combat, vision, fiches), les dés 3D, le reste des outils, un
dernier appel, le pied de page. Code : `frontend/src/components/landing/` ; textes en français,
aucune donnée chargée (seule la session choisit entre « Commencer » et « Ouvrir Yner »).

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
