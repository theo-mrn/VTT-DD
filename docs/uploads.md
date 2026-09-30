# Envoi de fichiers

Images et vidéos (portraits, avatars, fonds de carte, objets, PNJ, couvertures, notes) partent
**directement du navigateur au stockage** : R2 en prod, SeaweedFS en dev (`pnpm dev --stockage`).
Nos services ne font que **signer** : ils ne voient jamais passer le fichier.

## La route, la même partout

`POST …/uploads` (contrat `FileUploadRequest` → `FileUploadTicket`, `@vtt/contracts/uploads`) :

| Service   | Route                             | Usages                                                                      | Droits                                                         |
| --------- | --------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| identity  | `POST /v1/users/me/uploads`       | `avatar`, `banner`                                                          | l'utilisateur                                                  |
| campaign  | `POST /v1/campaigns/:id/uploads`  | `campaign-image`, `map-background`, `map-object`, `npc-image`, `note-image` | MJ ; `note-image` : qui écrit des notes dans la campagne       |
| character | `POST /v1/characters/:id/uploads` | `portrait`, `token`                                                         | qui a la main sur le personnage (propriétaire, MJ de sa table) |

Demande : `{ usage, contentType, size, name? }` (`name` pour les journaux seulement). Réponse :
`{ method: 'PUT', url, headers, publicUrl, key, expiresAt }`. Le navigateur envoie le fichier par
`PUT url` avec `headers`, puis enregistre `publicUrl` par l'écriture habituelle (PATCH du profil, du
personnage, de la carte…).

Refus : 415 `unsupported_media_type`, 413 `file_too_large`, 422 `usage_not_allowed` (usage d'une
autre route), 503 `storage_unavailable` (stockage non configuré, signature impossible), 403/404 selon
les droits. Débit limité par minute.

## Import d'une image d'un autre site

Une adresse collée (Pinterest…) s'affiche, mais le navigateur ne peut pas la lire pour la
recadrer ou la redessiner : ces sites n'envoient pas l'en-tête CORS. `POST …/uploads/import`
(`FileImportRequest` → `FileImport` : `{ usage, url }` → `{ publicUrl, key, contentType, size }`)
fait télécharger l'image par le service, qui la range comme un envoi. Aujourd'hui sur
`POST /v1/characters/:id/uploads/import` (Studio du portrait) ; la brique sert à toute route.

L'adresse vient d'un utilisateur, le service ne doit jamais atteindre le réseau interne
(`@vtt/platform`, `remote-image.ts`) :

- http(s) seulement, ports 80 et 443, sans identifiants dans l'adresse ;
- chaque adresse IP vérifiée **à la connexion** (résolution faite par nous) : boucle locale,
  réseaux privés, lien local (métadonnées du nuage), plages réservées refusés ;
- redirections suivies à la main, 3 au plus, chacune revérifiée ;
- taille bornée pendant la lecture (maximum de l'usage), 10 s au plus ;
- format lu dans les premiers octets (PNG, JPEG, GIF, WebP, AVIF), pas dans l'en-tête du site.

Refus : 422 `address_not_allowed`, 422 `import_failed` (introuvable, trop lent), 415, 413. Débit :
10 par minute.

## Les usages

Déclarés une fois dans `UPLOAD_USAGES` : formats, taille maximale, dossier, format du recadrage.
Le serveur s'en sert pour refuser, le front pour prévenir et recadrer (mêmes valeurs).

| Usage            | Formats                  | Max                           | Dossier      | Recadrage |
| ---------------- | ------------------------ | ----------------------------- | ------------ | --------- |
| `avatar`         | PNG, JPEG, WebP, GIF     | 5 Mo                          | `avatars`    | carré     |
| `banner`         | PNG, JPEG, WebP, GIF     | 5 Mo                          | `banners`    | 4:1       |
| `campaign-image` | PNG, JPEG, WebP, GIF     | 5 Mo                          | `campaigns`  | 16:9      |
| `note-image`     | PNG, JPEG, WebP, GIF     | 10 Mo                         | `campaigns`  | libre     |
| `map-background` | images + AVIF, WebM, MP4 | 10 Mo (image), 100 Mo (vidéo) | `campaigns`  | libre     |
| `map-object`     | images + AVIF            | 10 Mo                         | `campaigns`  | libre     |
| `npc-image`      | PNG, JPEG, WebP, GIF     | 5 Mo                          | `campaigns`  | carré     |
| `portrait`       | PNG, JPEG, WebP, GIF     | 5 Mo                          | `characters` | 3:4       |
| `token`          | PNG, JPEG, WebP, GIF     | 5 Mo                          | `characters` | carré     |

Clé : `<dossier>/<propriétaire>/<uuidv7>.<ext>` (propriétaire : utilisateur, campagne ou
personnage). Jamais réutilisée, jamais tirée du nom envoyé. Le type et la taille sont **signés** :
le stockage refuse tout autre fichier. URL valable 5 minutes.

Une adresse d'image enregistrée est vérifiée par le service qui l'enregistre (campagne : seulement
un fichier de son dossier, ou la bibliothèque du produit).

## Côté serveur : une seule brique

`@vtt/platform` (`uploads.ts`) : `Uploads.fromSettings(config)` (variables `S3_*`, les mêmes dans
chaque service), `ticket(req, propriétaire, usagesPermis, log)` valide, signe et journalise,
`isOwnFile(url, dossier, propriétaire)` reconnaît un fichier du dossier. La route du service ne fait
que vérifier ses droits puis appeler `ticket`.

## Côté navigateur : Uppy

- `lib/uploads/image.ts` : image préparée avant l'envoi, dans le navigateur : recadrage, côté le
  plus long borné selon l'usage (`MAX_SIDE`), compression en WebP (qualité 0,85). GIF et vidéos
  partent tels quels ; une image déjà plus légère que sa version compressée aussi.
- `lib/uploads/uploader.ts` : `uploadFile(cible, usage, fichier, { onProgress, signal })` : Uppy
  (`@uppy/aws-s3`, sans multipart) envoie au stockage avec la progression et l'annulation ; la
  signature passe par la route du service.
- `components/uploads/image-drop.tsx` : la zone commune : glisser-déposer, clic, coller une image
  (presse-papiers) ou une adresse (téléchargée dans le navigateur si le site l'autorise, sinon
  gardée telle quelle ; chemins de la bibliothèque acceptés), recadrage (`react-easy-crop`) au format
  de l'usage, anneau de progression avec octets et « Annuler », erreurs avec « Réessayer ».

Branchée aujourd’hui : portrait à la création de personnage, fond de scène ; le Studio du
portrait (docs/portraits.md) envoie portrait et token ; les autres envois
(objets, images de PNJ et de token, couverture, avatar, bannière) passent par `uploadFile` avec
leur usage.

## Stockage : réglages à ne pas oublier

- **CORS du bucket** (R2 et SeaweedFS) : méthode `PUT` depuis l'origine du site, en-tête
  `Content-Type` autorisé ; `GET` public pour l'affichage.
- **Domaine public** : `S3_PUBLIC_URL` (domaine R2 ou CDN), le même pour tous les services.
