# API des notes (service campaign)

Le Grimoire de l'ancienne app (`legacy/src/components/Notes.tsx`, `QuickNotes.tsx`) et l'espace
Notes du front : notes **d'une campagne**, privées ou partagées. Module
`backend/campaign/src/modules/notes`, table `campaign.notes` et épingles `campaign.note_pins`
(changesets `0009-notes.sql`, `0012-personal-notes.sql`, `0013-notes-search.sql`,
`0014-notes-campaign-required.sql`). La gateway relaie `/v1/notes` et `/v1/campaigns` vers
campaign.

Mêmes conventions que [api-campaign.md](api-campaign.md) : jeton d'accès obligatoire, JSON
camelCase, erreurs `application/problem+json` avec un `code`. Campagne dont l'appelant n'est pas
membre : 404 `campaign_not_found` ; note qu'il ne peut pas lire : 404 `note_not_found` (on ne
révèle pas son existence).

## Modèle retenu

- **Une note appartient toujours à une campagne** (`campaign_id NOT NULL`) : c'est une décision
  produit. `0012` avait ouvert des notes personnelles (sans campagne) ; `0014` les retire (les
  seules existantes étaient des données de test) et remet la contrainte. Une note peut changer de
  campagne (`PATCH /v1/notes/:id { campaignId }`, l'auteur seul) en gardant son id.
- **`/v1/notes`** sert l'espace Notes : toutes mes notes, **toutes campagnes confondues**, en une
  liste triée et paginée, la lecture d'une note sans connaître sa campagne (liens `?note=<id>`),
  sa modification et son déplacement. On crée une note par la route de sa campagne.
- **Champs de l'UI ajoutés** : `icon` (un emoji), `sharedWithGm` (partage avec les MJ), épingles.
  Le type (`other`, `journal`…), les étiquettes `[{ id, label }]` et les champs de l'ancien
  Grimoire (race, classe, région, type d'objet, quête et étapes, image d'en-tête) existaient déjà :
  l'UI les affiche et les modifie.
- **Épingles par lecteur** (`note_pins`) : épingler une note partagée ne l'épingle pas pour les
  autres. Ce n'est pas une modification de la note : ni version, ni date, ni `note.updated`.
- **Contenu en HTML**, pas en JSON TipTap : les notes importées de Firebase sont du HTML de
  TipTap, l'éditeur lit et produit du HTML, et un seul format évite une conversion (et ses pertes)
  à la reprise. Le HTML est **assaini par le service à chaque écriture** (voir Contenu), ce que la
  validation d'un JSON TipTap par schéma aurait apporté, sans second format à maintenir.

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

- **Lecture**, dans une campagne dont on est membre : ses propres notes (privées ou partagées), les notes partagées avec tous, celles partagées avec un de ses
  personnages (dont il est propriétaire ou qu'il incarne), et, pour un MJ, celles partagées avec
  les MJ (`sharedWithGm`).
- **Le MJ n'a aucun droit de plus** : l'ancienne app ne lui montrait ni les notes privées des
  joueurs, ni les notes partagées avec d'autres personnages que les siens. Partager avec le MJ est
  un choix de l'auteur.
- **Note privée** : son auteur seul la lit, la modifie, la partage ou la supprime.
- **Note partagée** : quiconque la lit la modifie (texte, champs, destinataires) ou la supprime,
  comme avant. Seul son auteur la rend privée (403 `not_note_owner` pour les autres, qui en font
  une copie par `POST`) ou la change de campagne.
- **Spectateur** : lit les notes partagées avec tous, n'écrit rien (403), mais épingle pour lui.
- L'auteur d'une note est l'appelant ; `characterId` est le personnage qu'il incarne dans la
  campagne à la création ou au changement de campagne (legacy : `persoId`), null pour le MJ ou
  sans personnage incarné.
- Chaque note porte `permissions: { edit, delete, share, move }` calculé par le service pour
  l'appelant (`share` : changer la visibilité ; `move` : changer de campagne) : le front s'y fie
  au lieu de recalculer les règles.
- Quota : 5 000 notes par auteur (403 `note_quota_exceeded`).

## Routes

| Méthode | Route                             | Corps / paramètres                               | Réponse                                  |
| ------- | --------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| GET     | `/v1/notes`                       | `?campaignId&type&pinned&q&limit&cursor`         | `NotePage` : mes notes, toutes campagnes |
| GET     | `/v1/notes/facets`                | —                                                | `NoteFacets`                             |
| GET     | `/v1/notes/:noteId`               | —                                                | `Note`                                   |
| PATCH   | `/v1/notes/:noteId`               | `{ campaignId?, …champs?, …partage?, version? }` | `Note`                                   |
| DELETE  | `/v1/notes/:noteId`               | —                                                | 204                                      |
| PUT     | `/v1/notes/:noteId/pin`           | —                                                | 204 (épinglée pour moi)                  |
| DELETE  | `/v1/notes/:noteId/pin`           | —                                                | 204                                      |
| GET     | `/v1/campaigns/:id/notes`         | mêmes paramètres, sans `campaignId`              | `NotePage` de la campagne                |
| GET     | `/v1/campaigns/:id/notes/:noteId` | —                                                | `Note`                                   |
| POST    | `/v1/campaigns/:id/notes`         | `{ …champs?, …partage? }`                        | 201 `Note` (seule route de création)     |
| PATCH   | `/v1/campaigns/:id/notes/:noteId` | `{ …champs?, …partage?, version? }`              | `Note`                                   |
| DELETE  | `/v1/campaigns/:id/notes/:noteId` | —                                                | 204                                      |
| POST    | `/v1/campaigns/:id/notes/upload`  | `{ contentType: image/png…, size }` (5 Mo)       | `{ uploadUrl, publicUrl, expiresIn }`    |

Les routes `/v1/campaigns/:id/notes…` sont celles d'origine (même comportement, mêmes champs) ;
elles ne changent pas une note de campagne (`campaignId` : 400). **Changement de contrat** : leur liste renvoie
désormais une `NotePage` paginée (aucun client ne la lisait encore).

- **Champs** : `title` (200 caractères, vide permis : « Sans titre »), `content` (HTML),
  `icon` (un emoji ou null), `type` (`character`, `location`, `item`, `quest`, `journal`, `other`),
  `tags` `[{ id, label }]` (50, ids distincts), `imageUrl`, `race`, `class`, `region`, `itemType`
  (200 caractères, null si vides), `questType` (`main`/`side`), `questStatus` et `status` des
  étapes (`not_started`, `in_progress`, `completed`), `subQuests` `[{ id, title, description,
status }]` (100). Champ inconnu : 400.
- **Partage** : `shared`, `sharedWith` (`'all'` ou ids de personnages engagés, 0 à 100 ; 400
  `invalid_share_target` sinon), `sharedWithGm`. Partager sans destinataires vaut `'all'` (ancienne
  app) ; `sharedWithGm` seul (`sharedWith: []`) : les MJ seulement ; partagée avec tous, elle l'est
  avec les MJ (`sharedWithGm` faux). Sans destinataire du tout : 400 `invalid_share_target`.
  `sharedWith` ou `sharedWithGm` sur une note privée : 400 `share_requires_shared`. Rendre privée
  efface les destinataires.
- **Changer de campagne** (`campaignId`, jamais null) : l'auteur seul, vers une campagne où il
  écrit ; la note y repart **privée** sauf partage donné dans la même requête (ses
  destinataires n'ont pas de sens ailleurs).
- **Verrou optimiste** : `version` (facultatif) ; différente de celle de la note : 409
  `version_conflict`, rien n'est écrit. Une requête qui ne change rien n'écrit rien (ni version, ni
  événement).
- Images du texte et d'en-tête : `POST …/notes/upload` (membres non spectateurs, 20 par minute),
  `PUT` du fichier sur `uploadUrl`, puis `publicUrl` dans la note. Un fichier retiré d'une note
  n'est pas supprimé du stockage.

### Représentations

`Note` : `{ id, campaignId, owner: { id, name, avatarUrl }, characterId, shared, sharedWith,
sharedWithGm, title, icon, content, type, tags, imageUrl, race, class, region, itemType,
questType, questStatus, subQuests, pinned, permissions, version, createdAt, updatedAt }`.

`NoteSummary` (listes) : comme `Note` sans `content` ni champs du Grimoire, avec `excerpt` :
l'aperçu (texte sans les intertitres, 280 caractères), ou, avec `q`, un extrait centré sur le
premier terme trouvé, coupé aux mots, avec « … » aux bords coupés.

`NotePage` : `{ items: [NoteSummary], nextCursor, total }` ; `total` (notes correspondant aux
filtres) sur la première page seulement, null ensuite.

`NoteFacets` : `{ total, pinned, types: { character: n, … }, campaigns: [{ campaignId, count }],
tags: [{ label, count }] }` sur toutes mes notes lisibles (les 200 étiquettes les plus
utilisées).

## Contenu : HTML assaini

- **Service** (`html.ts`) : liste blanche et **réécriture complète**. Le HTML est lu par un
  analyseur tolérant puis réécrit à neuf : seules sortent les balises de l'éditeur (`p`, `h1`–`h6`,
  `blockquote`, `pre`, `code`, `ul`, `ol`, `li`, `hr`, `br`, `strong`, `em`, `s`, `u`, `a`, `img` ;
  `b`/`i`/`strike`/`del` renommées), avec des attributs validés et réencodés : `href` en http(s),
  `mailto:`, `tel:`, chemin du site ou ancre (entités décodées, blancs et contrôles retirés avant la
  vérification) avec `target="_blank" rel="noopener noreferrer nofollow"` ; `src` d'image en https,
  chemin du site ou fichier de notre stockage ; `width` ; `style` réduit à `text-align` ; `class`
  `language-*` du code ; `start` des listes. Scripts, styles, iframes, SVG, MathML, templates,
  commentaires et leur contenu disparaissent ; le texte est réencodé. Le navigateur ne relit donc
  que ce que le service a écrit : une divergence d'analyse peut déformer du texte, jamais faire
  passer une balise. Pas de dépendance (le service n'embarque ni DOM ni analyseur HTML).
- Le HTML réécrit dépasse 200 000 caractères : 400 `content_too_long`.
- **Notes importées** (`sanitizer_version` 0) : réassainies par le service au démarrage puis
  toutes les 10 minutes (`backfill.ts`, par lots, `FOR UPDATE SKIP LOCKED`), sans nouvelle version
  ni événement ; en attendant, elles sont assainies à la volée à chaque lecture. Monter
  `SANITIZER_VERSION` fait tout reprendre.
- **Front** : le HTML repasse par DOMPurify (même liste) avant d'entrer dans l'éditeur ; aucun
  `dangerouslySetInnerHTML`. L'éditeur affiche les images et l'alignement de l'ancien éditeur ; les
  intertitres de niveau 4 à 6 y deviennent de niveau 3.

## Limites

| Champ             | Limite                                        |
| ----------------- | --------------------------------------------- |
| `title`           | 200 caractères                                |
| `content`         | 200 000 caractères, avant et après réécriture |
| `icon`            | un emoji (un graphème), 32 caractères         |
| `tags`            | 50, libellés de 100 caractères                |
| détails (`race`…) | 200 caractères                                |
| `subQuests`       | 100 ; titre 500, description 5 000            |
| `sharedWith`      | 100 personnages                               |
| `q`               | 200 caractères, 10 termes                     |
| `limit`           | 1 à 100 (50 par défaut)                       |
| notes par auteur  | 5 000                                         |

## Recherche plein texte

- `q` : chaque terme (lettres et chiffres) doit figurer, **par préfixe**, dans le titre, les
  étiquettes, les détails, les titres d'étapes ou le texte.
- Le service calcule à l'écriture `search_text`, forme **sans accents ni ligatures** en minuscules
  (« Épée » ⇄ « epee », « œuvre » ⇄ « oeuvre ») ; la requête reçoit la même forme. Pas d'extension
  `unaccent` requise en base.
- Colonne générée `search = to_tsvector('french', search_text) || to_tsvector('simple',
search_text)`, index GIN ; chaque terme est cherché dans les deux (`french` : racines, « cheval »
  trouve « chevaux » ; `simple` : mots vides gardés, « la » trouve « la légende » dès la frappe).
- Les résultats gardent l'ordre des listes (épinglées puis récentes) : l'espace Notes les groupe par
  date.

## Pagination

Curseur opaque (`nextCursor`), ordre : épinglées par l'appelant d'abord, puis `updated_at`
décroissant (à la microseconde) et id. Stable pendant le parcours, sans doublon ; curseur invalide :
400 `invalid_cursor`.

## Événements

`note.created`, `note.updated`, `note.deleted` (agrégat `note`), écrits dans l'outbox dans la
transaction de la donnée, toujours dans la campagne de la note (`roomId`). Acteur : l'appelant
et le personnage qu'il incarne.

**Jamais de texte** : le journal history est en ajout seul, il ne doit pas figer le contenu
personnel d'une note. Le payload porte seulement `{ id, ownerId, campaignId, characterId, shared,
sharedWith, sharedWithGm, version }`, `changed` (noms des champs modifiés, sans leurs valeurs :
`['content', 'tags']`) pour `note.updated`, et `title` quand la note est partagée avec toute la
campagne de l'événement (l'ancienne app publiait déjà « X a partagé une note : [titre] »). Pas de
`changes` avant/après ([bus.md](bus.md)) : ses valeurs seraient le texte. Les clients relisent la
note par `GET` à réception (sauf s'ils ont déjà cette `version` : leur propre écriture).

Visibilité, calculée sur l'état avant **et** après dans la campagne de l'événement (qui perd
l'accès doit l'apprendre) :

| Note (avant ou après)                          | Visibilité                                                   | `title` |
| ---------------------------------------------- | ------------------------------------------------------------ | ------- |
| partagée avec tous                             | `public`                                                     | oui     |
| sinon, partagée avec des personnages ou les MJ | `gm_only` + `visibleToUsers` : leurs joueurs, auteur, acteur | non     |
| sinon, privée                                  | `owner` (l'auteur, seul à agir sur sa note privée)           | non     |

- `gm_only` est le seul moyen de toucher en temps réel les joueurs destinataires : le MJ reçoit
  donc l'id et le partage d'une note ciblée, jamais son titre ni son texte.
- `owner` : history montre aussi ces événements au MJ ([api-history.md](api-history.md)) ; c'est
  pourquoi une note privée n'y met pas même son titre.
- Changement de campagne : un `note.updated` dans l'ancienne et un dans la nouvelle, chacun avec
  la visibilité de son côté.
- Épingles : `note.pinned` et `note.unpinned`, payload `{ id }`, `owner`, hors campagne
  (`roomId` null) : c'est une préférence de l'utilisateur, pas un fait de la campagne (history la
  montrerait sinon au MJ) ; elle sert à ses autres onglets.

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

## Côté front

`frontend/src/lib/notes.ts` : adaptateur typé de ce contrat (types, étiquettes, visibilité
`private`/`gm`/`room`/`characters`), sans dépôt local.

- Espace Notes : notes **groupées par campagne** (épinglées en tête de chacune), pages par curseur
  (défilement), recherche et filtres envoyés au service, compteurs et suggestions d'étiquettes par
  les facettes ; lien `?note=<id>`.
- Création : la campagne est imposée (`?nouvelle=1&campagne=<id>` depuis le salon, filtre de
  campagne actif, seule campagne où l'on écrit) ou choisie dans une fenêtre ; sans campagne où
  écrire, invitation à en rejoindre une. `POST /v1/campaigns/:id/notes`.
- Enregistrement automatique avec la `version` de la saisie ; 409 : la note est relue et affichée,
  rien n'est écrasé, et l'utilisateur choisit (réappliquer ses modifications, en faire une copie,
  les abandonner).
- Mises à jour optimistes (note, listes, épingles, suppression) annulées sur un refus.
- Temps réel : `note.*` des campagnes suivies et épingles (événements personnels) ; la note
  ouverte adopte en direct une version plus récente quand rien n'est en attente.
- Les notes de l'aperçu local (navigateur) s'importent d'un clic (celles sans campagne dans la
  campagne choisie) et ne quittent le navigateur qu'une fois recréées par le service.
