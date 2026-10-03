# Performances

Objectif : la table jouable partout, portables modestes et Windows compris. Règle : **mesurer
avant de corriger** (le fond vidéo 4K, vraie cause de la chauffe à la table, n'apparaissait pas
à la lecture du code).

## Mesurer

- **`?perf`** dans l'adresse (gardé dans `localStorage`, `?perf=0` l'éteint) : un compteur en bas à
  gauche (`components/perf/perf-overlay.tsx`, `lib/perf/monitor.ts`), sur une seconde glissante :
  - carte : images rendues par seconde, temps par image, et ce qui demande l'image suivante
    (continu, caméra, direct, animations des modules) ; au repos, on attend **0 i/s**, météo
    active comprise. Les images de la météo, rendues dans son propre canvas, n'y figurent pas :
    elles sont comptées à part dans `engine.perf.weather` et `weatherMs` (pas encore affichées
    par le compteur) ;
  - longues tâches (plus de 50 ms) et leur durée ;
  - requêtes réseau par seconde (une tempête de relectures se voit ici) ;
  - messages du temps réel par seconde ;
  - vidéos en lecture et leur définition, nombre de canvas, mémoire JS.
    Désactivée, la mesure ne coûte rien (des compteurs incrémentés, rien d'observé).
- **Profil Chrome** (Performance, 10 s sans toucher) : pistes Frames, GPU et Media pleines au
  repos = quelque chose anime ou décode en continu.
- **Gestionnaire de tâches de Chrome** : l'onglet (JavaScript) ou le processus GPU (rendu,
  vidéo).

## Machines économes

`lib/perf/device.ts` : `prefersEconomy()` vaut pour Windows (pilotes GPU fragiles, cf. les dés)
et les machines à 4 cœurs ou 4 Go au plus. Elles reçoivent par défaut : résolution 1 sans MSAA
sur la carte, brume et fond vidéo figés, météo à 20 i/s et moitié moins de particules, dés sans
antialiasing. Les préférences explicites de l'utilisateur l'emportent toujours.

## Principes retenus

- **Rendu à la demande** partout (carte, dés) : rien ne se dessine tant que rien ne bouge.
- **Météo sur son propre canvas** : un second contexte WebGL transparent au-dessus de la carte,
  créé à la première météo active, avec sa propre boucle (30 i/s, 20 en économie). Une image de
  météo ne rend que ce canvas : avant, chacune redessinait toute la carte (fond, grille, contenu,
  vision), soit 30 rendus complets par seconde tant qu'il pleuvait.
- **Vidéo native** : un fond de carte vidéo est un `<video>` sous le canvas (docs/carte.md), jamais
  copié dans WebGL. Cartes animées de la bibliothèque : variantes 1080p H.264 30 i/s
  (`infra/library/maps-1080p.sh`), décodées par le matériel ; les originaux sont en VP8 4K
  60 i/s, sans décodage matériel.
- **Images à la taille affichée** : `vignette()` (`lib/assets.ts`, redimensionnement Cloudflare).
- **Pas de `backdrop-filter`** au-dessus de la carte : fonds presque opaques à la place.
- **Temps réel** : un événement appliqué une fois par campagne et par domaine
  (`lib/realtime-bridge.ts`), invalidations ciblées.
- **Calculs du moteur de règles** mis en cache par état et système (`lib/rules-cache.ts`).
