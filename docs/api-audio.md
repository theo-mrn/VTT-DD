# API du service audio

Le service **audio** (`backend/audio`, port 3008) et son **worker** (`audio-worker`, même paquet, entrée `dist/worker.js`, port 3009 en local) gèrent le son des campagnes : bibliothèque de sons (fichiers envoyés, catalogue intégré, liens YouTube), playlists, canaux **musique** et **ambiance** qui font autorité pour toute la table, **effets** ponctuels, **mixeur** personnel et **horloge** du serveur. La conception, l'audit de l'ancienne app et les décisions sont dans [audio.md](audio.md) ; ce document décrit ce qui est implémenté.

Toutes les routes passent par la gateway (`/v1/audio/*`) et demandent un jeton d'accès. Erreurs en `problem+json` avec `code` ; un non-membre reçoit 404 `campaign_not_found`, campaign injoignable donne 503 `campaign_unavailable` (aucun droit ouvert). `:id` est l'id de la campagne.

## Lancer en local

`pnpm dev` démarre tout, le service audio et son worker compris (`backend/audio/scripts/dev.mjs` lance `dev:service` et `dev:worker`). Il faut `ffmpeg` et `ffprobe` dans le `PATH` (`brew install ffmpeg`), le stockage S3 local (SeaweedFS, démarré par défaut) et les migrations (`pnpm dev` les applique). Seuls :

```bash
pnpm --filter @vtt/audio dev:service     # :3008
pnpm --filter @vtt/audio dev:worker      # :3009 (sondes)
pnpm --filter @vtt/audio publish:catalog --publier   # une fois : sons Star Wars dans le bucket
```

Tests : `TEST_DATABASE_URL=postgres://audio_svc:audio-dev@localhost:5432/vtt NATS_URL=nats://127.0.0.1:4222 TEST_S3_ENDPOINT=http://localhost:8333 pnpm --filter @vtt/audio test` (sans les variables, les tests d'intégration sont ignorés ; sans ffmpeg, ceux du worker aussi).

## Horloge et catalogue

| Méthode | Route                              | Réponse                                                                     |
| ------- | ---------------------------------- | --------------------------------------------------------------------------- |
| GET     | `/v1/audio/clock`                  | `{ serverTime }` (ms, `no-store`) : la seule horloge qui fait foi           |
| GET     | `/v1/audio/catalog?library=&kind=` | `{ categories, items: [CatalogEntry] }` ; `library` : système ou `starwars` |

Le catalogue par défaut (89 entrées) est servi par `assets.yner.fr` (CORS `*`, Range). Les 20 sons Star Wars sont publiés dans le bucket par `scripts/publish-catalog.ts` sous `audio/catalog/starwars/…` (`AUDIO_CATALOG_PUBLISHED_URL`, sinon `S3_PUBLIC_URL/audio/catalog`).

## Bibliothèque

| Méthode | Route                                             | Corps → réponse                                                                                                                                                                                      | Droits                           |
| ------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| GET     | `/v1/audio/campaigns/:id/assets?kind=&q=&cursor=` | `{ items: [Asset], nextCursor }`, tri par nom, 200 par page                                                                                                                                          | MJ ; joueur : `kind=sfx` (prêts) |
| GET     | `/v1/audio/campaigns/:id/assets/resolve?ids=`     | `{ items: [PlaybackAsset] }`, 100 ids au plus, supprimés compris (`deleted: true`)                                                                                                                   | membres                          |
| POST    | `/v1/audio/campaigns/:id/assets/uploads`          | `{ fileName, contentType, size, kind }` → 201 `{ uploadUrl, headers, expiresAt, uploadToken }` ; 413 `file_too_large`, 415 `unsupported_media_type`, 422 `quota_exceeded`, 503 `storage_unavailable` | MJ                               |
| POST    | `/v1/audio/campaigns/:id/assets`                  | `CreateAsset` → 201 `Asset` ; 422 `invalid_upload`, `invalid_youtube_id` ; 415 ; 404 `catalog_entry_not_found`                                                                                       | MJ                               |
| PATCH   | `/v1/audio/campaigns/:id/assets/:assetId`         | `{ name?, kind?, volume?, durationMs? (YouTube), version? }` → `Asset` ; 409 `version_conflict` `{ current }`                                                                                        | MJ                               |
| DELETE  | `/v1/audio/campaigns/:id/assets/:assetId`         | 204 : suppression logique                                                                                                                                                                            | MJ                               |

**Envoi d'un fichier.** 1) `POST …/uploads` : type déclaré (mp3, m4a/aac, ogg, opus/webm, wav, flac), taille (100 Mo musique et ambiance, 20 Mo effets) et quota de la campagne (2 Gio) vérifiés ; rien n'est écrit en base. 2) Le navigateur envoie le fichier par `PUT uploadUrl` avec les `headers` renvoyés (type et longueur signés, 5 min). 3) `POST …/assets { source: 'upload', uploadToken, name, kind }` : jeton HMAC vérifié (campagne, sorte, expiration), taille exacte relue sur le stockage, **type réel** lu sur les 4 premiers Kio (signatures ID3/MPEG, `ftyp`, `OggS`, `RIFF…WAVE`, `fLaC`, EBML). L'asset naît en `processing` avec un job `analyze`. Rejoué avec le même jeton : même asset.

**Worker.** `ffprobe` (une seule piste audio, pochette tolérée ; 60 min au plus, 10 min pour un effet), `ebur128` (loudness intégrée, true peak), gain de normalisation `clamp(−16 − I, −12, +6)` borné pour un true peak ≤ −1 dBTP, appliqué **à la lecture** ; transcodage AAC 192 kb/s en m4a `+faststart` si le codec n'est ni MP3 ni AAC ou au-delà de 320 kb/s. Fichiers : `audio/assets/<campagne>/<asset>/original.<ext>` et `playback.m4a`. Puis `ready` (`audio.asset_ready`) ou `rejected` avec le motif (`audio.asset_rejected`). 3 tentatives (10 s, 60 s, 5 min) pour les erreurs passagères ; un fichier refusé ne réessaie pas. Les entrées du catalogue passent aussi par `analyze` (durée, loudness) sans copie. Entretien horaire : `audio/incoming/` de plus de 24 h et effets de plus de 24 h effacés.

**Catalogue et YouTube.** Id déterministe (`importedAssetId(campagne, url | 'youtube:<id>')`) : ajouter deux fois le même son donne le même asset, un son supprimé puis rajouté est ranimé. YouTube : lien `watch`, `youtu.be`, `shorts`, `embed` ou id brut, `ready` tout de suite, lu par le lecteur IFrame caché du front (décision Q1), jamais téléchargé.

**Suppression.** `deleted_at` ; l'asset sort des playlists (version + 1, `audio.playlist_updated`) et des canaux (piste suivante ou arrêt, cause `asset_deleted`) dans la même transaction ; fichiers purgés 30 jours plus tard (job `purge`).

## Playlists

| Méthode | Route                                           | Corps → réponse                                     |
| ------- | ----------------------------------------------- | --------------------------------------------------- |
| GET     | `/v1/audio/campaigns/:id/playlists`             | `{ items: [Playlist] }`                             |
| POST    | `/v1/audio/campaigns/:id/playlists`             | `{ name, assetIds? }` → 201 `Playlist`              |
| PATCH   | `/v1/audio/campaigns/:id/playlists/:playlistId` | `{ name?, assetIds? (remplace l'ordre), version? }` |
| DELETE  | `/v1/audio/campaigns/:id/playlists/:playlistId` | 204                                                 |

MJ seul. Pistes : sons vivants de la campagne, sans doublon (422 `asset_not_found`). Une playlist modifiée pendant sa lecture recalcule la file du canal autour de la piste courante (cause `playlist_updated`).

## Canaux (musique, ambiance)

| Méthode | Route                                                | Corps → réponse                                                                                                                                                          | Droits  |
| ------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| GET     | `/v1/audio/campaigns/:id/channels`                   | `{ serverTime, channels: { music, ambience } }` (`ChannelState`)                                                                                                         | membres |
| POST    | `/v1/audio/campaigns/:id/channels/:channel/commands` | `ChannelCommand` → `ChannelState` ; 409 `version_conflict` `{ current }`, 409 `no_track`, 422 `asset_not_ready`, `empty_playlist`, `invalid_command`, 429 `rate_limited` | MJ      |

Commandes : `play { assetId | playlistId, index?, positionMs? }`, `pause`, `resume`, `seek { positionMs }`, `stop`, `next`, `previous` (en boucle, comme l'ancienne app), `configure { volume?, crossfadeMs?, repeat?, shuffle? }`, chacune avec `expectedVersion` facultative. Sans effet (pause d'un canal en pause…) : 200 et l'état courant, sans événement. 5 commandes par seconde et par canal.

**Ligne de temps.** La position n'est jamais écrite périodiquement : elle vaut `positionMs` à `anchorAt` (heure du serveur) et avance en lecture ; `positionAt(state, serverNow)` (`@vtt/contracts/audio-sync`) la calcule, côté serveur comme côté client. `play`, `resume`, `seek`, `next` et `previous` posent l'ancre **250 ms dans le futur** (`CHANNEL_START_LEAD_MS`) : l'événement arrive chez tous avant, et chacun démarre au même instant, depuis la même position.

**Enchaînement.** `endsAt = anchorAt + durée − position − fondu` (fondu seulement s'il y a une suivante). Chaque réplica passe toutes les 500 ms (`SELECT … FOR UPDATE SKIP LOCKED`) ; la nouvelle ancre vaut exactement l'ancien `endsAt`, et les clients ont déjà démarré la suivante à l'heure prévue (`planChannel`). Après une panne, rattrapage en une transition (`skipped`). YouTube sans durée : pas d'`endsAt`, le client du MJ envoie `next` avec `expectedVersion` en fin de vidéo.

## Effets

| Méthode | Route                                      | Corps → réponse                                          | Droits       |
| ------- | ------------------------------------------ | -------------------------------------------------------- | ------------ |
| POST    | `/v1/audio/campaigns/:id/cues`             | `{ cueId, assetId, volume? }` → 201 `{ cueId, startAt }` | MJ (Q4)      |
| POST    | `/v1/audio/campaigns/:id/cues/:cueId/stop` | 204                                                      | MJ ou auteur |
| POST    | `/v1/audio/campaigns/:id/cues/stop`        | 204 (tous)                                               | MJ           |

`cueId` (uuid choisi par le client) sert de clé d'idempotence. `startAt` = heure du serveur + 250 ms (`CUE_LEAD_MS`). Un client joue l'effet depuis le début à `startAt` s'il a moins de 3 s (`cueDecision`), sinon l'ignore (rejeu, onglet endormi). 10 effets par 10 s et par utilisateur (429 `rate_limited`).

## Mixeur

| Méthode | Route                | Corps → réponse                                         |
| ------- | -------------------- | ------------------------------------------------------- |
| GET     | `/v1/audio/me/mixer` | `MixerPreferences` (sans ligne : tout à 1, version 0)   |
| PUT     | `/v1/audio/me/mixer` | `{ volumes, muted?, version? }` (bus absents inchangés) |

Bus : `master`, `music`, `ambience`, `sfx`, `zones`, `dice`. 409 `version_conflict` `{ current }` si `version` diffère.

## Événements (sujet `vtt.<campaignId>.audio.<action>`)

| Type                                             | Visibilité             | Payload                                                   |
| ------------------------------------------------ | ---------------------- | --------------------------------------------------------- |
| `audio.asset_created`, `asset_ready`             | `gm_only`              | `{ asset }`                                               |
| `audio.asset_updated`                            | `gm_only`              | `{ asset, changes }`                                      |
| `audio.asset_rejected`                           | `gm_only`              | `{ assetId, reason }`                                     |
| `audio.asset_deleted`                            | `gm_only`              | `{ assetId }`                                             |
| `audio.playlist_created`, `_updated`, `_deleted` | `gm_only`              | `{ playlist }`, `{ playlist, changes }`, `{ playlistId }` |
| `audio.channel_changed`                          | `public`               | `{ state, cause, changes, skipped? }`                     |
| `audio.cue_played`                               | `public`               | `{ cueId, asset, startAt, volume, startedBy }`            |
| `audio.cues_stopped`                             | `public`               | `{ cueIds } \| { all: true }`                             |
| `audio.mixer_updated`                            | `owner`, `roomId` null | `{ volumes, muted, version }`                             |

Un état de canal n'est appliqué que si sa `version` est plus grande que celle connue (`reduceChannel`) : doublons, échos et rejeux sont sans effet. Consommateur durable `audio-campaigns` : `campaign.deleted` supprime logiquement la bibliothèque (purge dans 30 jours), les playlists et les effets, et arrête les canaux.

## Synchronisation mesurée

- Chemin durable commande → outbox (NOTIFY) → relais → JetStream → abonné : médiane 8 à 70 ms selon la charge (`latency.int.test.ts`), sous le délai de départ de 250 ms.
- Horloge : 5 échantillons, le plus court aller-retour ; erreur ≤ rtt / 2 (quelques ms en local).
- Dérive des lecteurs : ≤ 50 ms rien, ≤ 300 ms vitesse ± 2 %, au-delà seek (`driftAction`).

## Production

- Rôles `audio_owner` (Liquibase) et `audio_svc` ; secret `audio-secrets` (SOPS) : `DATABASE_URL`, `DATABASE_DIRECT_URL`, `INTERNAL_API_SECRET`, `S3_*`, `AUDIO_UPLOAD_SECRET`.
- R2 : règle CORS `GET, HEAD` (et `PUT` pour l'envoi) pour les origines du site, en-tête `Range` autorisé (Web Audio exige `crossOrigin="anonymous"`) ; règle de cycle de vie qui expire `audio/incoming/` après 1 jour.
- `infra/gitops/<env>/audio.yaml` (2 réplicas) et `audio-worker.yaml` (1 réplica, `/tmp` de 1 Gio, image `infra/docker/audio-worker.Dockerfile` avec ffmpeg 7.1).
