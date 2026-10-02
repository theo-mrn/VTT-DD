# Stockage d'une campagne : inventaire, quota, contrôle

> Conception validée le 2026-10-02. Ce qu'une campagne occupe sur R2, la limite de 5 Go, et
> l'écran « Stockage » du MJ.

## Constat

- Trois services écrivent des fichiers d'une campagne, directement du navigateur vers R2 (URL
  PUT signée, taille exacte signée) :

  | Dossier                         | Service   | Contenu                                                    |
  | ------------------------------- | --------- | ---------------------------------------------------------- |
  | `campaigns/<campagne>/`         | campaign  | fonds de carte (images, vidéos), objets, PNJ, notes, image |
  | `characters/<personnage>/`      | character | portraits et tokens (personnages, PNJ, modèles)            |
  | `audio/incoming/<campagne>/`    | audio     | envoi brut, en attente du worker (24 h au plus)            |
  | `audio/assets/<campagne>/<id>/` | audio     | original et version de lecture d'un son                    |

- Avatars et bannières (`avatars/`, `banners/`) appartiennent à l'utilisateur : hors campagne,
  non comptés.
- Seul l'audio a un quota (2 Gio, depuis sa base). Rien ne dit au MJ ce qu'il occupe.
- La gateway ne voit jamais les fichiers (envoi direct à R2), n'a pas de base et ne sait pas à
  quelle campagne appartient un personnage : le quota ne peut pas y vivre. Elle relaie seulement
  les nouvelles routes (`/v1/campaigns/…`, déjà routé vers campaign).

## Décisions (2026-10-02)

1. **Inventaire central dans campaign.** campaign tient la liste des fichiers de chaque campagne
   (`campaign_storage_files`) : clé, taille, type, provenance, utilisé ou non. La vérité est R2 :
   un inventaire liste les dossiers de la campagne et met la table à jour. Les fichiers
   orphelins comptent tant que la passe des orphelins ne les a pas supprimés (ils occupent R2).
2. **5 Go par campagne** (`CAMPAIGN_STORAGE_QUOTA_BYTES`, 5 Gio par défaut). Au-delà, tout
   nouvel envoi est refusé (422 `storage_quota_exceeded`) ; alerte dès 80 %. Le quota audio
   séparé disparaît : les sons comptent dans les 5 Go.
3. **Écran « Stockage » des réglages de la campagne, MJ seul** : jauge, répartition, galerie de
   tout (images, vidéos, sons), taille, date, où c'est utilisé.
4. **Supprimer seulement l'inutilisé**, depuis cet écran ; la place est libérée tout de suite.

## Réservation à l'envoi

Un billet d'envoi n'est émis que s'il reste la place :

- `Uploads.ticket` et `Uploads.importFromUrl` (`@vtt/platform`) prennent un `reserve(fichier)`
  facultatif, appelé avec la clé, la taille, l'usage et le type **avant** de signer (ou d'écrire).
- **campaign** réserve chez lui ; **character** (personnage d'une campagne : `campaign_id`) et
  **audio** appellent `POST /internal/storage/reserve` de campaign (secret interne) :
  `{ campaignId, key, size, usage, contentType }` → 204, ou 422 `storage_quota_exceeded`.
- Réserver : sous verrou de la campagne (`pg_advisory_xact_lock`), somme des tailles connues
  (fichiers vus et réservations en cours) + taille demandée ≤ quota, puis ligne `pending`.
- Une réservation jamais vue sur R2 (envoi abandonné, billet de 5 min expiré) est oubliée au
  bout d'une heure.

## Inventaire

`inventoryCampaign(id)`, dans campaign :

1. liste R2 sous `campaigns/<id>/`, `audio/incoming/<id>/`, `audio/assets/<id>/`, et
   `characters/<p>/` pour chaque personnage de la campagne (modèles, PNJ et supprimés compris :
   `POST /internal/storage/characters` de character, `{ campaignId }` → `{ ids }`) ;
2. met à jour les lignes (`stored`, taille, date) et supprime celles qui n'y sont plus ;
3. « utilisé » : pour les images et vidéos, la route des références de chaque service (celle de
   la passe des orphelins), qui dit aussi **quelles tables** citent le fichier (fond de scène,
   objet, modèle de PNJ, note, personnage…) ; pour les sons, l'asset existe dans la
   bibliothèque.

Lancé chaque heure pour toutes les campagnes (verrou consultatif, une instance), et à
l'ouverture de l'écran si le dernier date de plus de 10 minutes (« Actualiser » le force).

## Routes

| Méthode | Route                                  | Qui     | Réponse                                                                     |
| ------- | -------------------------------------- | ------- | --------------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/storage?refresh=1`  | MJ      | `CampaignStorage` : quota, utilisé, par catégorie, fichiers, date           |
| DELETE  | `/v1/campaigns/:id/storage/files?key=` | MJ      | 204 ; 409 `file_in_use` si une référence existe encore (vérifiée en direct) |
| POST    | `/internal/storage/reserve`            | interne | 204 ou 422 `storage_quota_exceeded`                                         |

Catégories : `maps` (fonds de carte), `objects`, `npcs`, `characters`, `notes`, `sounds`,
`campaign` (image de la campagne), `other`. Déduites de l'usage réservé, sinon des tables qui
citent le fichier, sinon du dossier.

Suppression : seulement un fichier `campaigns/` ou `characters/` au format de nos envois, de
plus d'une heure, que **aucun** service ne cite (vérifié au moment de la demande, comme la passe
des orphelins). Les sons se suppriment dans la bibliothèque (le service audio retire leurs
fichiers).

## Écran

Réglages de la campagne, onglet « Stockage » (MJ) :

- jauge `utilisé / 5 Go`, orange dès 80 %, rouge à 100 % ;
- répartition par catégorie (taille et nombre), qui filtre la galerie ;
- galerie : vignette (image, vidéo, son avec écoute), taille, date, « où » (scène, objet, PNJ,
  note, personnage) ou « Inutilisé » ; tri par taille ou date ; « Supprimer » sur l'inutilisé ;
- les envois refusés pour quota affichent « Espace de la campagne plein (5 Go) ».
