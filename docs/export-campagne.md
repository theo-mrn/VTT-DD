# Export et import d'une campagne, centre des exports

> Conception du 2026-11-11. Choix de Théo le même jour : campagne entière, fabriquée par le
> serveur avec un centre « Mes exports », fichiers inclus dans l'archive, réimport (et donc
> duplication) dans la même livraison. Décisions d’architecture : § 9.

## 1. Le besoin

Un MJ veut garder sa campagne hors de Yner (sauvegarde, fin d'abonnement, changement de
compte), la remettre en place plus tard, la confier à un autre MJ, ou la dupliquer pour
rejouer un one-shot avec une autre table. Feuille de route : « Export ou import d'une campagne
entière », « Dupliquer ou archiver une campagne ».

Aujourd'hui, seul l'export des données du compte existe (`lib/data-export.ts`, docs/legal.md) :
un JSON assemblé dans le navigateur, campagnes par leur seul résumé, images par leur adresse.
Il répond au droit à la portabilité, pas à ce besoin.

## 2. Ce que fait la livraison

| Action               | Qui                              | Résultat                                                           |
| -------------------- | -------------------------------- | ------------------------------------------------------------------ |
| Exporter             | MJ de la campagne                | Archive `.yner` fabriquée en arrière-plan, gardée 7 jours          |
| Mes exports (centre) | Tout compte                      | Liste : état, avancement, taille, expiration, télécharger, effacer |
| Importer une archive | Tout compte (quota de campagnes) | Nouvelle campagne dont il est le MJ                                |
| Dupliquer            | MJ de la campagne                | Export puis import enchaînés côté serveur, sans téléchargement     |

## 3. Contenu d'une campagne

Inventaire des tables au 2026-11-11 (schémas `campaign`, `character`, `audio`).

| Domaine                | Service   | Tables                                                                                                                                                                                        | Exporté           |
| ---------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Campagne               | campaign  | `campaigns` (nom, description, accroche, genres, image, système), `campaign_settings`                                                                                                         | oui               |
| Scènes                 | campaign  | `maps`, `map_groups`, `map_layers`, `map_settings`, `map_obstacles`, `map_lights`, `map_rooms`, `map_objects`, `map_drawings`, `map_notes`, `map_music_zones`, `map_portals`, `map_fog_zones` | oui               |
| État de jeu des scènes | campaign  | `map_fog`, `map_explorations`, `map_measurements`, jetons (`map_tokens`)                                                                                                                      | au choix (§ 9)    |
| Notes                  | campaign  | `notes`, `note_pins`                                                                                                                                                                          | oui               |
| Documents              | campaign  | `campaign_handouts`, dossiers, `campaign_handout_placements` ; partages (`_shares`) : non (joueurs)                                                                                           | oui               |
| Médiathèque            | campaign  | `campaign_media_folders`, fichiers cités                                                                                                                                                      | oui               |
| Automatismes           | campaign  | `automation_rules`, `automations`                                                                                                                                                             | oui               |
| Inventaires partagés   | campaign  | `campaign_storage_inventories`                                                                                                                                                                | oui               |
| PNJ et objets          | character | `npc_template_categories`, `npc_templates`, `object_templates`, PNJ posés (`characters`, `kind = npc`)                                                                                        | oui               |
| Personnages joueurs    | character | `characters` (`kind = pc`), dont le propriétaire est un joueur                                                                                                                                | oui, en PNJ (§ 9) |
| Sons                   | audio     | `assets` (fichiers), `playlists`, `playlist_items`, `cues`, `soundboards`, `channels`                                                                                                         | oui               |
| Jamais                 | —         | membres, invitations, sessions, messages, combats en cours, attaques, journal (`history`), jets (`dice`), tâches d'automatismes, candidatures, réservations de stockage, identifiants hérités | non               |

Les données d'un joueur (membres, messages, partages, jets) ne sortent jamais dans l'archive
d'un MJ : elles ne lui appartiennent pas.

## 4. Format de l'archive `.yner`

Choix de Théo (2026-11-11) : **instantané de tables**, pas de format métier. Code :
`packages/contracts/src/archive.ts`.

```
manifest.json                       format, campagne, options, version du schéma et tables de chaque service, fichiers
tables/<service>/<table>.json       lignes de la table, telles que le service les lit (camelCase)
files/<sha256>                      chaque contenu une seule fois
```

- **Tables** : chaque service tient sa liste blanche de tables et retire ce qui n'est pas au MJ
  (§ 3). Une colonne ajoutée par une migration est exportée d'office : rien ne se perd. Le
  manifeste porte la dernière migration de chaque service (`schemaVersion`) : à l'import, le
  service complète les colonnes absentes par leurs valeurs par défaut, ignore les colonnes
  disparues et applique ses étapes de mise à niveau pour les changements de sens.
- **Fichiers** : l'adresse publique d'un fichier de la campagne (`campaigns/`, `characters/`,
  `audio/assets/`), même au milieu d'un HTML, devient `yner-file:<clé R2 d'origine>`
  (`toFileRefs`). Le manifeste liste chaque clé avec son empreinte, sa taille et son type ; le
  contenu est rangé une fois par empreinte. Les fichiers des packs (`marketplace/`) et de la
  bibliothèque gardent leur adresse.
- **Identifiants** : à l'import, chaque `id` de ligne reçoit un nouvel UUIDv7, remplacé partout
  d'un coup (`remapIds`) : valeurs, clés d'objets, JSON, HTML et clés de fichiers. Les liens
  entre tables et entre services suivent, et les fichiers tombent d'eux-mêmes dans les dossiers
  de la nouvelle campagne et des nouveaux personnages. Les identifiants inconnus (comptes des
  joueurs, packs) restent : chaque service les traite (propriétaire → qui importe, listes de
  joueurs → vidées).
- **Sûreté** : seuls `manifest.json`, `tables/<service connu>/<table>.json` et
  `files/<sha256>` sont lus (`parseArchivePath`) ; une clé de fichier est refusée hors des trois
  dossiers ou avec `..` (`ArchiveFileKey`) ; après renouvellement, une clé doit appartenir à la
  nouvelle campagne ou à un de ses nouveaux personnages (`fileOwner`).
- **Taille** : 6 Gio, 50 000 fichiers, 1 million de lignes, 256 Mio par table
  (`ARCHIVE_LIMITS`). Médias rangés sans compression, JSON compressé.

## 5. Fabrication

### 5.1 Tâches

Une table de tâches sur le modèle d'audio (`jobs` : `pending` → `running` → `ready` / `failed`,
`attempts`, `locked_until`, reprise après plantage) :

| Champ         | Contenu                                                                       |
| ------------- | ----------------------------------------------------------------------------- |
| `kind`        | `export`, `import`, `duplicate`                                               |
| `user_id`     | qui l'a lancée ; seul à la voir                                               |
| `campaign_id` | source (export, duplication) ou campagne créée (import, duplication)          |
| `progress`    | 0 à 1, et l'étape en cours (`collect`, `files`, `zip`, `create`…)             |
| `object_key`  | archive sur R2 (`exports/<user>/<tâche>.yner`)                                |
| `size`        | taille de l'archive                                                           |
| `expires_at`  | fin de conservation (7 jours après `ready`)                                   |
| `error`       | code lisible (`storage_quota_exceeded`, `archive_invalid`, `campaign_quota`…) |

Une tâche à la fois par campagne pour l'export, deux à la fois par compte. Une passe horaire
efface les archives expirées (R2 et ligne).

### 5.2 Export

1. Vérifier que le demandeur est MJ ; créer la tâche, 202.
2. Demander à chaque service propriétaire son instantané : `GET /internal/campaigns/:id/archive`
   sur campaign, character et audio (`ArchiveServiceSnapshot`). **Chaque service lit ses
   propres tables** et ne rend que ce qui est au MJ ; l'assemblage remplace les adresses de
   fichiers par `yner-file:` (`toFileRefs`).
3. Collecter les adresses de fichiers, les lire sur R2 en flux et les écrire dans le zip
   (envoi multipart vers R2, jamais tout en mémoire ni sur le disque du pod).
4. `manifest.json` en dernier, tâche `ready`, événement `archive.export_ready` (journal,
   visibilité `owner`).

### 5.3 Import

1. Envoi direct du navigateur vers R2 (`imports/<user>/<tâche>.yner`, URL PUT signée, taille
   signée, 5 Gio au plus), puis `POST /v1/archives/imports` → tâche.
2. Lecture du zip **par plages** (répertoire central puis entrées à la demande : R2 accepte
   `Range`), validation complète : schémas, empreintes, système connu, version lisible.
3. Renouveler tous les identifiants (`remapIds`), clés de fichiers comprises ; ne garder que
   les fichiers qui tombent sous la nouvelle campagne ou un de ses nouveaux personnages, d'un
   type sûr (images, vidéos, sons : jamais de HTML ni de SVG servi depuis notre domaine) ;
   refuser au-delà du quota d'une campagne (5 Gio, `storage_quota_exceeded`) ; recopier les
   fichiers sous leurs nouvelles clés, empreinte vérifiée au fil de la lecture. L'inventaire de
   campaign les retrouve ensuite (pas de réservation : la campagne est neuve).
4. Écrire le contenu par les routes internes d'import de chaque service
   (`POST /internal/campaigns/:id/archive`), chacune en une transaction.
5. **Tout ou rien** : un échec après la création de la campagne la supprime par la suppression
   existante (effacement propagé, fichiers compris). Jamais de campagne à moitié importée.
6. L'archive envoyée est effacée à la fin, réussite ou non.

### 5.4 Duplication

Export puis import enchaînés dans la même tâche, l'archive ne quitte pas R2 et n'est pas
proposée au téléchargement. Nom : « <nom> (copie) ».

### 5.5 Routes internes des services (lot 2, fait)

Moteur commun : `backend/platform/src/archive-tables.ts` (`exportArchiveTables`,
`importArchiveTables`). Chaque service décrit ses tables dans `modules/archive/tables.ts`, avec
`ARCHIVE_SCHEMA_VERSION` = sa dernière migration (vérifié par un test).

| Service   | Instantané                                                        | Import                                                           |
| --------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| campaign  | `GET /internal/campaigns/:id/archive?keepProgress=` (+ `gmIds`)   | `POST /internal/campaigns/:id/archive`                           |
| character | `POST /internal/campaigns/:id/archive/snapshot` `{options,gmIds}` | `POST /internal/campaigns/:id/archive`                           |
| audio     | `POST /internal/campaigns/:id/archive/snapshot` `{options,gmIds}` | `POST /internal/campaigns/:id/archive`                           |
| campaign  | —                                                                 | `DELETE /internal/campaigns/:id/archive?userId=` (import manqué) |

Ordre d'import : campaign (crée la campagne, son MJ, `campaign.created`), character, audio. Un
échec après campaign : `DELETE` ci-dessus, `campaign.deleted` fait le ménage chez character et
audio. Un second import de la même campagne : 409 `archive_conflict`.

Règles appliquées :

- **Gardes du moteur** : campagne forcée, comptes → qui importe, listes de comptes vidées, tout
  `uuid` hors de l'archive coupé (ou ligne écartée s'il est obligatoire) ; une ligne écartée
  retire son identifiant, ce qui la cite tombe avec elle ; colonnes générées jamais écrites ;
  dossiers insérés parents d'abord.
- **campaign** : notes, dossiers de la médiathèque et fichiers inventoriés **du MJ seulement** ;
  notes réassainies à l'import ; campagne privée avec un code neuf ; personnages engagés
  incarnés par personne ; calques par défaut des cartes remplacés par ceux de l'archive ;
  fichier inventorié hors de la nouvelle campagne ou de ses personnages écarté.
- **character** : personnages non supprimés ; ceux des joueurs exportés en PNJ (`kind = npc`) ;
  jet en attente jamais repris.
- **audio** : sons prêts seulement ; son dont un fichier sort du dossier de la nouvelle campagne
  écarté ; canaux et déclenchements en cours jamais repris.
- **État de jeu** (`keepProgress`) : jetons, zones de brouillard, exploration, mesures, état des
  outils de table.

## 6. API (via la gateway, service archive, `/v1/archives`)

| Route                                | Effet                                                     |
| ------------------------------------ | --------------------------------------------------------- |
| `POST /v1/archives/exports`          | `{ campaignId, keepProgress = true }` : export (MJ)       |
| `POST /v1/archives/duplicates`       | `{ campaignId, keepProgress = false }` : duplication (MJ) |
| `POST /v1/archives/imports`          | `{ size }` : tâche `uploading` et URL PUT signée (1 h)    |
| `POST /v1/archives/jobs/:id/start`   | archive envoyée (taille vérifiée) : la tâche part         |
| `GET /v1/archives/jobs`              | le centre : mes 50 dernières tâches                       |
| `GET /v1/archives/jobs/:id/download` | URL de lecture signée (5 min), export prêt et non expiré  |
| `DELETE /v1/archives/jobs/:id`       | efface l'archive et la tâche (pas pendant qu'elle tourne) |

Session seulement (une clé d'API est refusée), 10 tâches par compte et par jour, un export ou
une duplication à la fois par campagne (409 `archive_busy`). Événements : `archive.*_requested`,
`archive.import_started`, `archive.export_ready`, `archive.import_completed`,
`archive.duplicate_completed`, `archive.job_failed`, `archive.job_deleted`, `archive.job_expired`,
`archive.user_erased`.

Ouvrier dans le processus du service (`ARCHIVE_WORKERS`, 1 par défaut), file en base
(`FOR UPDATE SKIP LOCKED`), verrou de 10 min prolongé à chaque avancement ; panne passagère
réessayée 3 fois, erreur de l'archive ou refus d'un service définitif. Entretien toutes les
10 min : archives expirées, envois abandonnés (1 h), échecs de plus de 7 jours. Compte supprimé
(`identity.user_deleted`) : tâches et archives effacées.

## 7. Interface

Page **Sauvegardes** (`/backups`, navigation principale, pleine largeur avec la barre latérale), composants séparés dans
`components/backups/` :

- **En-tête** (`backups-hero`) : titre, chiffres (campagnes de MJ, archives prêtes, espace),
  bouton Importer.
- **Archives** (`archive-card`) : vignette de la campagne, sorte, barre d'avancement animée
  pendant la tâche, puis taille et expiration ou erreur ; Télécharger, Ouvrir, Effacer.
  Rafraîchi toutes les 3 s tant qu'une tâche tourne.
- **Import** (`import-drop`) : zone de dépôt dans la page, et tout l'écran devient cible dès
  qu'un fichier `.yner` y est glissé ; carte d'envoi avec progression.
- **Vos campagnes** (`campaign-backup-card`) : campagnes dont on est MJ en grandes cartes
  illustrées, dernier export, Exporter et Dupliquer.
- **Choix de l'avancement** (`backup-dialog`) : deux grands choix, « Reprendre où on en était »
  ou « Repartir à zéro » (par défaut : le premier pour Exporter, le second pour Dupliquer).
- Raccourcis : réglages du MJ (Exporter, Dupliquer → la page avec la fenêtre ouverte) et
  icône dans l'en-tête de la liste des campagnes.

## 8. Limites et sécurité

- Archive importée = entrée non sûre : zip bombe (taille décompressée bornée par le manifeste
  et contrôlée en lisant), chemins (`files/` seulement, pas de `..`), types de fichiers
  vérifiés comme à l'envoi, HTML des notes nettoyé comme à l'écriture (`notes/html.ts`).
- Système de la campagne : importé tel quel ; une version de système plus récente que celle de
  l'archive passe par la migration d'état existante, une version inconnue est refusée.
- Personnages : le propriétaire importé est toujours celui qui importe.
- Débit : 5 exports et 5 imports par jour et par compte.
- Observabilité : traces de chaque étape, métriques durée et taille (docs/observabilite.md).

## 9. Décisions (Théo, 2026-11-11)

1. **Nouveau service `backend/archive`** : tâches, R2, zip, centre. Il orchestre et assemble ;
   campaign, character et audio sérialisent et importent chacun leurs tables par des routes
   internes. Le travail lourd ne touche pas la latence de la table de jeu.
2. **Personnages des joueurs inclus** dans l'archive du MJ ; à l'import, ils deviennent des PNJ
   de qui importe.
3. **État de jeu au choix à l'export** : case « garder l'avancement » (brouillard découvert,
   jetons posés, mesures), cochée pour Exporter, décochée par défaut pour Dupliquer.

## 10. Lots

| Lot | Contenu                                                                                  | État    |
| --- | ---------------------------------------------------------------------------------------- | ------- |
| 1   | Format : `@vtt/contracts/archive.ts` (manifeste, chemins, fichiers, identifiants), testé | fait    |
| 2   | Instantanés et imports internes de campaign, character, audio (une transaction chacun)   | fait    |
| 3   | Service : tâches, export en flux vers R2, centre (API), expiration                       | fait    |
| 4   | Import : envoi, lecture par plages, validation, tout ou rien ; duplication               | fait    |
| 5   | Interface : boutons des réglages, Profil › Mes exports, import depuis la liste           | fait    |
| 6   | Déploiement (image, rôles, secrets, route de la gateway), staging puis prod              | à faire |
