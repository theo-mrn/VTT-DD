# Bibliothèque : fonds de scène partagés, recherche par contexte

> Conception du 2026-11-01. Principe validé avec Théo : un service à part, des descriptions
> écrites par l'IA à l'import, une recherche plein texte ; la similarité visuelle plus tard.

## Constat

- Les fonds proposés viennent de `frontend/public/asset-mappings.json` : 3 863 entrées (objets,
  portraits, textures…) dont environ 450 cartes de fond (`Map/<lieu>/<Static|Animated|Illustration>`),
  envoyées telles quelles au navigateur. Le sélecteur (`components/map/scenes/background-picker.tsx`)
  filtre par dossier et par nom de fichier : rien ne cherche dans ce que montre l'image.
- Nouveau lot, « DndBackdrop Images » (export Google Drive, partie 9) : 508 PNG de
  1456 × 832 (1 Go), 140 prompts en 4 variantes chacun, 3 collections (Kings Old Fort,
  Mystical Forest, Dark Mountains). Des décors en vue de face, pas des cartes vues du dessus.
  Le nom de fichier porte le début du prompt anglais, coupé vers 40 caractères :
  `boldbrushstudio_<Collection>_<début du prompt>_<uuid>_<variante>.png`.
- Postgres (CNPG `postgis:17-3.5`) : `unaccent` et `pg_trgm` disponibles ; `vector` absent de
  l'image (vérifié sur le staging).
- La passe des orphelins ne balaie que `campaigns/` ; un fond de scène cite son image par son
  URL (`backgroundUrl`), quelle qu'elle soit.

## Décisions

1. **Service `backend/library`**, schéma `library`. Catalogue partagé, sans campagne : lu par
   tout utilisateur connecté, écrit seulement par l'import. Hors quota de campagne, hors passe
   des orphelins. La médiathèque (« Mes images », [mediatheque.md](mediatheque.md)) reste dans
   campaign.
2. **Deux usages, toujours séparés** (`kind`) : le **plan de carte** (`map`), vu du dessus, où
   les joueurs posent leurs jetons ; l'**illustration** (`illustration`), un décor vu de face,
   pour l'ambiance. L'import le déclare selon la source : l'export DndBackdrop et les dossiers
   « Illustration » de l'ancien catalogue sont des illustrations, le reste des plans. Le
   sélecteur les montre en deux onglets, chacun avec ses filtres et ses collections.
3. **Une entrée = un lieu**, avec ses **variantes** : les 4 images d'un même prompt, ou, pour les
   cartes existantes, les versions avec ou sans grille, fixe ou animée. Une recherche rend des
   lieux, pas quatre images presque identiques.
4. **Description à l'import, une fois par lieu** : un modèle Claude avec la vue regarde la
   première variante et rend un JSON (titre, description, mots-clés avec synonymes, facettes) en
   français et en anglais. Une description par lieu : 140 appels pour ce lot, pas 508.
5. **Recherche plein texte Postgres** sur titre, mots-clés et description, sans accents, par
   préfixes (« grot » trouve « grotte »), en français et en anglais à la fois, avec des filtres par
   facette. Aucun modèle ne tourne pendant une recherche. Comme les notes de campaign : le
   service écrit les formes sans accents, aucune extension (`unaccent`, `pg_trgm`) n'est
   installée en base.
6. **Plus tard, si le plein texte ne suffit pas** : similarité visuelle par vecteurs (« images
   qui ressemblent à celle-ci »), soit avec une image Postgres qui porte `vector`, soit avec un
   index en mémoire dans le service (assez jusqu'à quelques dizaines de milliers d'images).

## Fichiers sur R2

Clés fixes, déduites du fichier source : un import relancé retrouve ce qui est déjà envoyé.

| Clé                                     | Contenu                                          |
| --------------------------------------- | ------------------------------------------------ |
| `library/originals/<source>/<id>.<ext>` | original intact (le PNG), jamais lu par le front |
| `library/backgrounds/<id>.webp`         | image pleine taille, WebP qualité 82             |
| `library/backgrounds/thumbs/<id>.webp`  | vignette de 480 px de large                      |

`<id>` d'une image Midjourney : `<uuid>-<variante>` ; `<source>` : `dndbackdrop`. Plan d'un pack
(`mappacks`) : `mp-<pack>-<numéro sur 4 chiffres>`, réduit à 2048 px de côté (WebP qualité 80),
sans original sur R2. Les cartes
déjà publiées (`Map/…` sur `assets.yner.fr`) gardent leurs URL : l'entrée les cite sans les
recopier.

## Données (schéma `library`)

```sql
CREATE TABLE library.backgrounds (
  id             uuid PRIMARY KEY,
  source         text NOT NULL,               -- 'dndbackdrop', 'asset-mappings', 'mappacks'
  source_key     text NOT NULL UNIQUE,        -- uuid du prompt, ou dossier + nom de la carte
  collection     text,                        -- 'Kings Old Fort', 'Forêt'…
  title_fr       text NOT NULL,
  title_en       text NOT NULL,
  description_fr text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  keywords_fr    text[] NOT NULL DEFAULT '{}',
  keywords_en    text[] NOT NULL DEFAULT '{}',
  place          text,                        -- forest, castle, cave, tavern, village, mountain…
  setting        text,                        -- indoor, outdoor, underground
  time_of_day    text,                        -- day, night, dusk, unknown
  moods          text[] NOT NULL DEFAULT '{}',-- peaceful, eerie, magical, epic, grim…
  elements       text[] NOT NULL DEFAULT '{}',-- tree, waterfall, crystals, ruins… (anglais)
  animated       boolean NOT NULL DEFAULT false,
  search_fr      tsvector GENERATED ALWAYS AS (…) STORED,  -- poids A titre + mots-clés, B éléments, C description
  search_en      tsvector GENERATED ALWAYS AS (…) STORED,
  described_by   text,                        -- modèle et version du gabarit de description
  described_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE library.background_variants (
  id            uuid PRIMARY KEY,
  background_id uuid NOT NULL REFERENCES library.backgrounds ON DELETE CASCADE,
  position      int  NOT NULL,                -- 0 : variante montrée par défaut
  url           text NOT NULL,
  thumb_url     text,
  preview_url   text,                         -- aperçu animé (vidéo)
  original_key  text,
  kind          text NOT NULL CHECK (kind IN ('image', 'video')),
  grid          boolean NOT NULL DEFAULT false,
  width int, height int, bytes bigint,
  UNIQUE (background_id, position)
);
```

Le schéma réel est dans `backend/library/db/changes/` (`0001-backgrounds.sql`, puis
`0002-background-kind.sql` : la colonne `kind`, `map` ou `illustration`). Différence avec le croquis
ci-dessus : pas de colonne `elements` (les éléments visibles sont dans les mots-clés), et quatre
colonnes de recherche écrites par le service (`search_head_*` : titre, mots-clés, collection,
poids A ; `search_body_*` : description, poids C), d'où les vecteurs générés `search_fr`
(configurations `french` et `simple`) et `search_en` (`english` et `simple`).

Index : GIN sur `search_fr`, `search_en` et `moods`, B-tree sur `place`, `setting`,
`time_of_day` et sur l'ordre stable (collection, titre). Les valeurs de facettes sont des clés
anglaises ; le front les traduit.

## Import

`pnpm --filter @vtt/library run ingest <dossier> [--source dndbackdrop] [--limit N | --sample N]
[--describe] [--redescribe] [--dry-run] [--concurrency N]` (CLI du service, lancé à la main ou en Job) :

1. lit les fichiers, regroupe les variantes par prompt ;
2. pour chaque image absente de R2 : WebP pleine taille et vignette (sharp), original, envoi ;
3. avec `--describe`, pour chaque lieu sans description (ou tous avec `--redescribe`) : appel au
   modèle avec la variante 0 réduite à 1024 px, sortie structurée validée (zod), nettoyée, écrite ;
   `described_by` = `<modèle>#<gabarit>` (changer `DESCRIBE_TEMPLATE` fait tout redécrire). Modèle
   `LIBRARY_DESCRIBE_MODEL` (`claude-opus-5-5` par défaut), effort `LIBRARY_DESCRIBE_EFFORT`
   (`medium`) ; un refus du modèle repasse côté serveur sur le modèle de repli recommandé
   (`fallbacks: 'default'`) ;
4. upsert des lignes ; rapport : lieux, images envoyées, descriptions, coût en jetons.

La clé de l'API Claude ne sert qu'à l'import : elle n'est pas dans le service qui tourne.
Un échantillon de 10 lieux passe d'abord, pour juger la qualité et chiffrer le lot.

Les ~450 cartes `Map/` d'`asset-mappings.json` passent par le même import (`--source
asset-mappings`), sans renvoi de fichier : décrites depuis leur image fixe ou l'affiche de leur
animation.

Les packs de plans de carte (`--source mappacks`) : un dossier par pack, `<Pack>/Gridless/<Nom>
(<n>).webp`, seule la version sans grille est lue. Usage `map` d'office, collection = nom du pack.
Les WebP d'origine (3072 px, ~1,4 Mo) restent dans les zips ; R2 reçoit une version 2048 px
(~0,6 Mo) et sa vignette. 5 000 plans le 2026-11-01 : Vikings, Treasure rooms, Transylvania,
Winter, Wizard Tower (1 000 chacun).

### Description par des agents, sans l'API

Pour un gros lot, la description peut passer par des agents Claude Code plutôt que par l'API :

1. `run ingest <dossier> --skip-files --agents <dossier-lots> --batch 60` : les lieux en base, et
   pour chaque lieu à décrire une image réduite (1024 px) et des lots `batch-NNN.json`
   (`{ source, jobs: [{ key, image, hint, collection }] }`) ;
2. un agent par lot : il ouvre chaque image et écrit ses réponses par paquets de 20,
   `answers-NNN-K.json` (`{ source, answers: [...] }`), la réponse de l'API plus `view`
   (`top_down` : plan de carte ; `scene` : illustration) ;
3. `run apply-descriptions <answers…>` : chaque réponse est validée et nettoyée comme celle de
   l'API, enregistrée avec `described_by = agent#<gabarit>`, et `view` fixe l'usage (sauf avec
   `--keep-kind` : l'usage déclaré par la source, les packs de plans, ne change pas) ;
4. comparer les clés des lots et des réponses : un agent peut en sauter, un lot de reprise les
   rattrape.

Tri sur planches (2026-11-01) : les fonds se ressemblent par le thème, pas au pixel (aucun
doublon visuel parmi les 5 000 plans). Des planches de 30 vignettes, cartes semblables côte à côte,
sont triées à l'œil par des agents qui gardent les plus variées et écartent vues en biais,
moderne, textures, grilles, textes. Résultat : 1 520 plans gardés sur 5 000 (≈ 300 par pack).
Pour les lieux DndBackdrop, une planche montre les 4 variantes de 8 lieux et l'agent garde la
meilleure : `run prune-variants --source dndbackdrop <choix.json>` (`{ clé: [positions] }`)
retire les autres (R2 et base) et renumérote la variante gardée en 0.

Retirer un lieu hors sujet (moderne, abstrait, pas un lieu) : `run remove --source <source>
--reason <raison> [--from <liste>] <clé ou préfixe>…` supprime ses fichiers sur R2 et ses lignes, et l'inscrit dans
`src/import/excluded.json` : l'import ne le remet jamais. 34 lieux retirés ainsi le 2026-11-01
(28 modernes, 6 qui ne sont pas des lieux).

Envoi des fichiers à part : `run ingest <dossier> --concurrency 6` (WebP et vignettes ; les PNG
d'origine ne partent qu'avec `--originals`, la place sur R2 étant comptée : au-delà
de quelques envois en parallèle, R2 refuse des requêtes signées trop tôt, `RequestTimeTooSkewed`).

## API (gateway : `'/v1/library': 'UPSTREAM_LIBRARY_URL'`)

| Méthode | Route                            | Réponse                                                         |
| ------- | -------------------------------- | --------------------------------------------------------------- |
| GET     | `/v1/library/backgrounds`        | `{ items: Background[], nextCursor }` ; voir les paramètres     |
| GET     | `/v1/library/backgrounds/facets` | nombre d'entrées par valeur de facette (pour les menus filtres) |
| GET     | `/v1/library/backgrounds/:id`    | `Background` avec toutes ses variantes                          |

Paramètres de la liste : `q`, `lang` (`fr`, `en` : langue des textes servis), `kind` (`map`,
`illustration`), `place`,
`setting`, `time`, `mood`, `animated` (`0`, `1`), `page` ; 30 par page, `{ items, page, perPage,
total }` comme le catalogue de la marketplace. Sans `q` : ordre stable (collection, titre). Avec
`q` : chaque terme (8 au plus, lettres et chiffres) est un préfixe cherché dans les deux langues ;
tous les termes d'abord, n'importe lequel si aucun lieu ne les a tous ; classé par `ts_rank_cd`.

Types partagés : `packages/contracts/src/library.ts` (`Background`, `BackgroundVariant`,
`BackgroundFacets`, `BackgroundQuery`).

## Le sélecteur de fonds

`components/map/scenes/background-picker.tsx` (et `background-preview.tsx`), sur
`lib/library.ts`, en un seul écran, sans texte explicatif :

- les deux usages en onglets, centrés : « Plans de carte » et « Illustrations », avec leur
  nombre ; le sélecteur s'ouvre sur l'usage du fond actuel ; changer d'onglet repart de zéro
  (filtres et collections d'un usage ne valent pas pour l'autre), et l'exemple de la recherche
  suit l'usage ;
- en haut, le titre, le fond actuel (retrouvé par `GET /v1/library/backgrounds/lookup?url=`,
  sinon nommé d'après son fichier) avec « Retirer », et la fermeture ;
- au centre, la grande saisie de recherche (« / » y revient) ; dessous, centrés, les filtres en
  menus déroulants (`FilterMenu`) : collection, lieu, cadre, moment, ambiance, fixe ou animé,
  avec leur nombre (`/facets`) ;
- sans recherche ni filtre : les collections en vignettes (couverture : `covers` des facettes),
  puis tous les fonds ; une collection choisie remplace le titre de la liste (retour d'un clic) ;
- la grille se charge par pages au défilement ; son premier carreau importe un fichier, et un
  fichier glissé n'importe où dans le sélecteur ouvre l'import (`ImageDrop` : envoi, collage,
  adresse, recadrage, médiathèque de la campagne) ;
- au clic, l'aperçu en grand par-dessus la grille : la version choisie, ses versions (variantes,
  grille dessinée), le titre, les facettes, la collection, la description, « Utiliser ce fond » ;
  flèches (et ← →) vers le fond précédent ou suivant, la page suivante se chargeant au besoin ;
- Échap ferme d'abord l'aperçu ou l'import, puis le sélecteur.

## Phases

1. Ce document.
2. Envoi du lot sur R2 (originaux, WebP, vignettes), aux clés ci-dessus. **Fait le 2026-11-01** :
   508 images, 92 Mo en WebP (1 Go en PNG), 10 Mo de vignettes.
3. Service : migrations, CLI d'import, descriptions (échantillon de 10, puis tout le lot).
   **Fait le 2026-11-01** : 140 lieux et 508 variantes importés et décrits en dev
   (claude-opus-5-5, 0,0185 $ par lieu).
4. API de recherche et contrats. **Fait le 2026-11-01** : routes, contrats
   (`packages/contracts/src/library.ts`), route de la gateway, tests (unitaires, intégration sur
   Postgres, droits du schéma), CI (migrations, droits, intégration, images).
5. Nouveau sélecteur de fonds. **Fait le 2026-11-01** (dev, non commité).
6. Import des cartes `Map/` existantes ; le sélecteur ne lit plus `asset-mappings.json`.
   **Fait le 2026-11-01 en dev** : 290 lieux (362 variantes), tous décrits (5,06 $). Avec
   les 140 lieux « DndBackdrop » (2,58 $), les 430 lieux de la bibliothèque sont décrits pour
   7,64 $ (0,018 $ par lieu, claude-opus-5-5).
7. Déploiement : `release.yml` (publication et digests), manifestes GitOps staging et prod,
   rôles `library_owner` et `library_svc` dans CNPG, `UPSTREAM_LIBRARY_URL` de la gateway ;
   staging, puis prod.

## Questions ouvertes

- Où poser la clé de l'API Claude pour l'import (fichier `.env` du service, jamais commité).
- Les autres parties de l'export Drive : même format attendu, même import.
