# API des notes (service campaign)

Le Grimoire de l'ancienne app (`legacy/src/components/Notes.tsx`, `QuickNotes.tsx`) : notes
privées et partagées d'une campagne. Module `backend/campaign/src/modules/notes`, table
`campaign.notes` (changeset `0009-notes.sql`).

Mêmes conventions que [api-campaign.md](api-campaign.md) : jeton d'accès obligatoire, JSON
camelCase, erreurs `application/problem+json` avec un `code`. Campagne dont l'appelant n'est pas
membre : 404 `campaign_not_found` ; note qu'il ne peut pas lire : 404 `note_not_found` (on ne
révèle pas son existence). Chaque note porte un `version` ; `PATCH` accepte `version`
(facultatif) et répond 409 `version_conflict` s'il a changé.

## Données de l'ancienne app

- `Notes/{salle}/{clé}/{id}` : note privée. La clé est l'id du personnage joué (`persoId`), l'UID
  du MJ (qui n'en joue pas), ou l'ancien chemin par nom (`users/{uid}.perso` : `Nomperso`, ou
  « MJ »), que l'app lisait encore.
- `SharedNotes/{salle}/notes/{id}` : note partagée, avec `createdBy` (mêmes clés),
  `createdByName` et `sharedWith` : `'all'` ou ids de personnages de `cartes/{salle}/characters`
  (joueurs seulement ; jamais le MJ, qui n'en joue pas).
- Champs communs : `title`, `content` (HTML tiptap), `type`, `tags [{id, label}]`, `image`,
  `race`, `class`, `region`, `itemType`, `questType` (`principale`/`annexe`), `questStatus`,
  `subQuests [{id, title, description, status}]`, `createdAt`, `updatedAt`.
- Firebase Storage `notes/{salle}/inline/…` : images collées ou insérées dans le texte.

Une note privée devenait partagée par copie dans `SharedNotes` (et suppression de la privée) ; une
note partagée rendue privée par son auteur faisait le chemin inverse, par un autre lecteur elle
était seulement copiée dans ses notes privées. Ici, une note garde son id : seul `shared` change.

## Droits (repris de l'ancienne app)

- **Lecture** : ses propres notes (privées ou partagées), les notes partagées avec tous, et celles
  partagées avec un de ses personnages (dont il est propriétaire ou qu'il incarne).
- **Le MJ n'a aucun droit de plus** : l'ancienne app ne lui montrait ni les notes privées des
  joueurs, ni les notes partagées avec d'autres personnages que les siens. Il lit ses notes et les
  notes partagées avec tous.
- **Note privée** : son auteur seul la lit, la modifie, la partage ou la supprime.
- **Note partagée** : quiconque la lit la modifie (texte, champs, destinataires) ou la supprime,
  comme avant. Seul son auteur la rend privée (403 `not_note_owner` pour les autres, qui en font
  une copie privée par `POST`).
- **Spectateur** : lit les notes partagées avec tous, n'écrit rien (403).
- L'auteur d'une note est l'appelant ; `characterId` est le personnage qu'il incarne à la création
  (legacy : `persoId`), null pour le MJ ou sans personnage incarné.

## Routes

| Méthode | Route                             | Corps                                          | Réponse                                                                 |
| ------- | --------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| GET     | `/v1/campaigns/:id/notes`         | —                                              | `[Note]` lisibles par l'appelant, les plus récemment modifiées d'abord  |
| GET     | `/v1/campaigns/:id/notes/:noteId` | —                                              | `Note`                                                                  |
| POST    | `/v1/campaigns/:id/notes`         | `{ …champs?, shared?, sharedWith? }`           | 201 `Note`                                                              |
| PATCH   | `/v1/campaigns/:id/notes/:noteId` | `{ …champs?, shared?, sharedWith?, version? }` | `Note`                                                                  |
| DELETE  | `/v1/campaigns/:id/notes/:noteId` | —                                              | 204                                                                     |
| POST    | `/v1/campaigns/:id/notes/upload`  | `{ contentType: image/png…, size }` (5 Mo)     | `{ uploadUrl, publicUrl, expiresIn }` : URL présignée, rien n'est écrit |

`Note` : `{ id, owner: { id, name, avatarUrl }, characterId, shared, sharedWith, title, content,
type, tags, imageUrl, race, class, region, itemType, questType, questStatus, subQuests, version,
createdAt, updatedAt }`.

- `sharedWith` : `null` pour une note privée ; `'all'` ou une liste d'ids de personnages engagés
  dans la campagne (1 à 100, 400 `invalid_share_target` sinon) pour une note partagée. Partager
  sans destinataires vaut `'all'`, comme l'ancienne app ; `sharedWith` sur une note privée : 400
  `share_requires_shared`. Rendre une note privée efface ses destinataires.
- `type` : `character`, `location`, `item`, `quest`, `journal`, `other` (défaut ; les anciennes
  notes sans type l'ont reçu). `race`/`class` (personnage), `region` (lieu), `itemType` (objet) :
  200 caractères, `null` si vides.
- `questType` : `main` (legacy `principale`) ou `side` (`annexe`) ; `questStatus` et le `status`
  des étapes : `not_started`, `in_progress`, `completed` (legacy avec des tirets).
- `subQuests` : `[{ id, title, description, status }]` (100 au plus) ; `tags` : `[{ id, label }]`
  (50 au plus).
- `title` : 200 caractères (vide permis : « Sans titre ») ; `content` : HTML de l'éditeur, 200 000
  caractères. **Le serveur ne nettoie pas ce HTML** : l'ancienne app l'affichait par
  `dangerouslySetInnerHTML` ; le front doit le passer à un assainisseur (DOMPurify) avant de
  l'afficher, une note partagée étant écrite par un autre joueur.
- `imageUrl` (image d'en-tête des cartes du Grimoire) : URL https, chemin absolu du site, ou
  fichier de notre stockage. Images du texte et d'en-tête : `POST …/notes/upload` (membres non
  spectateurs, 20 par minute), `PUT` du fichier sur `uploadUrl`, puis `publicUrl` dans la note.
  Comme l'image de campagne, un fichier retiré d'une note n'est pas supprimé du stockage.

## Événements

`note.created`, `note.updated`, `note.deleted` (agrégat `note`), écrits dans l'outbox dans la
transaction de la donnée. Acteur : l'appelant et le personnage qu'il incarne.

**Jamais de texte** : le journal history est en ajout seul, il ne doit pas figer le contenu
personnel d'une note. Le payload porte seulement `{ id, ownerId, characterId, shared, sharedWith }`,
`changed` (noms des champs modifiés, sans leurs valeurs : `['content', 'tags']`) pour
`note.updated`, et `title` quand la note est partagée avec tous (l'ancienne app publiait déjà
« X a partagé une note : [titre] »). Pas de `changes` avant/après ([bus.md](bus.md)) : ses valeurs
seraient le texte. Les clients relisent la note par `GET` à réception de l'événement.

Visibilité, calculée sur l'état avant **et** après (qui perd l'accès doit l'apprendre) :

| Note (avant ou après)                | Visibilité                                                   | `title` |
| ------------------------------------ | ------------------------------------------------------------ | ------- |
| partagée avec tous                   | `public`                                                     | oui     |
| sinon, partagée avec des personnages | `gm_only` + `visibleToUsers` : leurs joueurs, auteur, acteur | non     |
| sinon, privée                        | `owner` (l'auteur, seul à agir sur sa note privée)           | non     |

- `gm_only` est le seul moyen de toucher en temps réel les joueurs destinataires : le MJ reçoit
  donc l'id et le partage d'une note ciblée, jamais son titre ni son texte.
- `owner` : history montre aussi ces événements au MJ ([api-history.md](api-history.md)) ; c'est
  pourquoi une note privée n'y met pas même son titre.

Import : un `note.imported` par campagne (acteur système, `gm_only`), payload
`{ counts: { private, shared } }`.

## Import

Sous-commande `notes` du CLI d'import de campaign, après les comptes, les personnages et les
campagnes (`infra/local/import-campaigns.sh` l'enchaîne, avec l'export de `Notes` et
`SharedNotes`) :

```sh
node --env-file=backend/campaign/.env backend/campaign/dist/import/cli.js notes \
  --export ~/vtt-export --report ~/vtt-export/rapport-notes.ndjson [--importer]
```

- Simulation par défaut ; `--importer` écrit. Variables : `DATABASE_URL` (campaign_svc),
  `CHARACTER_DATABASE_URL` et `IDENTITY_DATABASE_URL` (lecture), `S3_*` (images).
- Rejouable : id = UUID v5 du chemin legacy, `ON CONFLICT DO NOTHING` ; une note déjà importée
  n'est jamais écrasée.
- Auteur d'une clé (chemin d'une note privée, `createdBy` d'une partagée) : « MJ » → le MJ
  propriétaire ; id de personnage → le joueur dont c'est le `persoId`, sinon celui qui l'incarne,
  sinon son propriétaire (et le personnage s'il est engagé) ; UID → son compte ; ancien nom →
  le personnage de ce nom (joueurs d'abord, `users.perso` pour départager). Introuvable : note
  privée ignorée, note partagée attribuée au MJ (avertissement). Une même note lue sous l'id et
  sous l'ancien nom n'est importée qu'une fois, comme l'app ne l'affichait qu'une fois.
- Destinataires : personnages engagés seulement ; les autres sont retirés (avertissement).
- Images `data:` et Firebase Storage (en-tête et `src` du texte) rapatriées dans
  `campaigns/imported/notes/` ; une image `data:` non rapatriée est retirée.
- Sortie : compteurs seuls ; rapport par campagne (0600) sans titre ni texte de note.
- Salle sans campagne importée : ses notes sont comptées et ignorées (`no-campaign`).

## Pour le front

- Remplacer les lectures Firestore de `Notes.tsx` (`loadNotes`) par `GET …/notes` : le filtrage par
  destinataire est fait par le serveur ; les onglets (« Mes notes » : `owner.id` = moi ;
  « Partagées » : `shared` et pas à moi), la recherche et le filtre par type restent côté client.
- `handleSave` : `POST` (nouvelle), `PATCH` (modification, partage, retour en privé par l'auteur) ;
  un lecteur non auteur qui rend une note partagée privée fait un `POST` de la copie.
  `handleQuickShare` : `PATCH { shared: true }`. `QuickNotes` : `POST { title, content, type }`.
- « Par {createdByName} » : nom du personnage `characterId` (service character), sinon `owner.name`.
- Choix des destinataires : personnages engagés côté joueurs (`side: 'players'`), sauf les siens.
- Mettre à jour la liste à réception de `note.*` (temps réel), l'événement ne portant pas le texte.
