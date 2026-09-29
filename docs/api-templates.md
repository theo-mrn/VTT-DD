# API des modèles du MJ (service character)

Bibliothèque du MJ d'une campagne, reprise de l'ancienne app : modèles de PNJ rangés en catégories
(`npc_templates/{salle}/templates` et `/categories`) et modèles d'objets
(`object_templates/{salle}/templates`). Le service `backend/character` les garde dans le schéma
`characters` (changeset `0003-templates.sql`), à côté des personnages.

Périmètre : les **données** et un CRUD minimal réservé au MJ. Le placement sur la carte (glisser un
modèle, nombre d'exemplaires, visibilité) passe par `POST /v1/campaigns/:id/maps/:mapId/npcs`
([api-map.md](api-map.md), PNJ) : chaque exemplaire est un vrai personnage, copie complète de
l'état du modèle, qui garde son `templateId` (voir [api-character.md](api-character.md),
« Instances de PNJ »). Les `actions` legacy d'un modèle restent sur le modèle.

> Routage : la gateway relaie ces trois préfixes vers character (`SUB_ROUTES` dans
> backend/gateway/src/app.ts), le reste de `/v1/campaigns/*` allant à campaign.

## Droits

Toutes les routes demandent un jeton d'accès et sont **réservées au MJ de la campagne**. Le rôle
est demandé à campaign (`GET /internal/campaigns/:id/rights?userId=`, secret interne), gardé
`DROITS_CACHE_MS` en mémoire :

| Appelant                         | Réponse                                    |
| -------------------------------- | ------------------------------------------ |
| MJ de la campagne                | accès complet                              |
| joueur ou spectateur             | 403                                        |
| non-membre, campagne inexistante | 404 (on ne révèle pas son existence)       |
| campaign injoignable             | 503 `campaign_unavailable` (jamais ouvert) |

Une ligne d'une autre campagne est introuvable (404), même pour son MJ.

## Formes renvoyées

```ts
// Catégorie de PNJ
{ id, campaignId, name, color: string | null, version, createdAt, updatedAt }

// Modèle de PNJ
{
  id, campaignId,
  categoryId: string | null,
  name: string,               // legacy Nomperso
  imageUrl: string | null,    // legacy imageURL : image de base (portrait)
  tokenUrl: string | null,    // legacy imageURL2 : jeton affiché sur la carte
  actions: { name, description, toHit }[], // legacy Actions : Nom, Description, Toucher
  etat: EtatEntite,           // statistiques, dans le système de la campagne (@vtt/rules)
  fiche: FicheJson,           // valeurs calculées et expliquées, comme pour un personnage
  version, createdAt, updatedAt
}

// Modèle d'objet (décor à poser sur la carte, sans règles de jeu)
{ id, campaignId, name, imageUrl: string | null, category: string | null, version, createdAt, updatedAt }
```

Les statistiques d'un modèle de PNJ sont un `EtatEntite`, comme celles d'un personnage : aucune clé
propre à un système n'est connue du service, tout est lu dans le catalogue du système. Un modèle
n'est jamais « en création » : `etat.creation` est toujours enregistré à `false`. L'état est
validé et recalculé à chaque écriture (`verifierEtat`) ; son système ne change pas après la
création.

Les objets de l'ancienne app sont des images de décor (nom, image, catégorie `custom` pour ceux
créés par le MJ), pas des objets du catalogue : ils restent en forme libre. `defaultWidth` et
`defaultHeight` figuraient dans le type legacy mais n'étaient jamais écrits : ils ne sont pas repris.

## Routes

Préfixe : `/v1/campaigns/:campaignId`. Une écriture qui envoie une `version` périmée reçoit **409**
`version_perimee`.

| Méthode | Route                                  | Corps                                                                                               | Réponse                    |
| ------- | -------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------- |
| GET     | `/npc-template-categories`             | —                                                                                                   | `[Catégorie]` (création ↑) |
| POST    | `/npc-template-categories`             | `{ name, color? }`                                                                                  | 201 `Catégorie`            |
| PATCH   | `/npc-template-categories/:categoryId` | `{ version, name?, color? }`                                                                        | `Catégorie`                |
| DELETE  | `/npc-template-categories/:categoryId` | —                                                                                                   | 204                        |
| GET     | `/npc-templates`                       | —                                                                                                   | `[Modèle de PNJ]`          |
| POST    | `/npc-templates`                       | `{ name, categoryId?, imageUrl?, tokenUrl?, actions?, etat }` ou `{ …, systemeId, type, valeurs? }` | 201 `Modèle de PNJ`        |
| PATCH   | `/npc-templates/:templateId`           | `{ version, name?, categoryId?, imageUrl?, tokenUrl?, actions?, etat?, valeurs? }`                  | `Modèle de PNJ`            |
| DELETE  | `/npc-templates/:templateId`           | —                                                                                                   | 204                        |
| GET     | `/object-templates`                    | —                                                                                                   | `[Modèle d'objet]`         |
| POST    | `/object-templates`                    | `{ name, imageUrl?, category? }`                                                                    | 201 `Modèle d'objet`       |
| PATCH   | `/object-templates/:templateId`        | `{ version, name?, imageUrl?, category? }`                                                          | `Modèle d'objet`           |
| DELETE  | `/object-templates/:templateId`        | —                                                                                                   | 204                        |

- `valeurs` (création et modification) : attributs saisissables posés sur l'état avec les droits
  du MJ (valeurs de base, choix, textes, booléens), comme la création rapide d'un PNJ ; en
  modification, seules les valeurs envoyées changent. Clé inconnue ou non saisissable : 422.
- `POST /npc-templates` : `etat` complet (EtatEntite), ou `systemeId` et `type` pour partir d'un
  état vide du système, comme `POST /v1/characters`. Système inconnu : 400 `systeme_inconnu` ; état
  invalide ou d'un autre système (PATCH) : 422 `etat_invalide`.
- `categoryId` doit désigner une catégorie de la même campagne : sinon 422 `category_not_found`.
  `null` range le modèle « sans catégorie ».
- Supprimer une catégorie garde ses modèles, rangés « sans catégorie » (leur `version` augmente).
  L'ancienne app laissait un `categoryId` orphelin, affiché « Inconnu ».
- `imageUrl`, `tokenUrl` : URL http(s) de 2 048 caractères au plus (images envoyées au stockage
  par le front, ou actifs publics). `color` : `#rgb` à `#rrggbbaa`.

## Événements

Dans l'outbox de character, même transaction que l'écriture ; sujet `vtt.<campaignId>.<domaine>.<action>`,
visibilité `gm_only`, acteur `{ userId, role: 'gm' }`. Les mises à jour portent le diff avant/après
`changes` (voir [bus.md](bus.md)). Le front écoute `npc_template.*` et `object_template.*` pour
rafraîchir ses listes (l'ancienne app écoutait les collections en direct).

| Type                            | Agrégat                 | Payload                                                        |
| ------------------------------- | ----------------------- | -------------------------------------------------------------- |
| `npc_template.category_created` | `npc_template_category` | `{ version, name, color }`                                     |
| `npc_template.category_updated` | `npc_template_category` | `{ version, changes }` (nom, couleur)                          |
| `npc_template.category_deleted` | `npc_template_category` | `{ name, detachedTemplateIds }`                                |
| `npc_template.created`          | `npc_template`          | `{ version, name, categoryId, systeme, type }`                 |
| `npc_template.updated`          | `npc_template`          | `{ version, changes }` (nom, catégorie, images, actions, état) |
| `npc_template.deleted`          | `npc_template`          | `{ name }`                                                     |
| `object_template.created`       | `object_template`       | `{ version, name, imageUrl, category }`                        |
| `object_template.updated`       | `object_template`       | `{ version, changes }`                                         |
| `object_template.deleted`       | `object_template`       | `{ name }`                                                     |
| `npc_template.imported`         | `campaign`              | `{ categories, templates, imported: true }` (import)           |
| `object_template.imported`      | `campaign`              | `{ templates, imported: true }` (import)                       |

## Import depuis Firebase

À lancer après l'import des campagnes (la correspondance salle → campagne vient de
`campaign.legacy_ids`, le système de `campaign.campaigns`).

```sh
# Export Firestore en lecture seule (tools/firebase-export), hors du dépôt
node --env-file=legacy/.env tools/firebase-export/dist/cli.js \
  --collection npc_templates --collection object_templates --recursive --out ~/vtt-export

pnpm --filter @vtt/character build
export CAMPAIGN_DATABASE_URL=…   # rôle campaign_svc (backend/campaign/.env), lecture seule
# + variables S3_* (backend/identity/.env) pour rapatrier les images
node --env-file=backend/character/.env backend/character/dist/import/templates/cli.js \
  --export ~/vtt-export --report ~/vtt-export/rapport-modeles.ndjson            # simulation
node --env-file=backend/character/.env backend/character/dist/import/templates/cli.js \
  --export ~/vtt-export --report ~/vtt-export/rapport-modeles.ndjson --importer # écriture
```

- **Simulation par défaut** : rien n'est écrit ; `--importer` écrit. La sortie ne donne que des
  compteurs, le détail par document est dans le rapport (fichier 0600) : statut (`importe`,
  `deja-importe`, `a-importer`, `sans-campagne`, `systeme-non-migre`, `erreur`) et avertissements.
- **Rejouable** : chaque ligne a pour identifiant l'UUIDv5 de son chemin Firestore ; un second
  import ignore ce qui existe (`ON CONFLICT DO NOTHING`), sans événement, sans retélécharger les
  images. Limite : un modèle importé puis supprimé par le MJ reviendrait si l'on rejouait l'import.
- **Statistiques** : chaque modèle passe par `transformerPersonnage` (migration des personnages),
  dans le système **de la campagne**, avec le sens des jauges du système de la salle
  (`Salle.ndjson`, `gameSystems.ndjson`, facultatifs). Les valeurs dérivées saisies par le MJ
  (Défense, Contact, INIT…, seuils Star Wars stockés en `PV_Max`/`Stress_Max`) font foi : si le
  système les recalcule autrement, l'écart est gardé par un bonus libre « Valeurs du modèle » (source
  MJ), visible et modifiable sur la fiche. Les attributs dérivés sont lus dans le système, jamais
  listés en dur ; seul le renommage des seuils Star Wars vient de `correspondances/`.
- **Images** : Firebase Storage et `data:` sont copiées dans le stockage S3 (`characters/imported/`,
  nom dérivé du contenu) ; une image disparue (404) est retirée avec un avertissement ; les actifs
  publics (R2) et les sites tiers restent tels quels.
- **Catégories** : un modèle dont la catégorie n'existe plus dans l'export est rangé « sans
  catégorie », avec un avertissement.
- Non repris : les champs de cache `_F` (`PV_F`, `Defense_F`), recalculés ; le niveau hors des
  systèmes qui en ont un (comme pour les personnages).
