# Médiathèque : mes images, rangées en dossiers

> Conception validée le 2026-10-14. Retrouver et réutiliser les images déjà envoyées depuis
> la zone d'envoi commune (`ImageDrop`), rangées dans des dossiers.

## Constat

- La zone d'envoi (`components/uploads/image-drop.tsx`, [uploads.md](uploads.md)) envoie un
  fichier et rend son adresse ; rien ne permet de retrouver une image déjà envoyée.
- campaign tient déjà l'inventaire de chaque campagne (`campaign_storage_files`,
  [stockage.md](stockage.md)) : clé, taille, type, usage, utilisé ou non, réservé à l'envoi par
  les trois services (campaign, character, audio), mis à jour d'après R2 chaque heure.
- Les adresses enregistrées (fond de scène, PNJ, objet, portrait…) ne sont pas limitées au
  dossier de leur service : une image de la campagne peut servir partout dans la campagne.

## Décisions

1. **La médiathèque est celle de la campagne**, bâtie sur l'inventaire existant : pas de
   seconde liste des fichiers. Hors campagne (avatar, bannière) : rien en v1.
2. **Dossiers** : table `campaign_media_folders` (`id`, `campaign_id`, `parent_id`, `name`,
   `owner_id`, `visible_to_players`, `version`), imbrication jusqu'à 3 niveaux ; colonne `folder_id` sur
   `campaign_storage_files` (null : racine). Supprimer un dossier remonte son contenu d'un
   niveau, ne supprime jamais un fichier.
3. **Qui voit quoi** : le MJ voit et range tout. Il rend un dossier ou une image visible des
   joueurs par un interrupteur (`visible_to_players`) ; un dossier visible rend visible tout ce
   qu'il contient. Un joueur voit en plus ce qu'il a envoyé (`uploaded_by`, posé à la
   réservation : la route de réservation interne reçoit l'utilisateur) et les dossiers qu'il a
   créés (`owner_id`) ; il range seulement les siens.
4. **Envoi dans un dossier** : la réservation accepte `folderId` ; la zone d'envoi envoie dans le
   dossier ouvert.
5. **Zone d'envoi** : deux vues, « Envoyer » (l'actuelle) et « Mes images » : fil d'Ariane des
   dossiers, grille de vignettes filtrée par l'usage (images, ou images et vidéos pour un fond
   de carte), créer / renommer / supprimer un dossier, déplacer une image (glisser sur un
   dossier, ou menu). Un clic sur une image la choisit (`onChange(adresse)`).
6. **Écran Stockage du MJ** : mêmes dossiers (navigation), la suppression d'un fichier inutilisé
   reste la sienne.

## Routes (campaign)

| Méthode | Route                                       | Qui             | Rôle                                           |
| ------- | ------------------------------------------- | --------------- | ---------------------------------------------- |
| GET     | `/v1/campaigns/:id/media?folder=&kind=`     | membre          | dossiers et fichiers d'un dossier (ses droits) |
| POST    | `/v1/campaigns/:id/media/folders`           | membre          | créer un dossier                               |
| PATCH   | `/v1/campaigns/:id/media/folders/:folderId` | propriétaire/MJ | renommer, déplacer ; visibilité : MJ           |
| DELETE  | `/v1/campaigns/:id/media/folders/:folderId` | propriétaire/MJ | supprimer (contenu remonté)                    |
| PATCH   | `/v1/campaigns/:id/media/files?key=`        | propriétaire/MJ | changer de dossier ; visibilité : MJ           |

Événements `media.*` (MJ, et le propriétaire) pour tenir les vues à jour.

## Phases

1. Base (dossiers, `folder_id`, `uploaded_by`), routes, réservation avec dossier et utilisateur —
   fait (migration 0038, module `media`, `media.int.test.ts`).
2. Vue « Mes images » dans la zone d'envoi — fait (`components/uploads/media-library.tsx`,
   `lib/media.ts`) : bouton « Mes images » sous la zone, envoi dans le dernier dossier ouvert.
3. **Documents › Bibliothèque** (panneau de la table, la médiathèque du MJ) : mêmes dossiers —
   fait (migration 0039 : `campaign_handouts.folder_id` ; fil d'Ariane, tuiles, glisser un
   document sur un dossier, dépôt dans le dossier ouvert ; un dossier supprimé remonte aussi
   ses documents).
4. **Bibliothèque des joueurs** (Documents) — fait (migration 0040 :
   `campaign_handout_placements`) : un joueur voit les documents reçus et ceux des dossiers
   montrés par le MJ (jamais un dossier caché, ni son nom) ; il crée ses propres dossiers et y
   range ces documents, rangement personnel que personne d'autre ne voit (`PATCH …/handouts/:id
{ folderId }` côté joueur : seulement ses dossiers, seulement un document qu'il voit).
5. Dossiers dans l'écran Stockage du MJ.
