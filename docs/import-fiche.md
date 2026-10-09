# Import d'une fiche (PDF ou lien)

Un joueur qui a déjà sa fiche ailleurs (fiche officielle remplie, fiche maison exportée en PDF, fiche hébergée sur un site comme Noobliés Chroniques) crée son personnage à partir d'elle : le VTT détecte le maximum, le joueur vérifie, puis le personnage naît terminé dans la campagne.

Décisions de Théo (2026-10-09) :

| Question                      | Décision                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Lecture du PDF                | **Sans IA** : champs de formulaire et texte du PDF, rapprochés du système et de son catalogue                 |
| Ce que voit le joueur         | **Écran de vérification** : tout ce qui est détecté est modifiable, rien n'est créé avant « Créer »           |
| Fiche hors règles de création | **Créé terminé, marqué importé** : valeurs du PDF reprises, badge « Importé » et écarts aux règles pour le MJ |
| Accès                         | **Tous, sans limite** (hors limites de débit habituelles)                                                     |

## 1. Parcours

1. « Nouveau personnage » dans une campagne propose deux voies : créer pas à pas (l'assistant actuel) ou **importer une fiche**.
2. Le joueur dépose son PDF, ou colle le lien de sa fiche (§ 2.1). Le PDF est lu **dans le navigateur** : le fichier ne quitte pas sa machine et n'est jamais stocké.
3. Écran de vérification (§ 4), en trois blocs : identité, valeurs, entrées du catalogue. Ce qui n'a pas trouvé sa place est listé à part.
4. « Créer » : le service character crée le personnage terminé (§ 5), il est engagé dans la campagne et incarné, comme avec l'assistant. La fiche s'ouvre.

Un PDF sans texte (scan, photo) est signalé tout de suite : rien à détecter, le joueur passe par l'assistant.

## 2. Lecture du PDF

`pdfjs-dist`, chargé à la demande sur l'écran d'import seulement (aucun poids ailleurs). Deux sources :

- **Champs de formulaire** (AcroForm) : paires nom → valeur. C'est la source la plus fiable (fiches officielles remplissables, exports de générateurs).
- **Texte positionné** : chaque morceau de texte avec sa page et sa position, regroupé en lignes. Sert aux fiches « à plat » et complète les formulaires.

Le résultat brut (`SheetReading`) ne contient que du texte : aucune règle de jeu à ce stade.

### 2.1 Fiche par lien

Reprise du legacy (`legacy/src/app/api/import-noobles`, perdu dans la refonte) et généralisée. Le joueur colle l'adresse de sa fiche ; le service character la télécharge (le navigateur ne le peut pas, CORS) et la convertit en `SheetReading`, la même forme que pour un PDF : la suite (détection, vérification, création) est commune.

`POST /v1/characters/import/link { url }` → `SheetReading` (`@vtt/contracts`, sheet-import.ts : `fields` libellé → valeur, `entries` nommées avec leur sorte supposée, rang et noms de rangs, `texts`, `portraitUrl`). Un **adaptateur par site**, sur liste fermée d'hôtes (aucune adresse libre : pas de requête du serveur vers n'importe où), avec délai et taille de page bornés.

Premier adaptateur, **Noobliés Chroniques** (`nooblieeschroniques.fr`) : la page porte la fiche en JSON (`var tmp = {…}`), lue comme le legacy. Il ne connaît que le format du site, jamais le système : il en sort des champs nommés (`cname`, `FOR`, `PV`…), des entrées nommées avec leur rang (race, profil, voies, rang = dernier rang coché, noms des rangs), des objets (armes, armures, besace) et les notes. Le portrait (`illu`) est proposé à l'import d'image existant (`/uploads/import`). Toutes ces détections sont **sûres** (§ 3.3).

D'autres sites s'ajoutent par un nouvel adaptateur, à la demande.

## 3. Détection, pilotée par le système

Aucune clé de jeu dans le code : tout ce qu'on cherche vient du système de la campagne (`SystemeCharge`). Le détecteur est une fonction pure, `detecterFiche(systeme, type, lecture)`, testée sur des PDF de référence de chaque système.

### 3.1 Noms reconnus

Pour chaque élément, les noms cherchés sont, normalisés (minuscules, sans accents ni ponctuation) :

- attribut : `cle`, `nom`, `abrege` ;
- entrée du catalogue : `nom` ; pour une entrée à rangs, aussi les noms de ses rangs (une voie au nom différent se reconnaît à ses capacités, comme le faisait le legacy) ;
- plus des **alias déclarés dans le YAML du système**, nouveau champ facultatif `import.alias` sur un attribut ou une entrée : noms des champs des fiches officielles (`STR`, `Brawn`, `CharacterName`…) et noms anglais. C'est là, et seulement là, qu'on apprend une fiche connue.

### 3.2 Ce qui est détecté

| Élément                                                    | Comment                                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom du personnage                                          | champ ou libellé `nom` / `name` / alias de l'entité ; sinon vide, à saisir                                                                                                   |
| Attributs `base` et `ressource` saisissables               | champ de formulaire au nom reconnu, ou dans le texte : libellé reconnu suivi d'un nombre sur la même ligne ou juste à droite (`Force 14 (+2)` → 14 ; le modificateur ignoré) |
| Attributs `texte`, `choix`, `booleen`                      | champ reconnu ; pour `choix`, valeur rapprochée des options                                                                                                                  |
| Entrées du catalogue (race, profil, voies, objets, armes…) | nom de l'entrée trouvé dans un champ ou une ligne ; le rang (« rang 3 », « niv. 3 », chiffre voisin) pour une sorte à rangs, la quantité (« x3 ») pour une sorte à quantités |
| Nœuds d'arbres (talents Star Wars)                         | nom du nœud trouvé : rattaché au premier arbre possédé qui le contient                                                                                                       |
| Présentation (concept, apparence, histoire)                | blocs de texte sous un libellé reconnu (« Historique », « Apparence », « Background »…, déclarés dans la présentation du système)                                            |

Les attributs dérivés (Défense, PV max…) ne se saisissent pas : s'ils sont lus, ils servent seulement à signaler un écart (§ 5.2).

### 3.3 Confiance

Chaque détection porte sa source (champ, ou ligne de texte citée) et une confiance : **sûre** (champ de formulaire, nom exact), **probable** (nom approché, valeur lue dans le texte). Une entrée ne se rapproche que si le nom correspond à 85 % au moins (distance d'édition sur le nom normalisé) ; en dessous, la ligne va dans « non reconnu ».

## 4. Écran de vérification

Disposition de l'assistant actuel (cadre focus), sans texte explicatif (info-bulles au mieux) :

- **Identité** : nom, concept, portrait (facultatif, comme l'assistant).
- **Valeurs** : les attributs saisissables, groupés comme sur la fiche ; chaque valeur détectée est pré-remplie, les « probables » sont marquées, les autres gardent leur défaut.
- **Entrées** : par sorte, les entrées détectées (case cochée, rang ou quantité modifiable), plus un ajout depuis le catalogue pour ce qui a été manqué.
- **Non reconnu** : les lignes du PDF qui n'ont rien donné ; on peut les verser dans l'histoire du personnage d'un clic.
- **Aperçu** : la fiche calculée en direct par le moteur local (`ApercuFiche`, déjà là), et les écarts aux règles (§ 5.2) au fur et à mesure.

## 5. Création côté service

### 5.1 Route

`POST /v1/characters/import` (service character, `regles/import.ts`) :

```ts
{
  systemeId: string;
  type: string;
  nom: string;
  details?: { concept?, appearance?, backstory? };
  valeurs: Record<string, number | string | boolean>; // attributs saisissables seulement
  possessions: { entree: string; rang?: number; quantite?: number; champs?: {...} }[];
  entrees?: Entree[];               // entrées libres : voies absentes du catalogue
  lues?: Record<string, number>;    // valeurs calculées lues sur la fiche (PV max, Défense…)
  source: { kind: 'pdf' | 'link'; site?: string; url?: string };
}
```

Le service construit l'état, création terminée : valeurs d'abord (elles fixent les soldes), possessions sans rangs, puis **rangs rejoués par les achats du système** (chaque rang passe par l'achat qui le donne et s'inscrit au journal ; un rang que les règles refusent est gardé, avec son écart). Les bases que la fiche ne donne pas sont **déduites de ses valeurs calculées** (`deduireBases` de `@vtt/rules` : le PV max lu retrouve le jet de dé de vie, par les dépendances de la formule, sans attribut nommé). Un attribut ou une entrée inconnus, une valeur calculée saisie, une entrée libre invalide : refus 422. Réponse : le personnage (201), comme `POST /v1/characters`. Le front l'engage ensuite dans la campagne et l'incarne, comme l'assistant.

### 5.2 Marque « importé » et écarts

Colonne `characters.sheet_import` (jsonb, nulle hors import), changeset `0014-character-sheet-import.sql`, renvoyée en `sheetImport` :

```ts
{ at: string; source: SheetSource; ecarts: string[] }
```

Les écarts : rangs refusés par les règles (« Voie de l’humain, rang 1 : Solde insuffisant : 1 requis, 0 disponible »), étapes de création invalides (`etapesCreation()` rejoué sur l'état remis en création), valeurs lues qui diffèrent du calcul (« PV max : 24 sur la fiche, 18 calculé »).

Le MJ voit sur la fiche un badge « Importé » ; au survol, la liste des écarts. Le joueur voit le badge, pas de liste. Rien ne bloque : le MJ corrige s'il le veut, avec ses droits habituels.

### 5.3 Campagne qui interdit la création

Un personnage importé est créé par le joueur : l'import suit la même règle que l'assistant. Si le MJ n'autorise pas la création de personnages dans sa campagne (`characterCreation`), l'entrée « Importer une fiche PDF » n'apparaît pas pour les joueurs, et campaign traite un personnage importé comme un personnage en création : engagement refusé (le résumé interne de character porte `imported`).

## 6. Découpage

| Lot | Contenu                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `SheetReading`, `import.alias` dans le schéma des systèmes ; `detecterFiche` (pur, `@vtt/rules` ou `frontend/src/lib/import`) et ses tests sur des PDF de référence |
| B   | Route `POST /v1/characters/import`, colonne `import`, calcul des écarts, règle de campagne (§ 5.3)                                                                  |
| C   | Lecture pdf.js, écran de vérification, entrée dans « Nouveau personnage », badge « Importé » sur la fiche                                                           |
| C'  | Import par lien : route, liste d'hôtes, adaptateur Noobliés                                                                                                         |
| D   | Alias des fiches officielles connues (D&D classique, Star Wars EotE) à partir des PDF que Théo fournira                                                             |

## 7. Hors périmètre

- PDF scannés ou manuscrits (pas de reconnaissance de caractères).
- Import d'une fiche dans un personnage existant (mise à jour) : seulement la création.
- Images du PDF (portrait) : le portrait se choisit comme dans l'assistant.
