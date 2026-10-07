# Progression du compte : expérience, niveaux, défis

> Chantier ouvert le 2026-10-07 (branche `feat/account-progression`). Ce document fait foi ; le
> code de `backend/identity/src/modules/progression` et du front le suit. Il s'agit du **compte du
> joueur**, jamais des personnages (dont le niveau relève du système de jeu).

## 1. Objectif

Récompenser l'activité réelle sur Yner et guider un nouveau joueur vers ce qui rend l'app utile :

- de l'**expérience (XP)** gagnée en jouant (jets, séances, messages, campagnes menées,
  personnages, amis, temps de jeu), avec des plafonds contre l'abus ;
- des **niveaux** sur une courbe, avec des **récompenses** aux paliers (titres, bordures de
  profil) ;
- une **montée de niveau guidée** : niveau, progression et prochaines étapes concrètes ;
- des **défis** quotidiens et hebdomadaires tournants, et des défis permanents.

Aucune monnaie, rien d'achetable : l'XP ne s'achète pas, ne se dépense pas, ne baisse jamais.

## 2. Architecture

```
services (dice, campaign, character, identity)
   └─ outbox ─► bus vtt.> ─► identity : consommateur durable identity-progression
                                 │  (une transaction par événement, inbox comprise)
                                 ├─ activités (activities.ts, fonction pure de l'enveloppe)
                                 ├─ règles d'XP et plafonds (rules.ts, table déclarative)
                                 ├─ défis (challenges.ts, rotation déterministe)
                                 ├─ niveaux et récompenses (levels.ts)
                                 └─ outbox identity : identity.level_reached,
                                    identity.challenge_completed, identity.title_unlocked
                                       └─► realtime (room user:<id>) ─► notification du front
```

- **Un consommateur à part** (`identity-progression`), à côté de `identity-titles` : chacun sa
  durable, ses sujets et son inbox. Les titres à compteurs restent où ils sont.
- L'inbox d'identity avait `event_id` pour seule clé : deux consommateurs ne pouvaient pas
  enregistrer le même événement. La clé devient `(consumer, event_id)` (migration 0015).
- Tout passe par le bus, y compris les événements d'identity elle-même (temps de jeu, amis,
  profil) : une seule porte d'entrée, idempotente, rejouable, testée de la même façon.
- Aucune route d'écriture : la progression n'est écrite que par le consommateur et par la reprise
  de l'existant (§ 9). Le garde-fou `event-guard.test.ts` n'est pas concerné.
- Les jours et les semaines sont ceux de **Paris** (`Europe/Paris`), calculés à partir de
  `occurredAt` de l'événement : un rejeu tardif compte pour le jour où l'action a eu lieu.

## 3. Activités et règles d'XP

Une **activité** est un fait déduit d'un événement du bus pour un joueur. `activities.ts` est une
fonction pure (enveloppe → activités), `rules.ts` la table déclarative des gains.

| Activité            | Événement source                                                               | XP / unité | Plafond / jour | Clé d'unicité         |
| ------------------- | ------------------------------------------------------------------------------ | ---------- | -------------- | --------------------- |
| `dice_roll`         | `dice.rolled`, source `3d`, `mixed`, `free`, `action` (campagne ou personnel)  | 2          | 40             | —                     |
| `chat_message`      | `campaign.message_posted` (auteur)                                             | 1          | 20             | —                     |
| `session_played`    | premier jet ou message du joueur dans une campagne, dans la journée            | 40         | 80             | `campagne:jour`       |
| `play_minutes`      | `identity.play_time_added` (1 unité = 1 minute)                                | 1          | 30             | —                     |
| `character_created` | `character.created` d'un joueur (ni PNJ, ni import)                            | 30         | 60             | —                     |
| `campaign_created`  | `campaign.created` (le MJ ; pas l'import)                                      | 50         | 50             | —                     |
| `campaign_joined`   | `campaign.member_joined` (le joueur qui rejoint)                               | 30         | 60             | id de campagne, à vie |
| `session_scheduled` | `campaign.session_scheduled` (le MJ)                                           | 20         | 40             | —                     |
| `note_written`      | `note.created` (l'auteur)                                                      | 5          | 20             | —                     |
| `friend_added`      | `identity.friend_request_accepted` (les deux amis)                             | 25         | 75             | l'autre joueur, à vie |
| `profile_completed` | `identity.profile_updated`, si le profil a un avatar ou une bio (relu en base) | 50         | —              | une fois à vie        |

- **Unité et XP sont séparées** : au-delà du plafond, l'activité compte encore pour les défis
  (unités), elle ne rapporte plus d'XP ce jour-là.
- **Clé d'unicité** : une activité déjà vue avec la même clé est ignorée entièrement (ni unité ni
  XP). Elle empêche de quitter et rejoindre une campagne, ou de retirer puis rajouter un ami, pour
  regagner l'XP ; elle fait d'une journée dans une campagne une seule séance.
- **Une seule attribution par événement** : l'id de l'événement entre dans `identity.inbox`
  (consommateur `identity-progression`) dans la transaction qui écrit l'XP. Une relivraison est
  reconnue et ignorée.
- Jets `import` (historique Firebase) et `api` (clé d'API) : rien, comme pour les titres. Jets
  cachés et privés : comptés.
- Événements d'un compte inconnu d'identity (supprimé) : consommés sans effet.
- Le temps de jeu est envoyé par le front toutes les 5 minutes d'onglet visible (§ 8.4).

## 4. Niveaux

XP pour passer du niveau `n` au niveau `n + 1` : `100 + 50 × (n − 1)`. XP cumulée pour atteindre
le niveau `L` : `100 (L − 1) + 25 (L − 1)(L − 2)`. Pas de niveau maximal.

| Niveau | XP cumulée | Ordre de grandeur (joueur d'une séance par semaine, ~500 XP) |
| ------ | ---------- | ------------------------------------------------------------ |
| 2      | 100        | premiers pas                                                 |
| 5      | 700        | première semaine                                             |
| 10     | 2 700      | ~5 semaines                                                  |
| 20     | 10 450     | ~5 mois                                                      |
| 30     | 23 200     | ~1 an                                                        |
| 50     | 63 700     | plusieurs années                                             |

`account_progress` garde l'XP et le niveau. Le niveau est recalculé depuis l'XP à chaque gain ; un
passage de niveau (plusieurs à la fois si un gain est gros) écrit un seul `identity.level_reached`.

## 5. Récompenses

| Niveau | Récompense                                          |
| ------ | --------------------------------------------------- |
| 3      | bordure de profil **Azur** (`blue`)                 |
| 5      | titre **Aventurier Confirmé**                       |
| 8      | bordure **Ambre** (`orange`)                        |
| 10     | titre **Héros Accompli**                            |
| 15     | bordure **Arcane verte** (`magic_green`)            |
| 20     | titre **Légende Vivante**                           |
| 25     | bordure **Arcane rouge** (`magic_red`)              |
| 30     | titre **Pilier de la Table** (nouveau au catalogue) |
| 40     | bordure **Double arcane** (`magic_double`)          |
| 50     | titre **Mythe Vivant** (nouveau au catalogue)       |

- Les trois premiers titres existaient au catalogue (« Atteindre le niveau 5 / 10 / 20 ») sans
  aucune source depuis l'ancienne app : la progression les débloque enfin.
- Titres : débloqués par `unlockTitleInTx` dans la transaction du passage de niveau (événement
  `identity.title_unlocked`, `source: 'level'`).
- Bordures : rien n'est stocké, une bordure est acquise dès que le niveau la contient (l'XP ne
  baisse jamais). Le premium garde l'accès à toutes les bordures ; les bordures « Lueur »,
  « Aurore », « Solaire », « Crépuscule » et « Arcane violette » restent réservées au premium.
- **Contrôle côté serveur** : `PATCH /v1/users/me` refuse désormais (403 `border_locked`) une
  bordure ni `none`, ni déjà portée, ni acquise par le niveau, ni couverte par le premium. Jusqu'ici
  la règle « bordures réservées au premium » n'était tenue que par l'écran.
- Skins de dés et cadres de jetons : pas en récompense pour l'instant (ils vivent dans billing ;
  il faudrait un consommateur de `identity.level_reached` côté billing, source `progression`).

## 6. Défis

Définis dans le code (`challenges.ts`), comme le catalogue des titres. Un défi porte une ou
plusieurs activités, une cible en unités et une récompense en XP.

### Quotidiens (3 par jour) et hebdomadaires (2 par semaine)

- **Rotation déterministe par joueur** : tri des défis du lot par `fnv1a(userId:période:id)`, puis
  on garde les premiers d'activités différentes. Rien à stocker pour savoir quels défis sont actifs,
  le même calcul sert au consommateur et à l'écran ; chaque joueur a sa propre sélection.
- Période : `AAAA-MM-JJ` (jour de Paris) ou `AAAA-Www` (semaine ISO, lundi). Fin de période : minuit
  à Paris.
- Progression : somme des unités du jour (ou des jours de la semaine) dans `progression_daily`.
- Modifier un lot change la sélection de la période en cours : à faire en début de semaine.

| Quotidien             | Activité         | Cible | XP  |
| --------------------- | ---------------- | ----- | --- |
| Lancer 10 jets de dés | `dice_roll`      | 10    | 20  |
| Lancer 25 jets de dés | `dice_roll`      | 25    | 35  |
| Envoyer 5 messages    | `chat_message`   | 5     | 15  |
| Envoyer 15 messages   | `chat_message`   | 15    | 25  |
| Jouer une séance      | `session_played` | 1     | 30  |
| Jouer 30 minutes      | `play_minutes`   | 30    | 20  |
| Écrire une note       | `note_written`   | 1     | 15  |

| Hebdomadaire           | Activité         | Cible | XP  |
| ---------------------- | ---------------- | ----- | --- |
| Jouer 2 séances        | `session_played` | 2     | 80  |
| Lancer 100 jets de dés | `dice_roll`      | 100   | 60  |
| Envoyer 50 messages    | `chat_message`   | 50    | 50  |
| Jouer 3 heures         | `play_minutes`   | 180   | 60  |
| Écrire 5 notes         | `note_written`   | 5     | 40  |
| Ajouter un ami         | `friend_added`   | 1     | 40  |

### Permanents

Progression : compteurs à vie (`progression_counters`). Deux familles :

- **Premiers pas** (ordonnés, ils forment le parcours guidé) : compléter son profil (50), créer
  son premier personnage (50), créer ou rejoindre une campagne (50), lancer ses premiers dés (25),
  jouer sa première séance (50), ajouter un ami (50).
- **Jalons** : 100 et 1 000 jets (100, 300), 10 et 50 séances (150, 400), 3 campagnes créées comme
  MJ (150), 5 séances planifiées (100), 5 personnages (100), 5 amis (100), 500 messages (150),
  10 et 50 heures de jeu (150, 400), 25 notes (100).

Un défi accompli écrit une ligne `progression_challenges` (clé `user, défi, période` : une seule
récompense), donne son XP (hors plafonds d'activité) et écrit `identity.challenge_completed`.

## 7. Montée de niveau guidée

`GET /v1/users/me/progression` renvoie les **prochaines étapes** (3 au plus) :

1. les Premiers pas non faits, dans l'ordre ;
2. une fois tous faits, les jalons les plus avancés (part de la cible atteinte), puis les autres.

Chaque étape porte son lien d'action dans le front (créer un personnage, rejoindre une campagne,
ajouter un ami…). La prochaine récompense de niveau est donnée à part.

## 8. API, événements, interface

### 8.1 API (identity, derrière `/v1/users` de la gateway)

| Route                                  | Contenu                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /v1/users/me/progression`         | niveau, XP, bornes du niveau, paliers et récompenses, défis actifs, étapes, fins de période |
| `GET /v1/users/me/progression/history` | détail par jour (90 jours), compteurs à vie, défis accomplis : sert à l'export              |
| `GET /v1/users/:id` (existant)         | `level` ajouté au profil public                                                             |
| `PATCH /v1/users/me` (existant)        | bordure contrôlée (§ 5)                                                                     |

### 8.2 Événements

| Type                           | Charge utile                                            | Visibilité |
| ------------------------------ | ------------------------------------------------------- | ---------- |
| `identity.level_reached`       | `{ level, previousLevel, xp, rewards: [{ type, id }] }` | `owner`    |
| `identity.challenge_completed` | `{ challengeId, kind, period, xp }`                     | `owner`    |
| `identity.title_unlocked`      | existant ; `source: 'level'` pour un titre de palier    | `owner`    |

Sujet `vtt.global.identity.*`, acteur le joueur, agrégat `user`. Pour un événement causé par le
bus, `correlationId` et `traceparent` sont ceux de la source, `causationId` son id. Aucun texte
libre ni donnée personnelle : des identifiants et des nombres. Pas d'événement par gain d'XP (un
par jet doublerait le trafic du bus pour rien).

### 8.3 Interface

- **Profil** : carte « Progression » (niveau, barre d'XP, paliers, défis par onglets Quotidiens,
  Hebdomadaires, Permanents). Bordures acquises débloquées dans la carte « Apparence ».
- **Profil public** : pastille de niveau à côté du nom.
- **Accueil** : résumé (niveau, barre, prochaines étapes, défis du jour). Il remplace le bloc
  « Premiers pas » calculé dans le navigateur, dont les étapes deviennent les Premiers pas du
  serveur.
- **Notifications** : un toast sobre au passage de niveau (avec la récompense) et à un défi
  accompli, sur toutes les pages connectées (événements personnels du temps réel) ; la
  progression affichée est relue à cette occasion.
- Aucun texte d'aide visible : les règles (plafonds, période) sont en infobulle.

### 8.4 Temps de jeu (rétabli)

L'ancienne app comptait le temps passé connecté (`TimeTracker.tsx` : une minute par minute,
envoi toutes les 5 minutes). Le nouveau front ne l'envoyait plus : les titres de temps de jeu
étaient figés. Rétabli dans le front (toutes les pages connectées) : une minute comptée par minute
d'onglet visible, envoi par lots de 5 (et du reste quand l'onglet est masqué), vers
`POST /v1/users/me/time` existant.

## 9. Niveaux d'avant et reprise de l'existant

### Niveau d'avant (automatique)

Décidé avec Théo le 2026-10-07 : **chaque compte démarre à son niveau de l'ancienne app**, sans
commande à lancer.

- L'ancienne app calculait le niveau du compte par le temps de jeu : **un niveau toutes les 2 h**
  (`niveau = minutes ÷ 120 + 1`, `legacy/src/components/ui/profile-card.tsx`). Ces minutes sont
  en base (`profiles.time_spent_minutes`, importées de l'ancienne app) :
  `legacyLevelForMinutes` (`levels.ts`).
- La ligne `account_progress` d'un joueur est créée au premier besoin (premier événement ou premier
  affichage de sa progression, `ensureProgress`) avec ce niveau et l'XP qui y mène dans la
  nouvelle courbe (`xpForLevel`). Un compte importé plus tard de l'ancienne app (à sa première
  connexion) en profite de la même façon.
- Les titres des paliers déjà atteints sont débloqués (`identity.title_unlocked`, source
  `level`), sans `identity.level_reached` : ce n'est pas une montée de niveau.
- Un joueur qui a déjà joué (niveau d'avant 2 ou plus, soit 2 h de jeu) a ses **Premiers pas**
  tenus pour faits (sans XP ni notification) : on ne propose pas « Créer votre premier
  personnage » à un habitué.
- Le profil public montre le niveau d'avant même avant la création de la ligne (`levelOf`).
- Ensuite, le joueur progresse avec l'XP et les défis (§ 3 à § 6) ; le niveau ne baisse jamais.

### Reprise des compteurs (facultative)

Une commande d'exploitation relève les compteurs à vie depuis les autres services, pour que les
défis permanents (« 100 jets », « 10 séances »…) tiennent compte du passé. **Elle n'est pas
nécessaire au déploiement** : sans elle, ces compteurs partent du déploiement ; le niveau, lui,
part toujours du niveau d'avant.

```sh
BACKFILL_SOURCE_URL=postgres://… DATABASE_URL=postgres://identity_svc:… \
  pnpm --filter @vtt/identity progression:backfill [--dry-run] [--user <uuid>]
```

- `BACKFILL_SOURCE_URL` : un rôle qui lit `characters`, `campaign` et `dice` (en local `vtt`).
  Les écritures passent par `DATABASE_URL` (rôle `identity_svc`) et le code du service.
- Compteurs à vie repris : personnages joueurs non supprimés, campagnes où il est MJ et où il
  est joueur, séances qu'il a planifiées, messages, notes, jets (importés de l'ancienne app
  compris ; pas ceux d'une clé d'API), séances jouées, amis, profil complété, minutes de jeu. Un
  compteur repris ne baisse jamais : `greatest(actuel, repris)`.
- Clés reprises : campagnes rejointes, amis, profil complété (rien n'est regagné ensuite).
- Les défis permanents atteints sont accomplis avec leur XP ; les quotidiens et hebdomadaires ne
  sont pas repris. Plus d'« ancienneté » en XP : le niveau d'avant la remplace.
- Sortie : des compteurs seulement (comptes, totaux, niveaux atteints), jamais d'identifiant.

## 10. Données

Migration `0015-account-progression.sql` (identity) :

| Table                    | Contenu                                                       | Conservation  |
| ------------------------ | ------------------------------------------------------------- | ------------- |
| `account_progress`       | `user_id`, `xp`, `level`, `updated_at`                        | vie du compte |
| `progression_daily`      | `user_id`, `day`, `activity`, `units`, `xp` (plafonds, défis) | 90 jours      |
| `progression_counters`   | `user_id`, `activity`, `total` (défis permanents)             | vie du compte |
| `progression_keys`       | `user_id`, `activity`, `key` (unicité, § 3)                   | vie du compte |
| `progression_challenges` | `user_id`, `challenge_id`, `period`, `xp`, `completed_at`     | vie du compte |
| `inbox`                  | clé primaire `(consumer, event_id)`                           | inchangée     |

- Toutes en `ON DELETE CASCADE` sur `users` : la purge du compte les efface.
- Le détail par jour de plus de 90 jours est purgé par la passe de maintenance d'identity (toutes
  les 6 h).
- Les clés d'unicité ne contiennent que des identifiants (campagne, autre joueur) et des dates.
- Export : `lib/data-export.ts` ajoute `progression` (état) et `progressionHistory` (détail).
- Registre des traitements (`docs/legal.md`) : ligne « Progression du compte ».

## 11. Décisions prises

Prises seul, à revoir par Théo :

1. **Compte, pas personnage** ; XP jamais retirée (supprimer un personnage ne retire rien).
2. **Consommateur séparé** `identity-progression` plutôt qu'étendre `identity-titles` : sujets,
   reprise et pannes indépendants. D'où la clé de l'inbox `(consumer, event_id)`.
3. **Jour de Paris**, calculé sur `occurredAt` de l'événement.
4. **Séance jouée** = premier jet ou message du joueur dans une campagne, un jour donné. Il n'y a
   pas de notion de présence à une séance planifiée ; c'est l'approximation la plus fiable.
5. **Inviter un ami** = amitié acceptée (`friend_added`, pour les deux). Le recrutement d'un
   joueur par invitation de campagne n'est pas suivi (l'événement ne nomme pas l'invitant).
6. **Courbe** `100 + 50 (n − 1)` par niveau, sans maximum.
7. **Plafonds journaliers en XP** par activité (§ 3) ; les défis donnent leur XP hors plafond.
8. **Récompenses** : titres et bordures seulement (rien qui s'achète ne devient gratuit, sauf trois
   bordures « Arcane » à des niveaux élevés, en récompense de fidélité) ; les bordures « Lueur » et
   assimilées restent premium.
9. **Contrôle serveur des bordures** (403 `border_locked`), absent jusque-là.
10. **Rotation par joueur** (graine `userId`), pas une sélection commune à tous.
11. **Pas d'événement par gain d'XP** ; seulement niveau et défi accomplis.
12. **Temps de jeu rétabli** dans le front (régression du nouveau front par rapport à l'ancienne
    app), compté sur onglet visible seulement.
13. **Niveau d'avant** (avec Théo, 2026-10-07) : chaque compte démarre au niveau que lui donnait
    l'ancienne app (1 niveau / 2 h de jeu), automatiquement à la création de sa ligne ; aucune
    migration manuelle. La reprise des compteurs reste une commande facultative (§ 9).
14. **Premiers pas de l'accueil** remplacés par ceux du serveur (mêmes étapes, plus l'ami et la
    séance) : une seule source de vérité.
15. Le **profil public** montre le niveau, pas l'XP ni les défis.

## 12. Suites possibles

- Skins de dés ou cadres de jetons en récompense : un consommateur de `identity.level_reached`
  dans billing, droit de source `progression` (republié à dice comme les autres droits).
- Niveau affiché dans les listes (amis, membres d'une campagne, barre latérale).
- Recrutement : XP au MJ quand un joueur rejoint par son invitation (il faudrait que
  `campaign.member_joined` nomme l'auteur de l'invitation).
- Défis propres au MJ (planifier une séance dans la semaine) dans un lot réservé aux comptes
  qui mènent une campagne.
