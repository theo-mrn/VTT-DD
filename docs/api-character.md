# API du service character

Contrat commun au service `backend/character`, au front et aux clients tiers (clés d'API). Les routes passent par la gateway : `/v1/systems/*` et `/v1/characters/*` vont vers character. Toutes demandent un jeton d'accès, sauf `GET /v1/systems` et `GET /v1/systems/:id`, qui sont publiques.

Les règles sont exécutées par `@vtt/rules`. Le service fait autorité : il recalcule tout. Le front peut calculer localement avec le même moteur pour afficher un aperçu immédiat.

## Systèmes

| Méthode | Route             | Réponse                                                                                                       |
| ------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/systems`     | `[{ id, version, nom, description }]`                                                                         |
| GET     | `/v1/systems/:id` | `{ systeme, presentation }` : documents bruts (`SystemeSaisi`) ; `presentation` vaut `null` s'il n'y en a pas |

Les systèmes de référence viennent de `@vtt/systemes`. Les systèmes créés par les MJ arriveront plus tard, sur la même forme.

## Personnages

Un personnage renvoyé par l'API a cette forme :

```ts
{
  id: string; // UUIDv7
  ownerId: string; // utilisateur propriétaire
  nom: string;
  avatarUrl: string | null;
  etat: EtatEntite; // ce qui est saisi, acheté ou tiré (schéma @vtt/rules)
  fiche: FicheJson; // valeurs calculées et expliquées (ficheJson de @vtt/rules)
  details: {
    concept: string;
    appearance: string;
    backstory: string;
  } // présentation libre du joueur
  summary: {
    tagline: string;
    highlights: {
      label: string;
      value: string;
    }
    [];
  } // résumé des listes
  sheetLayout: SheetLayout | null; // mise en page de la fiche (voir « Mise en page »), null : par défaut
  permissions?: { write: boolean; layout: boolean }; // droits de l'appelant (lecture et PUT /layout)
  version: number; // concurrence optimiste : chaque écriture l'envoie et l'incrémente
  createdAt: string;
  updatedAt: string;
}
```

Une écriture qui envoie une `version` périmée reçoit **409** `version_perimee` (problem+json). Le client relit alors le personnage, le montre à l'utilisateur et le laisse refaire sa modification : il n'écrase jamais en silence.

`summary` est calculé par le service à partir de la fiche et de la **présentation** du système : `tagline` réunit les entrées uniques (race, profil, carrière… : les sortes du bloc `details` de la fiche, sinon celles à une seule entrée), `highlights` les valeurs clés (attributs du bloc `details`, puis les ressources visibles), trois au plus. Aucune clé de jeu dans le code. Il est gardé en mémoire par personnage et par version.

| Méthode | Route                                    | Corps                                                             | Réponse                                                                                                                                         |
| ------- | ---------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/characters`                         | —                                                                 | `[{ id, nom, avatarUrl, systeme: { id, version }, type, creation, concept, summary, updatedAt }]` : mes personnages                             |
| POST    | `/v1/characters`                         | `{ systemeId, type, nom }`                                        | 201 et le personnage (`etat.creation = true`)                                                                                                   |
| GET     | `/v1/characters/:id`                     | —                                                                 | le personnage                                                                                                                                   |
| PATCH   | `/v1/characters/:id`                     | `{ version, nom?, avatarUrl?, details? }`                         | le personnage ; `details` : `{ concept?, appearance?, backstory? }` (160, 2 000 et 8 000 caractères au plus), seuls les champs envoyés changent |
| DELETE  | `/v1/characters/:id`                     | —                                                                 | 204                                                                                                                                             |
| PUT     | `/v1/characters/:id/layout`              | `{ version, layout: SheetLayout \| null }`                        | le personnage, avec `permissions` ; `null` : retour à la disposition par défaut (voir « Mise en page de la fiche »)                             |
| PUT     | `/v1/characters/:id/valeurs`             | `{ version, valeurs: { [cle]: valeur } }`                         | le personnage. Seuls les attributs saisissables sont acceptés (voir « Saisie des valeurs »)                                                     |
| GET     | `/v1/characters/:id/creation`            | —                                                                 | `etapesCreation()` : état de chaque étape                                                                                                       |
| POST    | `/v1/characters/:id/creation/:etape`     | `{ version, ... }` selon le type d'étape (voir ci-dessous)        | le personnage ; étape `tirer` : plus `tirage: { attributs, retenu, essais }` (le tirage retenu, dés compris, pour l'afficher)                   |
| POST    | `/v1/characters/:id/creation/terminer`   | `{ version }`                                                     | le personnage                                                                                                                                   |
| GET     | `/v1/characters/:id/achats`              | —                                                                 | `achatsPossibles()`                                                                                                                             |
| POST    | `/v1/characters/:id/achats`              | `{ version, achat, objet }`                                       | le personnage                                                                                                                                   |
| POST    | `/v1/characters/:id/achats/rembourser`   | `{ version, index }`                                              | le personnage                                                                                                                                   |
| POST    | `/v1/characters/:id/possessions`         | voir « Possessions » ci-dessous                                   | le personnage (ajout ou mise à jour d'un exemplaire)                                                                                            |
| DELETE  | `/v1/characters/:id/possessions/:entree` | `?version=&exemplaire=`                                           | le personnage (retrait d'un exemplaire précis)                                                                                                  |
| POST    | `/v1/characters/:id/possessions/give`    | `{ version, to, entree, exemplaire?, quantity? }`                 | le donneur (don à un personnage de la même campagne, voir « Dons ») ; le receveur change aussi                                                  |
| PUT     | `/v1/characters/:id/folders`             | `{ version, folders: [{ id?, name }] }`                           | le personnage (dossiers d'inventaire, voir « Dossiers ») ; `id` absent : nouveau dossier                                                        |
| POST    | `/v1/characters/:id/repos`               | `{ version, attributs? }`                                         | le personnage (`recuperer()`)                                                                                                                   |
| POST    | `/v1/characters/:id/actions/:action`     | `{ parametres?, cibleId?, appliquer?, campaignId?, visibility? }` | `{ resultat, personnage?, cible? }`                                                                                                             |

Après chaque action, character transmet le jet au service dice (`POST /internal/rolls`, variable `DICE_URL`), sans bloquer l'action si dice est indisponible. `campaignId` range le jet dans l'historique de cette campagne, et `visibility` (`public`, `private`, `gm`, `self`) règle qui le voit (voir [api-dice.md](api-dice.md)).

Corps des étapes de création, selon leur type :

- `choisir` : `{ entrees: [{ entree, choix? }] }`
- `repartir` et `saisir` : `{ valeurs }`
- `tirer` : `{ affectation? }`. Le serveur tire lui-même avec un générateur cryptographique ; la réponse porte le tirage retenu (`tirage`). En attribution `libre` sur plusieurs attributs, en deux temps : sans `affectation`, le serveur tire, garde le tirage en attente (colonne `pending_roll`) et ne change pas l'état ; le joueur voit les valeurs, puis `{ affectation }` (attribut → rang de la valeur) rejoue exactement ce tirage et l'attribue. Le client ne choisit jamais ses dés.
- `acheter` : `{ achat, objet }`

### Droits de l'appelant (`permissions`)

`GET /v1/characters/:id` renvoie `permissions: { write, layout }` : `write`, modifier le personnage (propriétaire, ou MJ d'une campagne où il est engagé) ; `layout`, changer la mise en page de sa fiche (mêmes personnes aujourd'hui). Le front s'y fie au lieu de recalculer les droits. Les autres écritures ne renvoient pas `permissions` (l'appelant a déjà le droit d'écrire) : le client garde celles de la dernière lecture.

### Mise en page de la fiche

La fiche du front est une grille de blocs (12 colonnes sur grand écran) que le propriétaire ou le MJ réorganisent. La mise en page appartient au personnage (colonne `sheet_layout`) : toute la table voit la même fiche. `null` : disposition par défaut, déduite des widgets de la présentation du système.

```ts
SheetLayout = {
  format: 1 | 2; // 2 : pas vertical de 4 px ; 1 : rangées de 32 px espacées de 16 (converti par le front)
  blocks: { id: string; type: string; title: string; params: Record<string, string | number | boolean | string[]>; height?: 'auto' | 'fixed' }[]; // 40 au plus
  layouts: { lg?: Item[]; md?: Item[]; sm?: Item[]; xs?: Item[] }; // positions par largeur ; absente : déduite
}
Item = { i: string; x: number; y: number; w: number; h: number } // i : id d'un bloc, x + w <= 12 ; y <= 50 000, h <= 2 400
```

Le front écrit le format 2 : la grille avance par pas de 4 px, sans espace entre rangées (chaque bloc porte sa marge basse de 12 px), pour que les hauteurs automatiques épousent le contenu. Une mise en page au format 1 (rangées de 32 px espacées de 16) reste lisible : le front la convertit (`y × 12`, `h × 12 − 1`) et l'enregistre au format 2 au prochain changement.

`height` règle la hauteur d'un bloc dans la grille : `auto`, elle suit son contenu (le `h` des positions n'est qu'une estimation, le front mesure) ; `fixed`, le `h` des positions s'applique et le contenu défile. Absent : préférence du type de bloc côté front (automatique, sauf l'arbre) ; les mises en page enregistrées avant ce champ suivent donc cette préférence.

Un bloc est un widget de la présentation (`type`, `titre` → `title`, ses autres champs → `params`) : le service ne connaît aucun jeu, il vérifie la forme (schéma strict, clés inconnues refusées), les bornes, l'unicité des blocs et que chaque position désigne un bloc. 32 Ko au plus une fois sérialisée (400 au-delà ; 413 pour un corps de plus de 64 Ko). La `version` est obligatoire et incrémentée, comme pour toute écriture (409 `version_perimee` si elle est périmée). Propriétaire ou MJ de la table ; un joueur de la table reçoit 403.

### Saisie des valeurs

`PUT /valeurs` accepte, pour le propriétaire comme pour le MJ d'une salle où le personnage est engagé :

- texte, choix, booléen et ressource, à tout moment ;
- un attribut de base pendant la création ; ensuite, selon sa `saisie` dans le système :
  - `jeu` (crédits) : propriétaire ou MJ ;
  - `mj` (XP gagnée, niveau, jets de dés de vie) : MJ seul. Le propriétaire reçoit **403** `saisie_reservee_mj`, sauf s'il mène lui-même une salle où le personnage est engagé ;
  - `creation` (défaut : caractéristiques) : plus personne, **422** (l'attribut s'achète).

Un attribut inconnu, calculé, une valeur hors bornes ou de mauvaise nature donnent **422** avec le détail de chaque erreur.

### Possessions : exemplaires et quantités

Corps de `POST /possessions` : `{ version, entree, exemplaire?, nouveau?, quantite?, rang?, actif?, choix?, champs?, effets?, hidden?, folder? }`. Seuls les champs fournis changent ; `effets` (effets propres à l'exemplaire) remplace les précédents.

`champs` (valeurs propres de l'exemplaire) est vérifié contre les champs de la sorte (`verifierChampsExemplaire` de `@vtt/rules`) : champ connu, nombre, texte, booléen, option d'un `choix`, attribut ou entrée existants. Un champ `formule` reçoit la formule propre de l'exemplaire, qui remplace celle de l'entrée (dés d'une arme : `1d6 + @FOR + 2`) : elle est compilée par le moteur (attributs du porteur, champs de l'objet `source.x`, dés seulement pour un champ `des`), 500 caractères au plus, et l'écriture simple est normalisée (`1d6-CON+8` est enregistré `1d6-@CON+8`). Une chaîne vide revient à la formule de l'entrée. Refus : **422** `champs_invalides`, avec le détail de chaque erreur.

`hidden: true` cache l'exemplaire aux autres joueurs (voir « Objets cachés ») ; `folder` le range dans un dossier de l'état (**422** `dossier_inconnu` s'il n'existe pas), `null` le remet à la racine.

Une entrée d'une sorte `exemplaires` (armes, armures, Obligations) peut être possédée plusieurs fois : chaque possession est un exemplaire, avec son `actif`, ses `champs`, ses `effets` et sa durée, distingué par `exemplaire` (identifiant unique par entrée ; absent pour le premier). Choix de l'exemplaire visé :

| Corps                                | Effet                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| sans `exemplaire` ni `nouveau`       | met à jour l'exemplaire **sans identifiant** ; s'il n'existe pas, il est créé. Envoyer deux fois `{ entree }` ne crée pas de doublon |
| `exemplaire: "2"`                    | met à jour cet exemplaire ; **404** s'il n'existe pas (le message liste les exemplaires existants)                                   |
| `nouveau: true`                      | ajoute un exemplaire : sans identifiant si l'entrée n'est pas possédée, sinon identifiant généré (`2`, `3`…, `nouvelExemplaire`)     |
| `nouveau: true, exemplaire: "plus1"` | ajoute l'exemplaire `plus1` ; **422** `exemplaire_existant` s'il existe déjà                                                         |

`exemplaire`, ou `nouveau` sur une entrée déjà possédée, demandent une sorte `exemplaires` : sinon **422** `exemplaires_refuses` (une entrée à rangs n'a qu'une possession, dont les rangs s'additionnent). Chaque exemplaire compte dans le `maximum` de la sorte.

`quantite` (entier ≥ 1, absent : 1) remplace le nombre d'unités de l'exemplaire (munitions, stimpacks, dagues D&D). Il demande une sorte `quantites`, sinon **422** `quantite_refusee`.

`DELETE /possessions/:entree?version=&exemplaire=` retire l'exemplaire `exemplaire`, ou sans ce paramètre l'exemplaire sans identifiant (la seule possession d'une sorte sans exemplaires) : **404** s'il n'existe pas. Le dernier exemplaire d'une entrée qui ouvre un arbre dont des nœuds sont acquis ne se retire pas (**422**).

L'événement `character.updated` d'une possession porte la demande avec l'exemplaire touché (`possession.exemplaire`, généré compris) et `cree` (exemplaire ajouté ou mis à jour) ; celui d'un retrait porte `entree` et `exemplaire`.

#### Dons

`POST /possessions/give` donne l'exemplaire `exemplaire` (absent : celui sans identifiant) de `:id` au personnage `to`. `quantity` : unités données d'une sorte `quantites` ; absent, tout l'exemplaire.

- **Droits** : écrire sur le donneur (propriétaire ou MJ), lire le receveur ; les deux doivent être engagés dans une même campagne où l'appelant siège (réponses `campaigns-of` de campaign). Sinon **403** (`hors_campagne` pour une campagne commune absente), **404** pour un receveur inconnu.
- **Règles** (`donnerObjet`) : même système (**400** `systeme_different`), sorte possédable par le receveur, pas plus d'unités que possédées (**422** `quantite_insuffisante`), dernier exemplaire d'une entrée qui ouvre un arbre aux nœuds acquis refusé. Chez le receveur, les unités s'ajoutent à un exemplaire identique (même entrée, mêmes valeurs, effets et choix propres) ; sinon un nouvel exemplaire est créé avec les valeurs et effets propres de l'objet, non équipé (sorte `activable`), visible et hors dossier.
- **Transaction** : les deux personnages sont verrouillés ensemble ; la `version` envoyée est celle du donneur (**409** si elle est périmée), les deux versions sont incrémentées. Deux événements `character.updated` : `possession.don` pour le donneur (visibilité habituelle de l'appelant), `possession.recue` pour le receveur, publié dans la campagne commune en `gm_only` avec `visibleToUsers: [propriétaire du receveur]`. Les deux portent `don: { entree, exemplaire?, quantity, from, to, received? }`.

#### Dossiers

`PUT /folders` remplace la liste des dossiers d'inventaire de l'état (`etat.folders`, dans l'ordre d'affichage, 50 au plus, noms de 1 à 60 caractères) : créer (sans `id`, identifiant généré `dossier-n`, jamais celui d'un dossier existant), renommer, réordonner et supprimer se font en une écriture. Les exemplaires d'un dossier supprimé reviennent à la racine. Un exemplaire est rangé par `POST /possessions` (`folder`). Événement `character.updated`, opération `dossiers`, avec `folders` (identifiants) et `removed`.

#### Objets cachés

Un exemplaire `hidden: true` n'est visible que du propriétaire et des MJ (droit d'écriture). Pour tout autre lecteur, le service le retire de `GET /v1/characters/:id` (état **et** fiche, recalculée sans lui : ses effets disparaissent aussi) et de `GET /achats`. Le résumé (`summary`) ne nomme jamais une entrée dont tous les exemplaires sont cachés. Les événements `character.updated` ne sont jamais publics (propriétaire, ou MJ et propriétaire) : le temps réel ne le révèle pas.

En fin de round (route interne `POST /internal/characters/:id/durees/decompter`, appelée par campaign), chaque exemplaire décompte sa propre durée ; `retirees` nomme `entree`, ou `entree#exemplaire` pour un exemplaire identifié, et `bonus:<id>` pour un bonus libre.

### Actions

Les jets d'action sont tirés par le serveur avec `aleatoireCrypto()`. Avec `appliquer: true`, les modifications de l'acteur et de la cible sont appliquées dans la même transaction, à deux conditions :

- l'appelant possède l'acteur ;
- pour la cible, en attendant les campagnes : il la possède aussi.

Sans `appliquer`, le résultat est seulement renvoyé.

## Événements (outbox)

Chaque écriture publie un événement : `character.created`, `character.updated` (avec la version), `character.deleted`, `character.layout_changed` et `character.action_resolved` (avec le résultat complet, pour l'historique).

`character.layout_changed` (`PUT /layout`) porte `{ version, reset, blocks }` (nouvelle version, retour à la disposition par défaut, nombre de blocs), pas la mise en page : le client relit le personnage. Il est publié, en `public`, dans chaque campagne où le personnage est engagé et où l'auteur siège (réponse `campaigns-of` de campaign) : toute la table voit la nouvelle fiche. Hors campagne, il reste celui de l'auteur (`owner`).

Visibilité de `character.updated` : une écriture du propriétaire reste la sienne (`owner`, sans campagne). Une écriture du **MJ** (ou de campaign, pendant un combat) est publiée dans la campagne où il mène la partie (`roomId`), en `gm_only` avec `payload.visibleToUsers: [propriétaire]` : les MJ et le propriétaire la reçoivent en direct par le service realtime, pas les autres joueurs (le diff peut porter des valeurs réservées au MJ). La campagne vient de la réponse de campaign déjà lue pour les droits (`campaigns-of`, champ `campaigns`).

`character.updated` porte l'opération (`operation`), ses détails, et le diff avant/après de l'état, du nom, de l'avatar et de la présentation (`details.concept`…) : `changes: [{ path, before, after }]` (ex. `{ "path": "etat.valeurs.PV", "before": 24, "after": 17 }`, possessions désignées par `entree#exemplaire`). Format et bornes : [bus.md](bus.md#diff-avantaprès-changes).
