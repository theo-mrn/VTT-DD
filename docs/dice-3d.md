# Dés 3D : audit perf et visuel, propositions

État au 26/09/2026, branche `chore/phase-0-monorepo`. Périmètre : `frontend/src/components/(dices)/`
(code repris du legacy) et `components/blocks/dice-widget.tsx` (landing).

Consigne suivie : **pas de refonte**. Le moteur du legacy (`throw-fun`, `visual-die`, `cores`,
matériaux, effets, skins, audio) reste en place. Seules des corrections ciblées, sans changement de
rendu ni d'API, ont été faites (§ 2). Le reste est **proposé** (§ 4) : à toi de choisir.

## 1. Mesures

Méthode : `next build` (Turbopack) sur une copie propre de la branche (worktree), sans le chantier
en cours de l'autre agent. JS du premier chargement = scripts référencés par le HTML pré-rendu.
Poids des bibliothèques : bundle esbuild minifié de chaque import seul. Physique : benchmark
`cannon-es` sous Node (M-series), médiane de 8 lancers.

### Bundles

| Mesure                                     | Avant                    | Après                    |
| ------------------------------------------ | ------------------------ | ------------------------ |
| Premier chargement de `/` (landing)        | 3 735 Ko / **892 Ko gz** | 1 036 Ko / **327 Ko gz** |
| three.js dans le premier chargement de `/` | oui (chunk 3D entier)    | **non**                  |
| Premier chargement de `/dice`              | 1 645 Ko / 454 Ko gz     | 1 646 Ko / 454 Ko gz     |
| Chunk 3D (chargé à la demande)             | 2 700 Ko / 566 Ko gz     | 1 811 Ko / 492 Ko gz     |
| Total des chunks JS                        | 5 469 Ko / 1 378 Ko gz   | 4 644 Ko / 1 326 Ko gz   |

Composition estimée du chunk 3D (import seul, minifié) :

| Morceau                                      | Brut   | gzip   |
| -------------------------------------------- | ------ | ------ |
| `three`                                      | 715 Ko | 184 Ko |
| `@react-three/cannon` (worker cannon inclus) | 742 Ko | 195 Ko |
| `@react-three/drei` `Text` (troika)          | 275 Ko | 92 Ko  |
| drei `useGLTF` (GLTF/Draco/Meshopt)          | 228 Ko | 69 Ko  |
| drei `Environment`                           | 215 Ko | 69 Ko  |
| `@react-three/fiber`                         | 185 Ko | 59 Ko  |
| `cannon-es` seul (pour comparaison)          | 123 Ko | 36 Ko  |

(les morceaux drei partagent `three-stdlib` : la somme dépasse le chunk.)

### Réseau au premier lancer (landing ou lanceur)

| Ressource                                             | Avant                                                              | Après                          |
| ----------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| Textures chargées par le préchauffage                 | 18 textures, **~52 Mo** (dont `merveille_diffuse.png` = **40 Mo**) | 2 textures, ~1,7 Mo            |
| Préchauffage de la landing                            | 600 ms après **chaque** visite                                     | au 1er survol/focus/clic du dé |
| HDR `city` (drei, `raw.githack.com`)                  | 1 requête CDN tiers                                                | inchangé (proposition P6)      |
| Police des numéros (troika → `cdn.jsdelivr.net`)      | index JSON + woff                                                  | inchangé (proposition P5)      |
| Vignette du dé de la landing `/dice/marbre_blanc.png` | 404 → hexagone de repli                                            | image du legacy (254 Ko)       |

### Rendu d'un lancer (inchangé)

- **Draw calls par dé** : corps 1 + liseré (`rimLight`, 42 skins procéduraux sur 43) 1 + numéros
  troika **2 par face** (remplissage + contour). d6 ≈ 14, d20 ≈ 42. 12 d20 ≈ **500 draw calls**.
- **Programmes shaders** : un par style procédural (~25 variantes style × standard/physique ×
  transparence), 1 texturé (+ variante transparente), verre des orbes, texte, liseré. Le
  préchauffage compile 45 skins par lots de 4 (au lieu de 61).
- **Lumières** : 41 skins sur 71 ont `innerGlow` = **une `pointLight` par dé**. Le nombre de
  lumières fait partie de la clé de programme de three (`numPointLights`) : chaque dé lumineux qui
  apparaît ou disparaît **recompile tous les matériaux visibles**. Un pool Star Wars de 5 dés
  (tous `innerGlow`) lancé en décalé = 5 vagues de recompilation. C'est le principal risque
  restant pour le crash Windows (TDR), le préchauffage ne couvrant qu'un seul nombre de lumières.
- **Travail par frame** : 1 `useFrame` par matériau procédural + 1 par face numérotée (20 par d20),
  tant que le dé est affiché (7 s), le lanceur ne passant jamais `stopped` sans résultat imposé.
- **Canevas** : `dpr` [1 ; 1,25], antialias, `frameloop` `always` pendant les 7 s d'affichage
  d'un dé (shaders animés) et pendant le préchauffage, `demand` sinon ; rAF suspendu onglet caché.
- **Physique** (`@react-three/cannon`, worker) : gravité −60, 7 itérations, sommeil activé,
  coque = triangles du maillage rendu (d6 : 48 faces pour 26 sommets, d12 : 36). Le `Physics`
  est démonté quand il n'y a plus de dé : un worker est recréé à chaque série de lancers.
  Benchmark : coque en **faces polygonales** (6 faces pour le d6) = 12 d6 simulés en 8 ms au lieu
  de 44 ms, 12 d12 en 43 ms au lieu de 76 ms.
- **Arène** : murs fixes de 60 × 34 unités ; sur un écran étroit ou vertical, la zone visible est
  plus petite que l'arène et les dés sortent de l'écran (le `Table` du legacy `scene.tsx` suivait
  le viewport, `throw-fun` non).

## 2. Corrections faites (sans changement de rendu ni d'API)

| Commit    | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ca36ecb` | Landing : lanceur chargé à la première intention (survol, focus, clic), plus de three.js au premier rendu. Vignette pré-calculée du legacy copiée dans `public/dice/`. Skins sans la table `asset-mappings.json` (1,1 Mo) : mêmes URL. Survol 3D de `DicePreviewCard` coupé sous Windows.                                                                                                                                                                                                                                                                                  |
| `43958e2` | Libération des matériaux/géométries passés en props (cœurs d'orbe, critique, éclats). Billboard des cœurs et éclats sans allocation par frame. Fondu des numéros sans `getWorldQuaternion` (recalcul de toute la chaîne de parents, 20 fois par d20 et par frame). Texture configurée une fois (`needsUpdate` à chaque rendu = ré-upload complet). Modèle d'orbe introuvable → cœur lumineux au lieu de casser tout le canevas. Impacts du lanceur via le gain maître (le curseur « Dés 3D » du mixeur ne s'appliquait pas). Préchauffage : un skin texturé par programme. |
| `3adc995` | Face imposée et faces à symboles (§ 3). `Throw3D` ne prend plus de cellule dans la grille de l'appelant (son `div` décalait le contenu du lanceur quand la 3D était active).                                                                                                                                                                                                                                                                                                                                                                                               |

Windows : rien de ce qui protège contre le TDR n'a bougé (préchauffage par lots, file d'attente des
lancers pendant le préchauffage, shaders par style). Le survol 3D, lui, est désormais coupé sous
Windows dans `DicePreviewCard` (il ne l'était plus dans le code repris).

## 3. Résultat imposé par le serveur et dés à symboles

**Le legacy le faisait-il ?** Oui, dans `legacy/.../throw.tsx` (le lanceur de la table) : à l'arrêt
du dé, la face voulue était tournée vers le haut (`targetValue`). `throw-fun`, repris dans le
nouveau front, ne le faisait pas : le dé atterrissait au hasard. Les dés à symboles du legacy
affichaient des **numéros** (la face physique faisait autorité), jamais de symboles.

**Ce qui est en place** (mécanisme du legacy porté dans `throw-fun`) :

- `Die3D.value` : valeur lue (dé numérique) ou numéro de face déclarée, 1 = première (dé à
  symboles). Quand le dé est presque arrêté (vitesse < 0,5, rotation < 1, après 400 ms), il est
  basculé sur cette face, vitesses remises à zéro. Amélioration : la bascule est **relative**
  (plus courte rotation) au lieu d'une orientation absolue qui faisait aussi pivoter le dé sur
  lui-même.
- Vérifié hors navigateur : 3 000 essais (6 formes × toutes les valeurs × 50 orientations) →
  toujours la bonne valeur en haut et la face opposée à plat (même hauteur : toutes les formes ont
  des faces opposées parallèles).
- `Die3D.faces` : symboles de chaque face déclarée (`des.sortes[].faces`), dessinés à la place des
  numéros avec l'icône lucide de `presentation.symboles` (repli : libellé court), la couleur du
  symbole si la présentation la donne, sinon celle des numéros de la skin, contour de la skin. Même
  place, taille et fondu que les numéros. Une texture 128² par jeu de symboles, partagée.
- `symbolDice3D(des, système, présentation)` et `numericDice3D(jets, …)` (`dice-3d-input.ts`,
  exportés par `(dices)/index.ts`) construisent les `Die3D` depuis un résultat de `@vtt/rules`.
  Aucune clé de jeu en dur.

**Limites** : la bascule reste visible (sursaut d'orientation à l'arrêt, comme dans le legacy) ; un
dé qui disparaît avant de s'arrêter (7 s) ne bascule pas ; d100 lancé comme un d10 sans valeur
imposée ; la valeur n'est imposée que si la forme porte ce nombre.

API publique inchangée pour les appelants existants : `Throw3D`, `Throw3DHandle.roll(dice)`,
`Die3D` (champs `value` et `faces` optionnels ajoutés), `FunDiceHandle.roll(skin, forme, cible?)`.

## 4. Propositions (à valider une par une)

Classées par rapport gain/effort. Effort : S < ½ j, M ≈ 1 j, L ≥ 2 j.

| #   | Proposition                                                                                                                                                                                                                                                                                          | Gain                                                                                                                                                                            | Effort        | Risque / impact visuel                                                                  |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------- |
| P1  | **Pool fixe de lumières** : 4 `pointLight` toujours présentes, attribuées aux dés `innerGlow` (et aux cœurs d'orbe), au lieu d'une lumière par dé. Nombre de lumières constant → plus aucune recompilation en cours de lancer.                                                                       | Supprime la dernière cause connue de rafale de compilation (TDR Windows) ; coût par pixel borné.                                                                                | S–M           | Au-delà de 4 dés lumineux, les suivants n'éclairent plus leurs voisins (effet discret). |
| P2  | **Coque physique en faces polygonales** (fusion des triangles coplanaires dans `geometry.ts`).                                                                                                                                                                                                       | Collisions 1,8 à 5× moins chères (benchmark ci-dessus), surtout d6/d12.                                                                                                         | S             | Aucun visuel.                                                                           |
| P3  | **Arène ajustée au viewport** : reprendre `Table` + `visibleHalfExtents` de `legacy/scene.tsx` dans `throw-fun`.                                                                                                                                                                                     | Plus de dés hors écran sur mobile/écran étroit.                                                                                                                                 | S             | Trajectoires un peu différentes sur écrans étroits.                                     |
| P4  | **30 i/s quand les dés dorment** (encore affichés, shaders animés) et `Physics` gardé monté (pas de nouveau worker à chaque série).                                                                                                                                                                  | ~50 % de GPU en moins pendant l'affichage au repos (≈ 4 des 7 s).                                                                                                               | S             | Animation des shaders à 30 i/s à l'arrêt.                                               |
| P5  | **Police des numéros auto-hébergée** (`font=` sur `Text`) au lieu de la résolution troika via `cdn.jsdelivr.net`.                                                                                                                                                                                    | Plus de dépendance CDN ni de latence au 1er lancer.                                                                                                                             | S             | Police différente si on ne reprend pas Roboto.                                          |
| P6  | **HDR `city` auto-hébergé** + garde d'erreur autour d'`Environment`.                                                                                                                                                                                                                                 | Plus de requête `raw.githack.com` ; aujourd'hui un échec de ce CDN casse tout le canevas.                                                                                       | S             | Aucun si même fichier.                                                                  |
| P7  | **Ré-encoder les textures** sur R2 : `merveille_diffuse.png` 40 Mo, 9 PNG ~1 Mo → JPEG/WebP/KTX2 1024².                                                                                                                                                                                              | Jusqu'à −95 % de réseau et de mémoire GPU pour ces skins.                                                                                                                       | S (hors code) | Aucun à 1024².                                                                          |
| P8  | **Modèles des orbes** : `/3d/*.glb` absents de `frontend/public` (27 Mo dans `legacy/public/3d`, `book.glb` 10,7 Mo). Les héberger sur R2 compressés (gltf-transform + Draco/Meshopt).                                                                                                               | Orbes à modèle de nouveau fonctionnels (repli cœur lumineux aujourd'hui).                                                                                                       | S             | —                                                                                       |
| P9  | **`dpr` adaptatif** (drei `PerformanceMonitor`) : 1,25 → 1 → 0,85 si les frames dépassent 25 ms.                                                                                                                                                                                                     | Fluidité sur GPU faibles (shaders procéduraux coûteux par pixel).                                                                                                               | S             | Image un peu plus douce sur machines lentes.                                            |
| P10 | **`prefers-reduced-motion`** : pas d'animation 3D, résultat 2D seul (le panneau l'affiche déjà).                                                                                                                                                                                                     | Accessibilité.                                                                                                                                                                  | S             | —                                                                                       |
| P11 | **Numéros et symboles en atlas** : une texture par jeu d'étiquettes + un seul maillage par dé, fondu calculé dans le shader (au lieu de troika : 2 draw calls et 1 `useFrame` par face).                                                                                                             | d20 : 42 → 3 draw calls ; 12 d20 : ~500 → ~36 ; −92 Ko gz (troika) ; plus de CDN de police.                                                                                     | M             | Rendu des chiffres légèrement différent (police canvas).                                |
| P12 | **Pré-simulation du lancer** (cannon-es direct, pas de temps fixe, rejouée) : face connue d'avance, le dé visuel est tourné par une symétrie du solide pour montrer la face imposée **sans bascule** à la fin ; dés « cassés » (sur une arête) détectés et relancés. Remplace `@react-three/cannon`. | Atterrissage imposé invisible ; −160 Ko gz (worker cannon) ; plus de physique au rendu. Benchmark : 1 à 6 d20 simulés en < 12 ms, 12 d12 ≈ 45 ms (découpé en tranches de 6 ms). | L             | Refonte du lanceur : à faire seulement si la bascule actuelle gêne.                     |
| P13 | **Un seul canevas partagé** landing / lanceur / « Essayer » de la boutique, monté à la demande, libéré après inactivité.                                                                                                                                                                             | Plus de contextes WebGL multiples ni de préchauffage par instance.                                                                                                              | M             | —                                                                                       |
| P14 | **Vrais d4 (tétraèdre) et d10 (trapézoèdre)** : aujourd'hui octaèdre et icosaèdre avec valeurs répétées. d100 = paire de d10 (dizaines + unités).                                                                                                                                                    | Fidélité visuelle.                                                                                                                                                              | M             | Nouvelles coques physiques à régler.                                                    |
| P15 | **Effets critique/échec** (particules, bris du dé) quand le serveur signale un critique : le code existe (`effects/critical.tsx`, utilisé par le legacy `throw.tsx`), pas branché dans `throw-fun`.                                                                                                  | Visuel.                                                                                                                                                                         | S             | La lumière du flash change le nombre de lumières → à faire avec P1.                     |
| P16 | **Écho grave** sur l'impact (délai ~120 ms, rétroaction 0,25, passe-bas 900 Hz) selon la règle « grave avec écho, jamais d'aigus ».                                                                                                                                                                  | Audio.                                                                                                                                                                          | S             | Goût : à écouter avant de garder.                                                       |

Ordre conseillé : P1 (sécurité Windows), P7 + P8 (hors code), P2, P3, P4, puis P11 ou P12 selon
qu'on veuille d'abord alléger le rendu ou supprimer la bascule.

## 5. À vérifier à l'écran

1. **Landing** : le dé en bas à droite montre l'image du marbre blanc (plus l'hexagone) ; aucun
   téléchargement de three.js avant de survoler le dé (onglet Réseau) ; premier clic : le d20 part
   après le préchauffage, clics rapides mis en file.
2. **Lanceur `/dice` avec l'animation 3D** : la mise en page ne se décale plus quand la 3D est
   activée ; les dés tombent comme avant ; le curseur « Dés 3D » du mixeur règle leur volume.
3. **Face imposée** (dès que le panneau passe `value`) : le dé s'arrête, bascule sur la bonne face,
   la face opposée est à plat, pas de rotation parasite autour de la verticale.
4. **Dés Star Wars** (panneau avec `symbolDice3D`) : icônes lisibles sur chaque skin kyber, faces
   vides sans rien, faces à 2 symboles côte à côte, fondu des faces du dessous comme les numéros.
5. **Windows** : aucun canevas au survol des cartes de dés ; lancer un pool Star Wars de 5+ dés
   (risque P1 toujours présent).
6. **Skins texturés** (rubis, bois…) lancés depuis la boutique : texture présente après un bref
   aplat de couleur au premier lancer de chaque skin (elle n'est plus préchargée).
7. **Orbes à modèle** : cœur lumineux à la place du modèle tant que P8 n'est pas fait.

## Images des dés (boutique, réglages)

La grille de la boutique et les réglages n'affichent que des images pré-calculées, jamais de
canevas WebGL : `frontend/public/dice/<skin>.webp` (512 px) et `public/dice/thumbs/<skin>.webp`
(128 px). Elles sont cuites par le vrai moteur 3D (d20, face 20 de face, fond transparent) :

```bash
pnpm --filter @vtt/web dice:bake            # skins sans image (dé ajouté au catalogue)
pnpm --filter @vtt/web dice:bake --all      # tous (rendu, matière ou éclairage modifié)
pnpm --filter @vtt/web dice:bake gold ruby  # ces skins seulement
```

Chromium sans interface et WebGL logiciel, sans serveur de dev (`frontend/scripts/dice-bake`),
environ trois secondes par dé. La CI échoue si un skin de `dice-definitions.ts` n'a pas ses deux
images (`frontend/src/lib/dice-images.test.ts`).
