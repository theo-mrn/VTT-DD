# Projection et documents

> Conception validée le 2026-10-02. Le MJ montre une image ou une vidéo à la table, en plein
> écran ou simplement envoyée, et garde ses documents dans une bibliothèque.

## Décisions

1. **Bibliothèque de documents du MJ** : images et vidéos envoyées d'avance (glisser-déposer,
   plusieurs à la fois), renommées, supprimées. Elles comptent dans les 5 Go de la campagne
   (docs/stockage.md).
2. **Deux façons de partager** un document :
   - **Projeter** : plein écran chez les destinataires, au-dessus de tout ;
   - **Envoyer** : il arrive sans interrompre, dans leur panneau « Documents ».

   Les deux le rangent dans le panneau « Documents » des destinataires.

3. **Destinataires** : toute la table par défaut, ou des joueurs choisis (une lettre pour un seul
   joueur).
4. **Plein écran** : chaque joueur le ferme pour lui (Échap, clic, bouton) ; le MJ peut
   « Arrêter la projection » pour tous ; un joueur qui arrive pendant une projection la voit.
5. **Vidéo projetée** : départ au même instant chez tous (heure du serveur, 1,5 s après le
   partage pour laisser charger), avec son son, réglé par le mixeur de chacun (bus musique) ;
   un joueur arrivé en retard la rejoint à la bonne position.

## Données (campaign)

| Table                     | Contenu                                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `campaign_handouts`       | `id`, `campaign_id`, `name`, `url` (fichier de la campagne), `content_type`, `created_by`, date                                                                  |
| `campaign_handout_shares` | `id`, `handout_id` (suppression en cascade), `mode` (`show` / `send`), `recipients` (`uuid[]`, null : tous), `shared_by`, `shared_at`, `starts_at`, `stopped_at` |

- Envoi du fichier : route commune `POST /v1/campaigns/:id/uploads`, usage `handout` (images
  10 Mo, vidéos webm ou mp4 100 Mo), réservé sur le quota.
- L'adresse d'un document doit être un fichier de la campagne (`campaigns/<id>/…`).
- Projection en cours : le dernier partage `show` non arrêté, de moins de 6 heures.

## Routes

| Méthode | Route                                            | Qui    | Rôle                                                             |
| ------- | ------------------------------------------------ | ------ | ---------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/handouts`                     | MJ     | bibliothèque                                                     |
| POST    | `/v1/campaigns/:id/handouts`                     | MJ     | `{ name, url }` : document ajouté                                |
| PATCH   | `/v1/campaigns/:id/handouts/:handoutId`          | MJ     | `{ name }`                                                       |
| DELETE  | `/v1/campaigns/:id/handouts/:handoutId`          | MJ     | document et ses partages retirés (fichier : passe des orphelins) |
| POST    | `/v1/campaigns/:id/handouts/:handoutId/share`    | MJ     | `{ mode, recipients }` : partage                                 |
| POST    | `/v1/campaigns/:id/handout-shares/:shareId/stop` | MJ     | fin de la projection pour tous                                   |
| GET     | `/v1/campaigns/:id/documents`                    | membre | ce que j'ai reçu (MJ : tout), et la projection en cours          |

## Événements

| Type                                 | Visibilité                                                        |
| ------------------------------------ | ----------------------------------------------------------------- |
| `handout.created`, `handout.updated` | `gm_only`                                                         |
| `handout.deleted`                    | `public` (identifiant seul : les documents reçus disparaissent)   |
| `handout.shared`, `handout.stopped`  | `public` pour toute la table ; sinon `gm_only` + `visibleToUsers` |

## Interface

- **Panneau « Documents »** du rail, pour tous (pastille de nouveautés) :
  - joueur : documents reçus, du plus récent au plus ancien ; un clic l'agrandit ;
  - MJ : sa bibliothèque (dépôt de fichiers, renommer, supprimer, « Projeter », « Envoyer »,
    destinataires) et l'historique des partages (« Arrêter » sur la projection en cours).
- **Projection** : calque plein écran monté par la table, fondu d'entrée ; image ajustée à
  l'écran, vidéo synchronisée ; fermeture locale mémorisée par partage.
