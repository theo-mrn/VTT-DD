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
  version: number; // concurrence optimiste : chaque écriture l'envoie et l'incrémente
  createdAt: string;
  updatedAt: string;
}
```

Une écriture qui envoie une `version` périmée reçoit **409** (problem+json). Le client relit alors le personnage et réessaie.

| Méthode | Route                                    | Corps                                                      | Réponse                                                                                                                                                |
| ------- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET     | `/v1/characters`                         | —                                                          | `[{ id, nom, avatarUrl, systeme: { id, version }, type, creation, updatedAt }]` : mes personnages                                                      |
| POST    | `/v1/characters`                         | `{ systemeId, type, nom }`                                 | 201 et le personnage (`etat.creation = true`)                                                                                                          |
| GET     | `/v1/characters/:id`                     | —                                                          | le personnage                                                                                                                                          |
| PATCH   | `/v1/characters/:id`                     | `{ version, nom?, avatarUrl? }`                            | le personnage                                                                                                                                          |
| DELETE  | `/v1/characters/:id`                     | —                                                          | 204                                                                                                                                                    |
| PUT     | `/v1/characters/:id/valeurs`             | `{ version, valeurs: { [cle]: valeur } }`                  | le personnage. Seuls les attributs saisissables sont acceptés : texte, choix, booléen, ressource ; les attributs de base seulement pendant la création |
| GET     | `/v1/characters/:id/creation`            | —                                                          | `etapesCreation()` : état de chaque étape                                                                                                              |
| POST    | `/v1/characters/:id/creation/:etape`     | `{ version, ... }` selon le type d'étape (voir ci-dessous) | le personnage                                                                                                                                          |
| POST    | `/v1/characters/:id/creation/terminer`   | `{ version }`                                              | le personnage                                                                                                                                          |
| GET     | `/v1/characters/:id/achats`              | —                                                          | `achatsPossibles()`                                                                                                                                    |
| POST    | `/v1/characters/:id/achats`              | `{ version, achat, objet }`                                | le personnage                                                                                                                                          |
| POST    | `/v1/characters/:id/achats/rembourser`   | `{ version, index }`                                       | le personnage                                                                                                                                          |
| POST    | `/v1/characters/:id/possessions`         | `{ version, entree, rang?, actif?, choix?, champs? }`      | le personnage (ajout ou mise à jour d'une possession)                                                                                                  |
| DELETE  | `/v1/characters/:id/possessions/:entree` | `?version=`                                                | le personnage                                                                                                                                          |
| POST    | `/v1/characters/:id/repos`               | `{ version, attributs? }`                                  | le personnage (`recuperer()`)                                                                                                                          |
| POST    | `/v1/characters/:id/actions/:action`     | `{ parametres?, cibleId?, appliquer? }`                    | `{ resultat, personnage?, cible? }`                                                                                                                    |

Corps des étapes de création, selon leur type :

- `choisir` : `{ entrees: [{ entree, choix? }] }`
- `repartir` et `saisir` : `{ valeurs }`
- `tirer` : `{ affectation? }`. Le serveur tire lui-même avec un générateur cryptographique.
- `acheter` : `{ achat, objet }`

Les jets d'action sont tirés par le serveur avec `aleatoireCrypto()`. Avec `appliquer: true`, les modifications de l'acteur et de la cible sont appliquées dans la même transaction, à deux conditions :

- l'appelant possède l'acteur ;
- pour la cible, en attendant les campagnes : il la possède aussi.

Sans `appliquer`, le résultat est seulement renvoyé.

## Événements (outbox)

Chaque écriture publie un événement : `character.created`, `character.updated` (avec la version), `character.deleted`, et `character.action_resolved` (avec le résultat complet, pour l'historique).
