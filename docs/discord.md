# Discord : activité et bot

Reprise des deux fonctionnalités Discord du legacy (`legacy/src/app/discord`,
`legacy/src/app/api/discord/*`) sur la nouvelle architecture, sans rien perdre :

- **l'activité** : Yner lancé dans un salon vocal Discord (iframe), connexion par le compte
  Discord, salle active, mes campagnes, création, puis le jeu complet dans Discord ;
- **le bot de dés** : `/roll` adapté au système de la salle active, `/room`, `/history`,
  `/stats`, `/link`, `/unlink`.

Abandonné volontairement : `/login email mot de passe` (le mot de passe tapé dans une commande
Discord transite et reste dans les journaux de Discord). Il est remplacé par `/link`.

## Applications Discord

Les deux applications du legacy, partagées par tous les environnements :

- **Yner bot** (`1486015721740959794`) : le bot de dés, ses commandes et son jeton
  (`DISCORD_TOKEN` du legacy) ;
- **Yner** (`1495752182837018764`) : l'activité et la connexion Discord du site.

Chacune n'a qu'une adresse d'activité ou d'interactions : elles visent l'environnement en test
(staging pendant la refonte, testé sur le serveur perso de Théo ; le legacy perd alors son
activité et son bot), puis `yner.fr` à la bascule de la prod.

| Réglage du portail                  | Pendant la refonte                                | Après la bascule                          |
| ----------------------------------- | ------------------------------------------------- | ----------------------------------------- |
| Yner, activités, URL mapping `/`    | `staging.yner.fr`                                 | `yner.fr`                                 |
| Yner bot, Interactions Endpoint URL | `https://staging.yner.fr/v1/discord/interactions` | `https://yner.fr/v1/discord/interactions` |
| Yner, Redirects OAuth2              | staging et `yner.fr` (déjà en place)              | idem                                      |

Autres URL mappings, identiques partout : `/r2` → `assets.yner.fr`, `/firebase` →
`firebasestorage.googleapis.com`, `/discord-cdn` → `cdn.discordapp.com`.

Valeurs (reprises de `legacy/.env`) : `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` (identity,
secrets) ; `DISCORD_APPLICATION_ID` et `DISCORD_PUBLIC_KEY` (service discord, publiques, en
clair dans gitops) ; `DISCORD_BOT_TOKEN` (`DISCORD_TOKEN` du legacy) sert seulement à
enregistrer les commandes depuis un poste (`pnpm --filter @vtt/discord commands:register`),
jamais au service. Le secret interne du bot est lu dans le Secret d'identity.

## Lien compte Discord ↔ compte Yner

Le lien du bot est **distinct de la connexion** : délier le bot ne retire jamais un moyen de
connexion. Table `identity.discord_bot_links (discord_user_id, user_id)` :

- `/link` : le bot demande à identity un jeton signé (10 min) et l'envoie au seul joueur, en bouton
  vers `/discord/lier?jeton=…` ; connecté à n'importe quel compte (mot de passe, Google,
  Discord), il clique « Lier » et le bot agit désormais pour ce compte ;
- `/unlink` : le bot n'agit plus pour cet identifiant (`user_id` vide), toujours accepté ;
- sans ligne : le bot suit le compte connecté avec Discord (`identity.oauth_accounts`).

L'activité, elle, connecte le compte lié à Discord (`oauth_accounts`).

## Salle active

Chaque joueur a une **salle active** : la campagne que suivent ses jets Discord et où l'activité
le ramène. Elle se choisit parmi les campagnes dont il est déjà joueur ou MJ (`/room` dans
Discord, ou en entrant dans une campagne depuis l'activité). Pas de lien salon ↔ campagne : deux
joueurs d'un même salon peuvent suivre deux salles différentes.

campaign, table `campaign.active_campaigns (user_id pk, campaign_id, updated_at)`, effacée si le
joueur quitte la campagne ou si elle est supprimée :

- `GET /v1/campaigns/active` : `{ campaign }` (titre, système, rôle) ou 404
- `PUT /v1/campaigns/active { campaignId }` : membre seulement (joueur ou MJ)

À reprendre plus tard : l'import legacy pourrait poser `users/{uid}.room_id` comme salle active
(il est déjà lu par le regroupement des membres, `import/grouping.ts`).

## Activité

### Connexion

1. Le front (route `/discord`) détecte l'activité (`frame_id` dans l'URL ou hôte
   `*.discordsays.com`), puis `discordSdk.ready()` et
   `commands.authorize({ scope: ['identify', 'email', 'guilds'] })` → `code`.
2. `POST /v1/auth/discord/activity { code }` (identity) : échange du code avec le secret de
   l'application, lecture de l'utilisateur Discord, puis **la même logique que le retour OAuth
   du site** (`modules/oauth/comptes.ts`) : compte lié retrouvé, ou rattaché par e-mail vérifié,
   ou créé. Réponse : `{ accessToken, expiresIn, discordAccessToken }`.
3. `commands.authenticate({ access_token: discordAccessToken })` côté SDK.

Pas de jeton de renouvellement en cookie : dans l'iframe (site tiers pour le navigateur), le
cookie `SameSite=strict` n'est jamais envoyé. Le jeton d'accès vit en mémoire ; à son expiration,
le front refait `authorize` (silencieux, `prompt: 'none'`) puis l'étape 2.

### Écran d'arrivée

Sans texte explicatif (UI sans blabla), trois cartes :

- **Salle active** (s'il en a une) : Entrer ;
- **Mes campagnes** : liste, Entrer ;
- **Nouvelle campagne** : création (même formulaire que le site).

Entrer dans une campagne en fait la salle active, puis navigation vers la campagne : c'est l'application normale (carte, fiches, dés, audio), dans
l'iframe.

### Contraintes de l'iframe

- **Proxy Discord** : tout passe par `https://<app>.discordsays.com/.proxy/…`. L'API et le temps
  réel sont déjà sur la même origine (`/v1`, WebSocket compris) : rien à changer. Les ressources
  externes ont chacune leur URL mapping :
  `/r2` → `assets.yner.fr`, `/firebase` → `firebasestorage.googleapis.com`,
  `/discord-cdn` → `cdn.discordapp.com` ; `patchUrlMappings` du SDK réécrit `fetch`, `img`,
  `audio` et WebSocket au démarrage de l'activité.
- **En-têtes** : `Content-Security-Policy: frame-ancestors https://discord.com
https://*.discordsays.com` sur l'application web (pas de `X-Frame-Options`).
- **YouTube** (zones audio) : iframe externe, bloquée par Discord ; l'audio YouTube reste
  indisponible dans l'activité, les fichiers R2 fonctionnent.

## Bot

### Service `discord` (nouveau)

`backend/discord`, sans base de données : il reçoit les interactions, vérifie leur signature
(Ed25519, `DISCORD_PUBLIC_KEY`), répond d'abord « en cours » (type 5, limite de 3 s de Discord)
puis complète le message (`PATCH /webhooks/:app/:token/messages/@original`).

- `POST /v1/discord/interactions` : public, exposé par la gateway, signature obligatoire.
- Enregistrement des commandes : `pnpm --filter @vtt/discord commands:register` (et Job Argo
  PostSync), idempotent (`PUT /applications/:app/commands`).

### Agir au nom du joueur

Le bot n'a aucun droit propre. Pour chaque commande :

1. identity, route interne `POST /internal/discord/delegate { discordUserId }` (secret interne) :
   compte lié → jeton d'accès court (60 s), `amr: ['discord-bot']`, mêmes droits que le joueur ;
   pas de compte lié → 404.
2. Le bot appelle les services publics habituels avec ce jeton : rien de spécial côté dice,
   campaign, character (mêmes contrôles d'appartenance, mêmes limites de débit).

### Commandes

Le bot ne fait que des dés. `/roll` et `/history` répondent en public, sous la commande
lancée ; `/room`, `/me`, `/stats`, `/link`, `/unlink` et le plateau `/tray` ne sont vus que de
leur auteur (le jet lancé depuis le plateau, lui, est public). Commandes et options en anglais (noms du legacy) ; descriptions et
messages en français. Pas de compte lié → message éphémère avec le bouton de `/link` ;
pas de salle active → message éphémère qui propose `/room`.

| Commande                    | Effet                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/room [campaign]`          | Choisit la salle active parmi ses campagnes (autocomplétion : titre et système) ; sans argument, affiche la salle active                                       |
| `/roll dice`                | Jet dans la salle active, avec le personnage du joueur (`POST /v1/dice/rolls`, tiré par le serveur) : visible sur la carte et dans l'historique comme tout jet |
| `/tray`                     | Plateau à boutons des dés du système de la salle active                                                                                                        |
| `/history [player] [count]` | Derniers jets publics de la salle active (`GET /v1/dice/rolls`)                                                                                                |
| `/stats [player]`           | Statistiques de la salle active (`GET /v1/dice/stats`)                                                                                                         |
| `/me`                       | Compte Yner lié et salle active, message éphémère                                                                                                              |
| `/link`                     | Bouton « Lier mon compte » vers `/discord/lier` (jeton de 10 min), message éphémère                                                                            |
| `/unlink`                   | Le bot n'agit plus pour toi ; ta connexion au site ne change pas (refusé s'il n'a pas d'autre moyen de connexion)                                              |

### Dés adaptés au système

Les options d'une commande Discord sont les mêmes pour tous ; ce qui s'adapte est calculé à
chaque appel, d'après le système de la salle active et ses `des.sortes` (présentation du
système, `packages/systemes`) : aucun dé écrit en dur dans le bot.

- **`/tray`** : plateau éphémère, un bouton par sorte de dé du système (d4…d20 pour
  D&D, Fortune, Aptitude, Maîtrise, Infortune, Difficulté, Défi, Force pour Star Wars), un
  compteur par sorte, ± modificateur pour les systèmes chiffrés, puis « Lancer » : le résultat
  est publié dans le salon.
- **`/roll dice`** : notation du système (`1d20+5`, ou dés à symboles), avec une autocomplétion
  qui propose les dés de ce système.
- **Résultat** : total et détail des dés pour un système chiffré ; symboles nets (Succès,
  Avantages, Triomphe…) avec leurs libellés courts pour un système à symboles. Couleurs de
  l'embed reprises de la présentation du système.

Les faces des jets du bot sont tirées par le service dice (aucune animation : pas de dés 3D à
lire) ; les jets 3D restent lus à l'arrêt de l'animation.

## Livraison

1. identity : `POST /v1/auth/discord/activity`, `POST /internal/discord/delegate`.
2. campaign : salle active (table, routes).
3. front : route `/discord`, SDK, URL mappings, `frame-ancestors`.
4. service `discord` : interactions, commandes, enregistrement, chart et gitops staging.
5. Portail Discord (Théo) : URL mappings vers staging, puis Interactions Endpoint URL une fois
   le service en ligne.
