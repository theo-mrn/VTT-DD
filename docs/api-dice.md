# API du service dice

Le service **dice** (`backend/dice`, port 3004) gère tout ce qui touche aux dés, quel que soit le système de jeu. Il reprend le comportement de l'ancienne app — le lanceur `legacy/src/components/(dices)/dice-roller.tsx`, la route `legacy/src/app/api/roll-dice/route.ts`, les statistiques `dice-stats.tsx` et le catalogue `dice-definitions.ts` — derrière une API :

- les **jets** : notation libre (`2d6+3`, `4d6kh3`, `1d20!`), variables du personnage (`1d20+FOR`), dés à symboles du système (`2aptitude 1difficulte`), jets d'action transmis par character ;
- l'**historique des jets** d'une campagne, avec les jets privés (`isPrivate`) et cachés au MJ (`isBlind`) ;
- les **statistiques** de jets, avec les calculs de l'ancien composant ;
- les **préférences de dés** d'un utilisateur : skin choisi, inventaire de skins, accès à tous les skins (ancien premium), animation 3D, son.

Comme dans l'ancienne app, **l'animation 3D des dés fait foi** : le client lit la face du dessus de chaque dé à l'arrêt et l'envoie (`physicalResults`) ; le serveur calcule le jet avec ces valeurs, par le moteur de formules de `@vtt/rules` (jamais d'`eval`). Sans animation (clé d'API, Discord, 3D coupée, repli), le serveur tire lui-même les dés avec `aleatoireCrypto`.

Toutes les routes passent par la gateway (`/v1/dice/*`). Elles demandent un jeton d'accès ou une clé d'API (`Authorization: ApiKey …`, échangée par la gateway), qui remplace l'ancienne route `/api/roll-dice`.

## Jets

| Méthode | Route                                              | Corps           | Réponse                                                             |
| ------- | -------------------------------------------------- | --------------- | ------------------------------------------------------------------- |
| POST    | `/v1/dice/rolls`                                   | voir ci-dessous | 201 : le jet, plus `rolls`, `saved` et `user` de l'ancienne API     |
| GET     | `/v1/dice/rolls?campaignId=&before=&after=&limit=` | —               | jets visibles par l'appelant, **du plus récent au plus ancien**     |
| GET     | `/v1/dice/rolls/:id`                               | —               | un jet (404 `roll_not_found` s'il n'est pas visible par l'appelant) |
| DELETE  | `/v1/dice/rolls/:id`                               | —               | 204 ; auteur ou MJ de la campagne, sinon 403 `not_roll_author`      |
| GET     | `/v1/dice/skins`                                   | —               | catalogue des skins : `[{ id, free }]`                              |

### Lancer

`POST /v1/dice/rolls` (en-tête `Idempotency-Key` conseillé) :

```json
{
  "notation": "1d20+FOR",
  "campaignId": "…",
  "characterId": "…",
  "isPrivate": false,
  "isBlind": false,
  "label": "Jet de Force",
  "physicalResults": [{ "type": "d20", "value": 17 }]
}
```

| Champ                     | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notation`                | Formule de dés, 500 caractères au plus : `NdM`, `NdMkhK` / `NdMklK` / `NdMkK` (garder), `NdM!` (explosion), `1D20` accepté, opérations `+ - * / %`, parenthèses, `floor()`, `max()`…. Dés à symboles du système en `N<dé>` (`2aptitude 1difficulte`, `1 Maîtrise`) : identifiant ou nom de la sorte de dé, sans accents ni casse.                                                                                   |
| `pool`                    | Dés à symboles sous forme structurée `[{ de, nombre }]`. `notation` **ou** `pool`, jamais les deux (400 `notation_and_pool`).                                                                                                                                                                                                                                                                                       |
| `systemId`                | Système des dés à symboles. Par défaut : celui du personnage, sinon celui de la campagne.                                                                                                                                                                                                                                                                                                                           |
| `campaignId` (`roomId`)   | Campagne du jet. Sans campagne, le jet est **personnel** : visible par son auteur seul (page `/dice`). `roomId` est l'ancien nom, accepté.                                                                                                                                                                                                                                                                          |
| `characterId` (`persoId`) | Personnage du jet : ses valeurs servent de variables, son nom et son avatar deviennent `userName` / `userAvatar`. Il faut pouvoir agir avec lui (propriétaire, ou MJ d'une campagne où il est engagé) : 404 `character_not_found`, 403 `character_forbidden`. Sans `characterId`, comme l'ancienne app : le personnage que l'appelant **incarne** dans la campagne (lu seulement si la notation contient des noms). |
| `variables`               | Variables explicites `{ "CON": 3 }` (ancienne API) : remplacent celles du personnage.                                                                                                                                                                                                                                                                                                                               |
| `isPrivate`, `isBlind`    | Ancienne visibilité : privé (auteur et MJ) ; caché au MJ (l'emporte sur `isPrivate`).                                                                                                                                                                                                                                                                                                                               |
| `visibility`              | Forme structurée, prioritaire : `public` (défaut), `private` (= `isPrivate`), `gm` (= `isBlind`), `self` (auteur seul, MJ compris).                                                                                                                                                                                                                                                                                 |
| `label`                   | Titre du jet (200 caractères au plus).                                                                                                                                                                                                                                                                                                                                                                              |
| `physicalResults`         | Faces lues sur les dés 3D, 100 au plus : `[{ type, value, tag? }]` (voir ci-dessous). Absent ou vide : le serveur tire les dés.                                                                                                                                                                                                                                                                                     |

Variables du personnage, comme `applyVariablesToNotation` de l'ancienne app : un **nom nu** (`FOR`, `for`, `NIV`) est remplacé par le **modificateur** de l'attribut s'il en a un, sinon par sa valeur. La syntaxe du moteur de règles marche aussi : `@FOR` (valeur), `mod(@FOR)` (modificateur).

Erreurs : 400 `notation_required`, `notation_too_long`, `notation_and_pool`, `invalid_notation` (détail : message et position), `invalid_pool`, `invalid_physical_result`, `system_required`, `validation_failed` ; 422 `unknown_system` ; 404 `campaign_not_found` (campagne inexistante ou appelant non membre) ; 403 `spectator_cannot_roll` ; 429 `too_many_rolls` (60 jets par minute et par utilisateur, `retry-after: 60`) ou 429 de la limite par IP (120 par minute) ; 503 `campaign_unavailable` / `character_unavailable`.

### Dés 3D : l'animation fait foi

Reprise de `perform3DRoll`, `calculateFinalResult` et `rollSymbolDiceNotation` de l'ancienne app : le client lance les dés en 3D, lit la face du dessus de chaque dé à l'arrêt et envoie ces valeurs avec le jet ; il ne corrige jamais l'animation.

```json
{
  "notation": "2d6+1d20+3",
  "campaignId": "…",
  "physicalResults": [
    { "type": "d6", "value": 4 },
    { "type": "d6", "value": 5 },
    { "type": "d20", "value": 17 }
  ]
}
```

| Champ   | Rôle                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`  | Dé numérique : `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`… (`dN`, casse indifférente). Dé à symboles : sa sorte dans le système (`aptitude`), ou sa forme (`d8`) avec `tag`. |
| `value` | Face lue, entier de 1 au nombre de faces du dé (face d'un dé à symboles : son numéro dans l'ordre déclaré par le système).                                                      |
| `tag`   | Sorte du dé à symboles quand `type` est sa forme, comme l'ancienne app : `{ "type": "d8", "value": 4, "tag": "aptitude" }`. Ignoré pour une notation numérique.                 |

Le serveur évalue la notation ou le pool avec un générateur qui rejoue ces valeurs : chaque dé demandé par le jet prend la **prochaine valeur de sa file**.

- **Notation numérique** : une file par nombre de faces. L'ordre entre types de dés est libre (`d20` avant les `d6` ci-dessus), l'ordre dans une même file est celui des dés de la notation. `results` garde l'ordre de la notation : `[4, 5, 17]`, total 29.
- **Dés à symboles** (notation `N<dé>` ou `pool`) : une file par sorte, désignée par `tag`, sinon par `type` (identifiant ou nom, sans accents ni casse) — Aptitude et Difficulté, deux d8, ne se mélangent pas. Une valeur `dN` sans sorte sert au premier dé à N faces dont la file est vide.
- **Valeurs manquantes** (relance d'un dé explosif, d100, dé non lancé en 3D) : tirées par le serveur (`aleatoireCrypto`).
- `source` du jet : `3d` si toutes les valeurs viennent du client, `mixed` si le serveur en a complété ; ancien `type` : `Dice Roller`.

Erreurs, 400 `invalid_physical_result` (aucun jet enregistré) : valeur hors de 1..faces (`{ "type": "d6", "value": 7 }`) ou non entière, type de dé inconnu, sorte à symboles inconnue du système, forme incohérente avec la sorte (`d6` pour une Aptitude), **valeur en trop** (dé absent du jet, ou plus de valeurs que de dés). Plus de 100 valeurs : 400 `validation_failed`.

`Idempotency-Key` : une requête rejouée par le même utilisateur (même clé, même avec un autre jeton) renvoie le jet d'origine (201, en-tête `idempotent-replayed: true`) ; elle ne relance jamais les dés.

La réponse est le jet (forme ci-dessous) plus trois champs de l'ancienne API `/api/roll-dice` : `rolls: [{ type: "d20", value: 17 }]` (type : `d<faces>`, ou la sorte du dé à symboles), `saved: true` et `user` (= `userName`).

### Un jet

Les premiers champs sont ceux du document `FirebaseRoll` de l'ancienne app (`rolls/{salle}/rolls`), repris tels quels pour que ses composants s'en servent ; viennent ensuite le détail structuré.

```json
{
  "id": "…",
  "campaignId": "…",

  "uid": "…",
  "userName": "Aria",
  "userAvatar": "https://…",
  "persoId": "…",
  "isPrivate": false,
  "isBlind": false,
  "diceCount": 1,
  "diceFaces": 20,
  "modifier": 0,
  "results": [17],
  "total": 20,
  "notation": "1d20+FOR",
  "output": "1d20+3 = [17]+3 = 20",
  "symbolResult": null,
  "type": "Dice Roller",
  "timestamp": 1790000000000,

  "source": "3d",
  "visibility": "public",
  "hidden": false,
  "label": "Jet de Force",
  "actionId": null,
  "systemId": null,
  "dice": [{ "faces": 20, "values": [{ "value": 17, "kept": true, "exploded": false }] }],
  "symbols": null,
  "outcome": { "success": null, "critical": false, "fumble": false },
  "explanations": [],
  "createdAt": "2026-09-21T10:13:20.000Z"
}
```

| Champ                    | Contenu                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `uid`                    | Auteur (compte identity) ; `null` pour un jet importé dont l'auteur n'a pas été retrouvé.                                                                                                                                  |
| `userName`, `userAvatar` | Nom affiché au moment du jet : le personnage, sinon « MJ » pour le MJ de la campagne, sinon le nom du profil (« Aventurier » à défaut).                                                                                    |
| `persoId`                | Personnage du jet, ou `null`.                                                                                                                                                                                              |
| `isPrivate`, `isBlind`   | `isPrivate` : visibilité `private` ou `self` ; `isBlind` : visibilité `gm`.                                                                                                                                                |
| `diceCount`, `diceFaces` | Premier groupe de dés (`4d6kh3` → 4 et 6), comme l'ancienne app ; pour des dés à symboles : nombre de dés et faces du premier.                                                                                             |
| `modifier`               | Toujours 0 (champ de l'ancienne app).                                                                                                                                                                                      |
| `results`                | Valeur de chaque dé, écartés et explosions compris ; face de chaque dé à symboles.                                                                                                                                         |
| `total`                  | Arrondi à l'entier inférieur ; 0 pour des dés à symboles ; `null` si `hidden`.                                                                                                                                             |
| `notation`               | Notation saisie (avant substitution des variables).                                                                                                                                                                        |
| `output`                 | Détail lisible de l'ancienne app : `1d20+3 = [17]+3 = 20`, dés écartés préfixés par « r » (`[r2, 6, 3, 5]`), `Aptitude [4, 2], Difficulté [2] = 2 Succès` pour des symboles ; déroulé de l'action pour un jet d'action.    |
| `symbolResult`           | Résultats non nuls des dés à symboles (`2 Succès + 1 Avantages`, « Aucun effet »), sinon `null`.                                                                                                                           |
| `type`                   | Ancien champ : `Dice Roller` (l'animation 3D a fait foi : `3d`, `mixed`), `Dice Roller/API` (tiré par le serveur : `free`, `api`), `Action` (jet d'action) ; valeur d'origine pour un jet importé.                         |
| `timestamp`              | Date du jet en millisecondes.                                                                                                                                                                                              |
| `source`                 | `3d` (faces lues sur les dés 3D du client), `mixed` (dés 3D complétés par le serveur), `free` (tiré par le serveur), `api` (tiré par le serveur, jeton issu d'une clé d'API), `action` (transmis par character), `import`. |
| `hidden`                 | Jet caché au MJ vu par son auteur : `results`, `dice`, `explanations` vides, `total`, `symbols`, `outcome`, `symbolResult` à `null`, `output` vide.                                                                        |
| `dice`                   | Groupes de dés numériques : `faces`, et pour chaque dé `value`, `kept` (faux pour un dé écarté), `exploded` (dé relancé par explosion).                                                                                    |
| `symbols`                | Dés à symboles : `dice: [{ die, face, symbols }]`, `totals` (par symbole), `results` (résultats du système, `succesNets`…).                                                                                                |
| `outcome`                | `success` : réussite d'un jet d'action (`null` pour un jet libre) ; `critical` / `fumble` : un seul dé gardé à sa valeur maximale / à 1 (jet libre), critique du système (action).                                         |

### Visibilité

Dans une campagne, pour un appelant membre :

| Visibilité              | Qui le voit                                                            |
| ----------------------- | ---------------------------------------------------------------------- |
| `public`                | tous les membres                                                       |
| `private` (`isPrivate`) | l'auteur et le MJ                                                      |
| `gm` (`isBlind`)        | le MJ ; l'auteur voit qu'il a lancé, sans le résultat (`hidden: true`) |
| `self`                  | l'auteur seul                                                          |

Un jet sans campagne est personnel (`visibility: self`) : visible par son auteur seul. Un non-membre reçoit 404 `campaign_not_found` ; un spectateur voit l'historique mais ne lance pas (403 `spectator_cannot_roll`).

### Historique

`GET /v1/dice/rolls` : sans `campaignId`, les jets personnels de l'appelant. Comme l'ancienne app, du **plus récent au plus ancien**, 50 par défaut (`limit` : 1 à 100).

- `before=<id>` : jets plus anciens que ce jet (page suivante de l'historique) ;
- `after=<id>` : jets plus récents que ce jet (polling, en attendant le service realtime) ; s'il y en a plus que `limit`, les plus anciens d'entre eux, pour reprendre ensuite avec le plus récent reçu ;
- `before` et `after` ensemble : 400.

## Jets d'action

Les actions de character (`POST /v1/characters/:id/actions/:action`) tirent leurs dés elles-mêmes, avec le moteur de règles. Leur corps accepte deux champs pour l'historique : `campaignId` (campagne où le jet apparaît ; absent : jet personnel) et `visibility`. Une fois l'action enregistrée, character transmet le jet à dice, sans attendre : une panne de dice est journalisée, l'action reste jouée. L'initiative lancée par campaign pour un MJ va dans l'historique de sa campagne.

- `POST /internal/rolls` (en-tête `x-internal-secret`, jamais relayée par la gateway) : `{ campaignId?, authorId, characterId, characterName?, characterAvatarUrl?, actionId, label?, notation?, systemId?, visibility, dice, symbols?, total?, outcome, explanations }` → 201 `{ id }`. L'auteur doit être membre non spectateur de la campagne (404 `campaign_not_found`, 403 `spectator_cannot_roll`). Le jet est enregistré sous le nom du personnage, `source: action`, `type: Action`, avec `output` = le déroulé de l'action.

dice lit les autres services par leurs routes internes (secret partagé) : le rôle de l'appelant dans une campagne (`GET /internal/campaigns/:id/rights` de campaign), la fiche d'un personnage (`GET /internal/characters/:id/sheet?userId=` de character : valeurs et modificateurs, mêmes droits qu'une action), et, avec le jeton de l'appelant, le système et le personnage incarné (`GET /v1/campaigns/:id`).

## Statistiques

| Méthode | Route                                                       | Réponse                   |
| ------- | ----------------------------------------------------------- | ------------------------- |
| GET     | `/v1/dice/stats?campaignId=&userId=&diceType=1d20&faces=20` | statistiques (ci-dessous) |

Les calculs de l'ancien composant `dice-stats.tsx`, faits côté serveur sur tout l'historique visible (10 000 jets les plus récents au plus), sur les **valeurs brutes** des dés (sans modificateurs, dés écartés compris). Les jets à symboles ne comptent pas.

- `campaignId` : jets de la campagne dont l'appelant voit le résultat (publics, les siens sauf ses jets cachés, et pour le MJ les privés et cachés). Sans campagne : ses propres jets, toutes campagnes confondues (hors jets cachés au MJ) ; `userId` d'un autre : 403 `campaign_required`.
- `userId` : un seul joueur ; `diceType` : type de dé `${diceCount}d${diceFaces}` (filtre de l'ancienne app) ; `faces` : premier groupe de ce nombre de faces.

```json
{
  "rollCount": 42,
  "diceTypes": ["1d20", "2d6"],
  "players": [
    {
      "userId": "…",
      "userName": "Aria",
      "userAvatar": null,
      "totalRolls": 30,
      "averageRoll": 10.9,
      "highestRoll": 20,
      "lowestRoll": 1,
      "totalSum": 327,
      "criticalSuccesses": 2,
      "criticalFailures": 1,
      "rollDistribution": { "1": 1, "20": 2 }
    }
  ],
  "globalDistribution": [{ "value": 1, "count": 3 }],
  "timeline": [{ "roll": 1, "total": 12, "notation": "1d20+FOR" }],
  "streak": { "direction": "high", "length": 3 }
}
```

- `players` : par joueur (compte ; nom pour un jet importé sans compte), du plus grand nombre de dés au plus petit ; `totalRolls` compte les **dés** comme l'ancienne app ; critiques et échecs critiques : 20 et 1 naturels du d20 d'un jet de `1d20`.
- `timeline` : moyenne des dés de chaque jet (2 décimales), du plus ancien au plus récent (du joueur `userId` s'il est donné).
- `streak` : série en cours, derniers dés tous au-dessus (`high`) ou tous en dessous (`low`) de la moyenne théorique ; seulement avec `diceType` ou `faces`, sinon `{ direction: null, length: 0 }`.

## Préférences

| Méthode | Route                     | Corps                               | Réponse                                                         |
| ------- | ------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| GET     | `/v1/dice/me/preferences` | —                                   | `{ skinId, animation3d, sound, allSkins, inventory: [skinId] }` |
| PATCH   | `/v1/dice/me/preferences` | `{ skinId?, animation3d?, sound? }` | les préférences mises à jour (même forme)                       |

```json
{
  "skinId": "bismuth",
  "animation3d": true,
  "sound": true,
  "allSkins": true,
  "inventory": ["magma", "gold", "silver", "steampunk_copper", "pierre_donjon"]
}
```

- Par défaut : `skinId: "gold"` (skin par défaut de l'ancienne app), `animation3d: true`, `sound: true`, `allSkins: false`.
- `inventory` : skins possédés **en propre**, dans l'ordre du catalogue — les skins **gratuits** (prix 0 dans l'ancienne app : `gold`, `silver`, `pierre_donjon`, et `steampunk_copper` qu'elle donnait à tous) et ceux débloqués (import de l'ancien `dice_inventory`, plus tard boutique du service billing et défis). Ils restent acquis quand `allSkins` repasse à `false`.
- `allSkins` : accès à **tous** les skins du catalogue — l'ancien premium (`ownsDice = isPremium || dice_inventory.includes(id)` de la boutique), plus tard l'abonnement du service billing. Il s'ajoute à `inventory` sans le remplacer : `inventory` ne liste pas les skins obtenus par cet accès.
- **Un skin est possédé si `allSkins` est vrai ou s'il figure dans `inventory`** : c'est la règle à appliquer côté front (boutique, sélecteur) et celle de PATCH.
- PATCH : 422 `unknown_skin` (hors catalogue), 403 `skin_not_owned` (skin non possédé), 400 si le corps est vide. Un skin qui n'est plus possédé (retiré de l'inventaire, fin de l'accès à tous les skins) redevient `gold` ; le choix est conservé et revient si l'accès est rendu.
- `GET /v1/dice/skins` : les 71 skins de `dice-definitions.ts`, `[{ id, free }]` ; leur rendu (couleurs, matériaux) reste au front.

### Accès à tous les skins (route interne)

- `PUT /internal/users/:userId/all-skins` (en-tête `x-internal-secret`, jamais relayée par la gateway) : `{ allSkins: boolean }` → 200, les préférences de l'utilisateur (forme de `GET /v1/dice/me/preferences`). 401 sans le bon secret, 400 pour un `userId` qui n'est pas un UUID ou un corps invalide.
- Destinée au service **billing**, qui la pilotera selon les événements d'abonnement (activation, fin de période, résiliation). Idempotente : sans changement, rien n'est écrit ni publié ; sinon `dice.preferences_updated` (acteur `system`). Un utilisateur sans préférences les reçoit avec les valeurs par défaut.
- En attendant billing, seul l'import Firebase pose ce drapeau (premium de l'ancienne app).

## Événements

Écrits dans l'outbox du service, dans la transaction de la donnée :

| Type                       | Charge utile                                                                 | Visibilité de l'enveloppe                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `dice.rolled`              | le jet complet (sans masquage), `results`, `output`, `userName`, `authorId`… | `public` ; `private` et `gm` → `gm_only` (l'auteur est `actor.userId`) ; `self` et jet personnel → `owner` |
| `dice.roll_deleted`        | `{ id, campaignId, authorId }`                                               | celle du jet                                                                                               |
| `dice.preferences_updated` | `{ userId, skinId, animation3d, sound, allSkins }` (préférences effectives)  | `owner` ; acteur `user` (PATCH) ou `system` (route interne all-skins, `actor.userId` null)                 |

`roomId` de l'enveloppe = la campagne (sujet `vtt.<campagne>.dice.rolled`). Les titres de l'ancienne app débloqués par un 1 ou un 20 naturel (« Maudit des dés », « Béni des Dieux ») seront attribués par identity en écoutant `dice.rolled` (dés et `outcome` dans la charge utile).

## Migration Firebase

`pnpm import:dice` (simulation par défaut, `--importer` pour écrire, `--sans-export` pour réutiliser l'export), après les comptes, personnages et campagnes :

- `rolls/{code}/rolls/{id}` devient un jet `source: import`, daté et ordonné comme à l'origine (UUIDv7 à la date du jet), avec tous ses champs d'origine (`isPrivate`, `isBlind`, `results`, `output`, `symbolResult`, `type`…) ; il est rattaché à la campagne importée (`campaign.legacy_ids`, `Salle/{code}`), à l'auteur (`identity.legacy_ids` par `uid`, ou par le nom affiché de `salles/{code}/Noms` pour les vieux jets) et au personnage (`characters.legacy_ids`). Un auteur introuvable : jet importé sans compte, sous son ancien nom. Les jets d'une campagne non importée sont ignorés. Pas d'événement : l'ancien journal est importé par history.
- `users/{uid}.dice_skin` et `dice_inventory` deviennent les préférences et l'inventaire (skins inconnus écartés), sans jamais écraser des préférences déjà présentes.
- Premium : `premium: true` avec `premiumEndDate` absent, `null`, `0` ou dans le futur (secondes Unix, le `cancelAt` de Stripe d'un abonnement résilié en fin de période) donne `allSkins: true` ; son `dice_skin` est repris même s'il n'est pas dans `dice_inventory`, sans y être ajouté (il était possédé par le premium). Sur des préférences déjà présentes, l'import ajoute l'accès sans toucher au reste ; il ne le retire jamais. Premium échu ou échéance illisible : avertissement, pas d'accès. Sans premium en cours, un skin payant choisi hors `dice_inventory` est ajouté à l'inventaire (l'ancienne app l'affichait).
- `dice_trail` (traînée des dés) : pas de champ dans les préférences (traînées en pause), ignoré avec un avertissement dans le rapport.
- Rejouable (`legacy_ids`), rapport NDJSON dans `~/vtt-export/rapport-des.ndjson`.
