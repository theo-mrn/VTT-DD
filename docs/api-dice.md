# API du service dice

Le service **dice** gère tout ce qui touche aux dés, quel que soit le système de jeu :

- les **jets** : notation libre (`2d6+3`, `4d6k3`, `1d20!`), dés à symboles du système, jets d'action transmis par character ;
- l'**historique des jets** d'une campagne, avec leur visibilité ;
- les **statistiques** de jets ;
- les **préférences de dés** d'un utilisateur : skin choisi, inventaire de skins débloqués, animation 3D, son.

Les jets sont tirés côté serveur par `aleatoireCrypto` de `@vtt/rules`. Le client anime ensuite le résultat reçu, sans jamais le décider : un joueur ne peut pas tricher en relançant côté navigateur.

Toutes les routes passent par la gateway (`/v1/dice/*`). Elles demandent un jeton d'accès ou une clé d'API (`Authorization: ApiKey …`), qui remplace l'ancienne route `/api/roll-dice` de l'ancienne app.

## Jets

| Méthode | Route                                              | Corps                                                                             | Réponse                                                                                                 |
| ------- | -------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/dice/rolls`                                   | `{ notation?, pool?, systemId?, campaignId?, characterId?, visibility?, label? }` | 201 et le jet enregistré                                                                                |
| GET     | `/v1/dice/rolls?campaignId=&before=&after=&limit=` | —                                                                                 | historique de la campagne, du plus ancien au plus récent (`after` sert au polling, `before` à remonter) |
| GET     | `/v1/dice/rolls/:id`                               | —                                                                                 | un jet (si visible par l'appelant)                                                                      |
| DELETE  | `/v1/dice/rolls/:id`                               | —                                                                                 | auteur ou MJ de la campagne                                                                             |

- `notation` : formule de dés de `@vtt/rules` (500 caractères au plus). Les variables `@FOR`, `mod(@DEX)`… sont lues sur le personnage `characterId` (le service interroge character).
- `pool` : dés à symboles `[{ de, nombre }]` du système `systemId` (Star Wars…), résolus avec `lancerSymboles`.
- `visibility` : `public` (défaut), `private` (auteur et MJ), `gm` (jet caché : MJ seul, l'auteur voit seulement qu'il a lancé), `self` (auteur seul).
- Sans `campaignId`, le jet est personnel : visible par son auteur seul, utile pour la page `/dice`.
- `Idempotency-Key` : une requête rejouée renvoie le même jet (aucune relance possible en renvoyant la requête).

Un jet enregistré :

```json
{
  "id": "…",
  "campaignId": "…",
  "author": { "id": "…", "name": "…", "avatarUrl": "…" },
  "character": { "id": "…", "name": "…" },
  "source": "free | action | api | import",
  "label": "Attaque — Épée longue",
  "notation": "1d20 + @Contact",
  "visibility": "public",
  "dice": [{ "faces": 20, "values": [{ "value": 17, "kept": true, "exploded": false }] }],
  "symbols": {
    "dice": [{ "die": "aptitude", "face": 3, "symbols": { "succes": 1 } }],
    "results": { "succesNets": 2 }
  },
  "total": 21,
  "outcome": { "success": true, "critical": false, "fumble": false },
  "createdAt": "…"
}
```

## Jets d'action

Les actions de character (`POST /v1/characters/:id/actions/:action`) tirent leurs dés elles-mêmes, avec le moteur de règles. Character transmet ensuite chaque résultat au service dice par une route interne, pour qu'il apparaisse dans l'historique de la campagne :

- `POST /internal/rolls` (en-tête `x-internal-secret`) : `{ campaignId?, authorId, characterId, actionId, label, visibility, dice, symbols?, total?, outcome, explanations }`.

## Statistiques

| Méthode | Route                                         | Réponse                                                                                       |
| ------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| GET     | `/v1/dice/stats?campaignId=&userId=&faces=20` | nombre de jets, moyenne, distribution par face, critiques et échecs critiques, série en cours |

## Préférences

| Méthode | Route                     | Corps                               | Réponse                                               |
| ------- | ------------------------- | ----------------------------------- | ----------------------------------------------------- |
| GET     | `/v1/dice/me/preferences` | —                                   | `{ skinId, animation3d, sound, inventory: [skinId] }` |
| PATCH   | `/v1/dice/me/preferences` | `{ skinId?, animation3d?, sound? }` | le skin doit être dans l'inventaire (ou gratuit)      |

L'inventaire de skins est alimenté par la boutique (service billing, plus tard) et par les défis. En attendant, les skins gratuits du catalogue sont toujours disponibles.

## Événements

`dice.rolled` (visibilité reprise du jet, `roomId` = campagne), `dice.roll_deleted`, `dice.preferences_updated`.

## Migration Firebase

`rolls/{roomId}/rolls/{id}` devient un jet `source: import`, rattaché à la campagne importée (`campaign.legacy_ids`) et à l'auteur (`identity.legacy_ids`). `users/{uid}.dice_skin` et l'inventaire de dés deviennent les préférences.
