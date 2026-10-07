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
  fiche: FicheJson; // valeurs calculées et expliquées (ficheJson de @vtt/rules), avec les règles optionnelles de sa campagne
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

### Règles optionnelles de la campagne

Chaque calcul d'autorité (fiche renvoyée, étapes de création, achats, actions, repos, fiche lue par dice) se fait avec les règles optionnelles de la campagne du personnage (encombrement…, voir [regles-optionnelles.md](regles-optionnelles.md)) : character les lit sur la route interne de campaign `GET /internal/characters/:id/rules` (la première campagne où il est engagé), avec le client et la durée de cache des droits (`DROITS_CACHE_MS`, 5 s par défaut ; character ne lit pas le bus). Hors campagne, ou si campaign ne répond pas, les défauts du système. Les listes (`GET /v1/characters`) résument avec les défauts. L'état enregistré ne porte jamais les options : éteindre une règle ne supprime aucune valeur saisie.

### Droits

Un seul personnage actif, pas de notion de possession. Qui peut quoi sur un personnage :

| Situation                                    | Écrire (valeurs, possessions, bonus, actions, jets avec ses variables, mise en page, identité) | Lire                          |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------- |
| Jamais engagé dans une campagne              | son propriétaire (`ownerId`)                                                                   | son propriétaire              |
| En création (`etat.creation`), engagé ou non | son propriétaire, plus les ayants droit ci-dessous s'il est engagé                             | son propriétaire, les membres |
| Engagé dans une campagne                     | le membre qui l'incarne (`campaign_characters.played_by`) et le MJ de la campagne              | les membres, son propriétaire |

Le propriétaire d'un personnage engagé qu'il n'incarne pas (et dont il n'est pas MJ) le **lit seulement** : **403** à l'écriture. Il le lit toujours, même hors de la table. Un étranger reçoit **404** (on ne révèle pas l'existence du personnage).

**Fiches de PNJ** (docs/combat.md, Q4) : un PNJ (`kind: npc`) ne se lit, pour qui ne l'écrit pas (joueur, spectateur), que s'il est du camp des joueurs ou allié dans une des campagnes du lecteur, ou si le lecteur est **joueur** d'une campagne où le PNJ est engagé (Q4 levée par Théo le 2026-09-30 : l'attaque se calcule dans le navigateur de l'attaquant, qui lit la fiche de sa cible) ; un spectateur ne lit pas la fiche d'un ennemi (**404**, comme un étranger). Son propriétaire (le MJ qui l'a créé) et qui l'incarne le lisent toujours. Le camp vient de la route interne de campaign `GET /internal/campaigns/:id/rights?userId=&characterId=` (`character.side`), même cache ; campaign injoignable : **503**. Un personnage joueur ennemi (PvP) reste lisible. Le rôle des événements suit : `user` pour qui a la main (joueur qui l'incarne, propriétaire hors campagne ou en création), `gm` pour le MJ qui n'incarne pas le personnage.

**Suppression** (`DELETE /v1/characters/:id`) : le propriétaire seul (**403** pour les autres), et pas tant qu'un autre membre incarne le personnage dans une campagne : **409** `character_played` (le retirer d'abord de la campagne, ce que seul le MJ peut faire tant qu'un autre membre l'incarne, voir [api-campaign.md](api-campaign.md)). On ne supprime pas la fiche que quelqu'un joue.

character lit ces droits sur la route interne de campaign `GET /internal/characters/:id/campaigns-of?userId=` (`read`, `write`, `engaged`, `plays`, `playedByOther`, `campaigns: [{ campaignId, role, playedBy }]`), gardée en cache `DROITS_CACHE_MS` (5 s par défaut). character ne lit pas le bus : après un changement d'incarnation (`campaign.character_played`), une écriture peut encore être jugée avec les anciens droits pendant au plus cette durée. `GET /v1/characters/:id` relit toujours campaign (sans cache) : les `permissions` renvoyées sont à jour. Le propriétaire en création n'interroge pas campaign. campaign injoignable : le propriétaire garde la lecture, toute écriture (et la suppression) qui dépend de campaign échoue en **503** `campaign_unavailable`.

### Droits de l'appelant (`permissions`)

`GET /v1/characters/:id` renvoie `permissions: { write, layout }` : `write`, modifier le personnage (voir « Droits » : joueur qui l'incarne, MJ, propriétaire hors campagne ou en création) ; `layout`, changer la mise en page de sa fiche (mêmes personnes aujourd'hui). Le front s'y fie au lieu de recalculer les droits. Les autres écritures ne renvoient pas `permissions` (l'appelant a déjà le droit d'écrire) : le client garde celles de la dernière lecture.

### Mise en page de la fiche

La fiche du front est une grille de blocs (12 colonnes sur grand écran) que le joueur qui a la main ou le MJ réorganisent. La mise en page appartient au personnage (colonne `sheet_layout`) : toute la table voit la même fiche. `null` : disposition par défaut, déduite des widgets de la présentation du système.

```ts
SheetLayout = {
  format: 1 | 2; // 2 : pas vertical de 4 px ; 1 : rangées de 32 px espacées de 16 (converti par le front)
  blocks: { id: string; type: string; title: string; params: Record<string, string | number | boolean | string[]>; height?: 'auto' | 'fixed' }[]; // 40 au plus ; params : 16 au plus, dont colonnesTuiles, ordre, masques
  layouts: { lg?: Item[]; md?: Item[]; sm?: Item[]; xs?: Item[] }; // positions par largeur ; absente : déduite
}
Item = { i: string; x: number; y: number; w: number; h: number } // i : id d'un bloc, x + w <= 12 ; y <= 50 000, h <= 2 400
```

Le front écrit le format 2 : la grille avance par pas de 4 px, sans espace entre rangées (chaque bloc porte sa marge basse de 12 px), pour que les hauteurs automatiques épousent le contenu. Une mise en page au format 1 (rangées de 32 px espacées de 16) reste lisible : le front la convertit (`y × 12`, `h × 12 − 1`) et l'enregistre au format 2 au prochain changement.

`height` règle la hauteur d'un bloc dans la grille : `auto`, elle suit son contenu (le `h` des positions n'est qu'une estimation, le front mesure) ; `fixed`, le `h` des positions s'applique et le contenu défile. Absent : préférence du type de bloc côté front (automatique, sauf l'arbre) ; les mises en page enregistrées avant ce champ suivent donc cette préférence.

Un bloc de tuiles (attributs, ressources) peut porter sa **disposition interne**, réglée en personnalisation, dans trois paramètres réservés : `colonnesTuiles` (`'auto'` ou un entier de 1 à 6), `ordre` (clés des valeurs dans l'ordre voulu) et `masques` (clés des valeurs cachées). `ordre` et `masques` sont des listes non vides de 64 clés au plus, sans doublon, chaque clé faite de lettres, chiffres et `_` (60 caractères au plus) ; toute autre forme est refusée (400). Le service ne sait pas quelles valeurs le bloc montre : le front ignore une clé que la présentation ne donne pas au bloc, place à la suite celles que l'ordre ne cite pas, et garde toujours au moins une valeur affichée. Sans ces paramètres, le bloc suit la présentation : colonnes automatiques (autant que la largeur du bloc en permet, le `colonnes` de la présentation n'étant qu'un maximum préféré), ordre et valeurs du système.

Un bloc est un widget de la présentation (`type`, `titre` → `title`, ses autres champs → `params`) : le service ne connaît aucun jeu, il vérifie la forme (schéma strict, clés inconnues refusées), les bornes, l'unicité des blocs et que chaque position désigne un bloc. 32 Ko au plus une fois sérialisée (400 au-delà ; 413 pour un corps de plus de 64 Ko). La `version` est obligatoire et incrémentée, comme pour toute écriture (409 `version_perimee` si elle est périmée). Propriétaire ou MJ de la table ; un joueur de la table reçoit 403.

### Saisie des valeurs

`PUT /valeurs` accepte, pour le joueur qui a la main (voir « Droits ») comme pour le MJ d'une salle où le personnage est engagé :

- texte, choix, booléen et ressource, à tout moment ;
- un attribut de base pendant la création ; ensuite, selon sa `saisie` dans le système :
  - `jeu` (crédits) : joueur ou MJ ;
  - `mj` (XP gagnée, niveau, jets de dés de vie) : MJ seul. Le joueur reçoit **403** `saisie_reservee_mj`, sauf s'il mène lui-même une salle où le personnage est engagé ;
  - `creation` (défaut : caractéristiques) : plus personne, **422** (l'attribut s'achète).

Un attribut inconnu, calculé, une valeur hors bornes ou de mauvaise nature donnent **422** avec le détail de chaque erreur.

### Possessions : exemplaires et quantités

Corps de `POST /possessions` : `{ version, entree, exemplaire?, nouveau?, quantite?, rang?, actif?, choix?, champs?, effets?, hidden?, folder?, duree?, decompte? }`. Seuls les champs fournis changent ; `effets` (effets propres à l'exemplaire) remplace les précédents.

`duree` (entier de 1 à 10 000) donne l'état pour un temps : il perd un décompte à chaque fin de round de combat et disparaît à 0 (voir « Combat »). `null` retire la durée (et son décompte) : la possession reste jusqu'à son retrait. `decompte: { moment, de? }` change le moment du décompte (docs/combat.md § 18) : `fin-round` (défaut), `debut-tour` ou `fin-tour` du personnage `de` (identifiant ; absent : le porteur) ; `null` revient à la fin de round. L'attente d'une fin de tour (« jusqu'à la fin de son **prochain** tour ») est posée par le serveur quand le décompte change, gardée sinon ; un `attente` reçu est refusé (**400**).

`champs` (valeurs propres de l'exemplaire) est vérifié contre les champs de la sorte (`verifierChampsExemplaire` de `@vtt/rules`) : champ connu, nombre, texte, booléen, option d'un `choix`, attribut ou entrée existants. Un champ `formule` reçoit la formule propre de l'exemplaire, qui remplace celle de l'entrée (dés d'une arme : `1d6 + @FOR + 2`) : elle est compilée par le moteur (attributs du porteur, champs de l'objet `source.x`, dés seulement pour un champ `des`), 500 caractères au plus. Elle s'écrit en clés nues comme au lanceur de dés (`1d6-CON+8` : `CON` vaut son apport au jet, le modificateur en D&D), normalisée par `normaliserFormuleJet` avant la compilation, et enregistrée telle que saisie ; une clé inconnue est refusée avec un message lisible (« « CONS » n'est pas un attribut du personnage »). Une chaîne vide revient à la formule de l'entrée. Refus : **422** `champs_invalides`, avec le détail de chaque erreur.

`hidden: true` cache l'exemplaire aux autres joueurs (voir « Objets cachés ») ; `folder` le range dans un dossier de l'état (**422** `dossier_inconnu` s'il n'existe pas), `null` le remet à la racine.

Un objet se configure avant son ajout : avec `nouveau: true`, `champs`, `effets`, `quantite`, `actif`, `hidden` et `folder` sont posés sur le nouvel exemplaire dans la même écriture (un seul événement `character.updated`). C'est ce qu'envoie la fenêtre d'ajout de l'inventaire.

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

- **Droits** : écrire sur le donneur (joueur qui l'incarne ou MJ, voir « Droits »), lire le receveur ; les deux doivent être engagés dans une même campagne où l'appelant siège (réponses `campaigns-of` de campaign). Sinon **403** (`hors_campagne` pour une campagne commune absente), **404** pour un receveur inconnu.
- **Règles** (`donnerObjet`) : même système (**400** `systeme_different`), sorte possédable par le receveur, pas plus d'unités que possédées (**422** `quantite_insuffisante`), dernier exemplaire d'une entrée qui ouvre un arbre aux nœuds acquis refusé. Chez le receveur, les unités s'ajoutent à un exemplaire identique (même entrée, mêmes valeurs, effets et choix propres) ; sinon un nouvel exemplaire est créé avec les valeurs et effets propres de l'objet, non équipé (sorte `activable`), visible et hors dossier.
- **Transaction** : les deux personnages sont verrouillés ensemble ; la `version` envoyée est celle du donneur (**409** si elle est périmée), les deux versions sont incrémentées. Deux événements `character.updated` : `possession.don` pour le donneur (visibilité habituelle de l'appelant), `possession.recue` pour le receveur, publié dans la campagne commune en `gm_only` avec `visibleToUsers: [joueur qui incarne le receveur]` (vide si personne ne l'incarne). Les deux portent `don: { entree, exemplaire?, quantity, from, to, received? }`.

#### Dossiers

`PUT /folders` remplace la liste des dossiers d'inventaire de l'état (`etat.folders`, dans l'ordre d'affichage, 50 au plus, noms de 1 à 60 caractères) : créer (sans `id`, identifiant généré `dossier-n`, jamais celui d'un dossier existant), renommer, réordonner et supprimer se font en une écriture. Les exemplaires d'un dossier supprimé reviennent à la racine. Un exemplaire est rangé par `POST /possessions` (`folder`). Événement `character.updated`, opération `dossiers`, avec `folders` (identifiants) et `removed`.

#### Objets cachés

Un exemplaire `hidden: true` n'est visible que de qui peut écrire sur le personnage (joueur qui l'incarne, MJ, propriétaire hors campagne). Pour tout autre lecteur, le service le retire de `GET /v1/characters/:id` (état **et** fiche, recalculée sans lui : ses effets disparaissent aussi) et de `GET /achats`. Le résumé (`summary`) ne nomme jamais une entrée dont tous les exemplaires sont cachés. Les événements `character.updated` ne sont jamais publics (l'auteur, ou les MJ et le joueur qui incarne) : le temps réel ne le révèle pas.

À chaque passage de tour d'un combat (route interne `POST /internal/durations/tick`, appelée par campaign, docs/combat.md § 18.4), chaque exemplaire décompte sa propre durée ; `expired` nomme `entree`, ou `entree#exemplaire` pour un exemplaire identifié, et `bonus:<id>` pour un bonus libre, avec leur nom. L'événement `combat_end` (fin de combat, « Retirer les états à durée ») retire d'un coup tout ce qui a une durée. Le décompte n'a lieu qu'une fois par `tickId` : une reprise rend la réponse d'origine avec `replayed: true` ; il s'annule par `POST /internal/modifications/revert` (`applicationId = tickId`, voir « Combat »).

#### Bonus libres et états libres

`POST /bonus` (`{ version, id?, nom, source?, effets?, actif?, duree?, decompte? }`) pose un bonus libre, ou remplace celui du même `id` ; `DELETE /bonus/:bonusId?version=` le retire. `effets` vide ou absent : **état libre**, un marqueur nommé sans effet mécanique (docs/combat.md § 4.5) ; avec `duree`, il est décompté comme un état du catalogue (`decompte` : même forme que pour une possession).

### Instances de PNJ et butin de la carte (routes internes)

Appelées par campaign seulement (secret `INTERNAL_API_SECRET`, jamais relayées par la gateway),
qui a déjà vérifié les droits ([api-map.md](api-map.md), PNJ et fouille) :

| Méthode | Route                                          | Corps                                                                         | Réponse                                                         |
| ------- | ---------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| POST    | `/internal/npcs`                               | `{ ownerId, campaignId, systemId, count (1 à 20), source }`                   | 201 `{ items: [{ id, nom, avatarUrl, tokenUrl, templateId }] }` |
| POST    | `/internal/npcs/delete`                        | `{ ids, userId, roomId }`                                                     | `{ deleted }`                                                   |
| POST    | `/internal/characters/:id/possessions/receive` | `{ item: { ref?, name, description?, quantity }, userId, roomId, playerId? }` | `{ version, entree, exemplaire? }`                              |

- Une **instance de PNJ** est un personnage `kind: npc` possédé par le MJ (`ownerId`), à l'état
  complet (création terminée), avec son origine : `template_id` (modèle copié, trace sans clé
  étrangère) et `campaign_id` (campagne pour laquelle elle a été créée, changeset
  `0009-npc-instances.sql`). `source` : `{ templateId }` (modèle de la campagne, même système),
  `{ bestiary: { systemeId, key } }` (créature du bestiaire de référence : valeurs saisissables
  posées telles quelles, valeurs dérivées imprimées gardées par le bonus « Valeurs du modèle »,
  type et description dans la présentation libre), `{ quick: { name, imageUrl?, type, valeurs? } }`
  (état vide du type, valeurs saisies avec les droits du MJ) ou `{ characterId }` (copie de
  l'état actuel d'une instance du même MJ : fiche, présentation, mise en page). Système différent
  de celui de la campagne : 422 `system_mismatch` ; modèle, créature ou instance introuvable : 404.
- Noms : « Gobelin », « Gobelin 2 »… ; la numérotation reprend après le plus grand numéro des PNJ
  de ce nom dans la campagne (verrou consultatif par campagne : deux poses simultanées ne
  prennent pas le même numéro).
- `delete` supprime (suppression douce) les PNJ listés de cette campagne (`campaign_id`) ou du MJ
  qui le demande ; un personnage joueur n'est jamais supprimé ainsi.
- `possessions/receive` ajoute un objet pris sur la carte, comme un don (`ajouterObjetRecu`, voir
  « Dons ») : `ref` désigne une entrée du catalogue ; sans `ref`, l'entrée libre du système
  (`libre: true`, possédable par ce type d'entité, à quantités de préférence) reçoit le nom et la
  description dans ses champs `nomExemplaire` et `descriptionExemplaire`. Une sorte sans
  quantités reçoit un exemplaire par unité. Pas d'objet libre : 422 `objet_libre_indisponible` ;
  entrée inconnue : 422 `entree_inconnue`.
- Événements : `character.created` et `character.deleted` dans la campagne (`roomId`), `gm_only` ;
  le butin produit `character.updated` (opération `possession.butin`, `butin: { entree,
exemplaire?, quantity, name }`), `gm_only` avec `visibleToUsers: [playerId]`.

### Combat (routes internes)

Appelées par campaign seulement (secret `INTERNAL_API_SECRET`), qui a déjà vérifié les droits, le
tour et les cibles vues ([combat.md](combat.md) § 5 à 7, forme exacte au § 11.2). character résout
avec `@vtt/rules` ; campaign garde les attaques, les rapports et les décisions du MJ.

| Méthode | Route                                      | Corps                                                                                                                                            | Réponse                                                                                                     |
| ------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| POST    | `/internal/actions/prepare`                | `{ actorId, action, params?, targetIds, rollMode?, adjustments?, dice?, userId, campaignId, diceHistory?, combat? }`                             | `{ snapshot, action, rollMode, dice, targets: [{ characterId, error, reactionParams }], step, resolution }` |
| POST    | `/internal/actions/resolve`                | `{ snapshot, params?, rollMode, adjustments?, dice?, reactions?, faces?, step?, results?, stepParams?, serverFallback?, forcer?, diceHistory? }` | `{ step, resolution }`                                                                                      |
| POST    | `/internal/actions/rolls`                  | `{ campaignId, authorId, characterId, visibility, action, rollMode, views }`                                                                     | 202 `{ forwarded }` : jet d'une attaque calculée par le navigateur, transmis à dice depuis les vues         |
| POST    | `/internal/modifications/apply`            | `{ applications: [{ applicationId, userId?, campaignId, items: [{ characterId, modifications, tables? }] }] }`                                   | `{ applications: [{ applicationId, replayed, items: [{ characterId, version, changes, defeated }] }] }`     |
| POST    | `/internal/modifications/revert`           | `{ applicationId, characterIds?, force?, userId?, cancelIfMissing? }`                                                                            | `{ applicationId, items: [{ characterId, status, version, changes, defeated? }] }`                          |
| POST    | `/internal/durations/tick`                 | `{ tickId, campaignId, userId?, characterIds, events }`                                                                                          | `{ tickId, replayed, items: [{ characterId, version, expired: [{ key, name }] }] }`                         |
| POST    | `/internal/characters/:id/actions/:action` | `{ parametres?, cibleId?, appliquer?, userId?, roomId?, visibility? }`                                                                           | `{ resultat, cles?, personnage?, cible? }`                                                                  |

- **Préparer** : les fiches de l'attaquant et des cibles sont figées dans `snapshot` (état et
  règles optionnelles de chaque campagne), objet opaque que campaign garde et rend tel quel à
  `resolve` : la résolution ne bouge pas pendant qu'on lance les dés. Les règles sont vérifiées
  d'abord, sans dé : refus de l'attaquant ou de toutes les cibles, **422** `action_refusee`
  (messages du moteur) ; refus d'une partie des cibles, leur `error` (elles seront `failed`).
  `reactionParams` : paramètres `par: cible` proposés à la cible (défense active, leur `exige`
  est vrai pour elle). Sans réaction attendue, `resolution` est rendue tout de suite (dés
  serveur). Personnage absent : **404** `character_not_found`.
- **Contexte du combat** (`combat`, contrat `AttackCombatContext`) : figé par campaign à la
  déclaration, sans l'attaque en cours : `{ round, actor?, targets: [{ characterId, … }] }`,
  chaque participant `{ attacksMade, attacksMadeRound, targeted, targetedRound, hasActed,
surprised }`. Il est gardé dans `snapshot` et donné au moteur pour chaque cible
  (`@combat.round`, `@combat.acteur.attaques`, `@combat.cible.aAgi`… : docs/regles.md, « Contexte
  du combat ») : à la préparation (vérifications, « au premier tour seulement ») comme à la
  résolution. Absent (hors combat), ou participant absent : valeurs neutres. Mal formé : **400**.
- **Paramètres d'après le jet** (`etape: apres` : l'arme D&D) : après un jet réussi, s'ils
  manquent, `resolve` rend une étape `{ phase: 'after', params: [...], dice: [] }` (identifiant
  `after-params-n`), même avec `serverFallback`. L'appel suivant les porte dans `stepParams`,
  validés contre `step.params` (tous et seulement eux, sinon **400** `invalid_step_params`) et
  ajoutés aux paramètres de la déclaration ; le moteur vérifie la valeur (arme possédée…,
  **422** `action_refusee`). Les dés qu'ils impliquent font l'étape suivante.
- **Résoudre** : une exécution de l'action par cible (`executerMulticible`), avec les paramètres
  de l'attaquant et la réaction de la cible (`skipped` : valeurs par défaut) ; `rollMode:
shared` partage les dés par phase et par position. Par cible : `result` (contrat
  `AttackTargetResult`, MJ seul : jet, issue, variables, modifications proposées avec types de
  dégâts, dégâts bruts (`raw`), chaque résistance, réduction, immunité ou vulnérabilité de la
  cible nommée (`resistances`), minimum qui a relevé le résultat (`minimum`), tables tirées,
  déroulé, erreurs) et `view` (`AttackTargetView`, vue de
  l'attaquant). `actor.modifications` : coûts de l'attaquant, comptés une fois. Déterministe :
  même instantané, mêmes dés, même résultat. Étape B : le serveur tire tous les dés (`step`
  toujours null, `faces` ignorées).
- **Historique des dés** : avec `diceHistory`, le jet part à dice réduit à la vue de l'attaquant
  (jamais le déroulé complet, qui nomme les défenses de la cible) : un par cible, un seul pour un
  jet commun.
- **Appliquer** : aucun dé ; les modifications décidées (contrat `AttackModificationInput`) et
  les tables (`entry` : l'entrée d'une ligne de la table, tirée ou choisie par le MJ) sont écrites
  dans **une transaction** pour toutes les applications et toutes les fiches (verrouillées dans
  l'ordre des identifiants). Une ressource est ramenée dans ses bornes (pas au-dessus du maximum
  d'une ressource non plafonnée). Par fiche : nouvelle `version`, `changes` (le diff de
  `character.updated`), `defeated` (formule `horsCombat` du type d'entité). Idempotent par
  `applicationId` : une reprise rend la réponse d'origine (`replayed: true`). Attribut qui n'est
  ni de base ni une ressource, entrée inconnue ou non possédable, table inconnue, entrée absente
  de la table : **422** `modification_invalide` avec `errors: [{ characterId, message }]`, rien
  n'est écrit.
- **Annuler** : pour chaque élément changé (valeur, possession `entree#exemplaire`, bonus), la
  valeur d'avant revient si l'actuelle est toujours celle d'après ; sinon **409**
  `revert_conflict` avec `conflicts: [{ characterId, paths }]`, rien n'est écrit, et `force` rend
  quand même. `status` : `reverted`, `already_reverted` (annuler deux fois ne rend rien de plus),
  `missing` (personnage supprimé depuis). Application inconnue : **404** `application_not_found`.
- **Initiative** (`…/actions/:action`, action d'initiative du système jouée par le serveur) :
  `cles` donne les clés de tri ; `visibility` règle le jet transmis à dice (campaign demande `gm`
  pour un PNJ, un allié ou un participant caché : son nom et sa statistique ne fuient pas ;
  défaut : public).
- Événements : `character.updated` (opérations `combat.application`, `combat.annulation`,
  `durees.decompte`, avec `applicationId` ou `tickId`), publiés dans la campagne en `gm_only`
  avec `visibleToUsers` : le joueur qui incarne le personnage (pour un décompte, lu dans les
  droits de l'appelant, `incarnateurs`).
- Base : changeset `0010-applications.sql` (`applications` : une par `applicationId` ou
  `tickId`, avec la réponse d'origine ; `application_items` : une par personnage touché, delta
  avant/après pour l'annulation, résultat, date d'annulation).

### Actions

Les jets d'action sont tirés par le serveur avec `aleatoireCrypto()`. Une action à cible transmet à dice la vue de l'acteur (`vueActeur`), pas le déroulé complet. La route publique avec `appliquer` et une cible reste pour la compatibilité : le front attaque par le combat (campaign), et la cible doit être lisible par l'appelant (un PNJ ennemi ne l'est pas pour un spectateur). Avec `appliquer: true`, les modifications de l'acteur et de la cible sont appliquées dans la même transaction, à deux conditions :

- l'appelant possède l'acteur ;
- pour la cible, en attendant les campagnes : il la possède aussi.

Sans `appliquer`, le résultat est seulement renvoyé.

## Événements (outbox)

Chaque écriture publie un événement : `character.created`, `character.updated` (avec la version), `character.deleted`, `character.layout_changed` et `character.action_resolved` (avec le résultat complet, pour l'historique).

`character.layout_changed` (`PUT /layout`) porte `{ version, reset, blocks }` (nouvelle version, retour à la disposition par défaut, nombre de blocs), pas la mise en page : le client relit le personnage. Il est publié, en `public`, dans chaque campagne où le personnage est engagé et où l'auteur siège (réponse `campaigns-of` de campaign) : toute la table voit la nouvelle fiche. Hors campagne, il reste celui de l'auteur (`owner`).

Visibilité de `character.updated` : une écriture du joueur qui a la main reste la sienne (`owner`, sans campagne). Une écriture du **MJ** (ou de campaign, pendant un combat) est publiée dans la campagne où il mène la partie (`roomId`), en `gm_only` avec `payload.visibleToUsers` : le membre qui y incarne le personnage, et son propriétaire s'il est en création. Les MJ et ces joueurs la reçoivent en direct par le service realtime, pas les autres (le diff peut porter des valeurs réservées au MJ). La campagne et son incarnateur viennent de la réponse de campaign déjà lue pour les droits (`campaigns-of`, champ `campaigns`).

`character.updated` porte l'opération (`operation`), ses détails, et le diff avant/après de l'état, du nom, de l'avatar et de la présentation (`details.concept`…) : `changes: [{ path, before, after }]` (ex. `{ "path": "etat.valeurs.PV", "before": 24, "after": 17 }`, possessions désignées par `entree#exemplaire`). Format et bornes : [bus.md](bus.md#diff-avantaprès-changes).
