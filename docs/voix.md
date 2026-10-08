# Voix à la table : conception

> Demande de Théo (2026-10-08) : « l'audio Discord dans les parties, pouvoir se connecter en
> audio, et surtout avoir les effets sonores par rapport à la distance, et/ou avec des effets, en
> direct ». Ce document fait foi pour le chantier ; il se lit avec docs/audio.md (moteur audio du
> front, zones sonores spatialisées) et docs/discord.md (bot, activité).

## 1. Décisions (Théo, 2026-10-08)

| Sujet           | Choix                                                                                          |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Transport       | **Cloudflare Realtime** (SFU géré + TURN), rien à héberger, pas d'UDP à ouvrir sur le k3s      |
| Mode            | **« Table »** par défaut (tout le monde s'entend), **« Proximité »** au choix du MJ, par scène |
| Premier lot     | **Distance et murs** ; **canal privé MJ ↔ joueur**                                             |
| Lots suivants   | ambiance de lieu (réverbération), effets de voix par personnage, MJ qui parle à travers un PNJ |
| Infra existante | aucune : application Cloudflare Realtime et clé TURN à créer, secrets dans le cluster          |

## 2. Pourquoi pas la voix de Discord elle-même

Un salon vocal Discord produit **un seul mix pour tous** : un bot peut écouter et parler, pas
envoyer à chaque joueur un mix différent. « J'entends l'orc à gauche, étouffé derrière le mur »
se calcule **joueur par joueur**, à partir de sa position : il faut donc recevoir chaque voix
séparément, dans notre application.

- **Activité Discord** (docs/discord.md) : les joueurs sont déjà dans le salon vocal ; on garde
  leur voix Discord telle quelle et la voix de la table est désactivée (pas d'écho double).
- **Pont Discord** (plus tard, § 9) : le bot relaie la voix des joueurs d'un salon vers la table,
  pour que ceux du site les entendent en spatial.

## 3. Architecture

```
navigateur A ──(WebRTC : 1 piste micro envoyée, N pistes reçues)──► Cloudflare Realtime (SFU, TURN)
     │                                                                      ▲
     │ REST /v1/campaigns/:id/voice/*  (gateway)                            │ API HTTPS (secret)
     ▼                                                                      │
 service voice ─────────────────────────────────────────────────────────────┘
     │ NATS  vtt.<campagne>.voice.*            Valkey : salle vocale (qui, pistes, canaux privés)
     ▼
 realtime ──(WebSocket)──► navigateurs : arrivées, départs, qui parle, canaux privés
```

### 3.1 Service `backend/voice`

Nouveau service, sur le modèle des autres (Fastify, `@vtt/platform`, OTel, Helm) :

- **Seul détenteur des secrets** : identifiant et jeton de l'application Cloudflare Realtime, clé
  TURN. Le navigateur ne parle jamais directement à l'API Cloudflare.
- **Mandataire de l'API** : sessions (`POST /apps/{app}/sessions/new`), pistes
  (`…/sessions/{id}/tracks/new`), renégociation (`PUT …/renegotiate`), fermeture ; identifiants
  TURN à durée courte (`/turn/keys/{key}/credentials/generate-ice-servers`, ttl 1 h).
- **Garde des droits** : membre de la campagne ; une piste ne se tire que si l'appelant y a droit
  (même campagne ; piste privée : son seul destinataire, § 5).
- **État de la salle vocale** dans Valkey (clé par campagne, TTL) : participants, leur session
  Cloudflare, leurs pistes (micro, privée), personnage incarné ; rien en base de données.
- **Événements** NATS `vtt.<campagne>.voice.{joined,left,tracks,muted,private}` relayés par
  realtime ; « qui parle » passe par le canal éphémère de realtime (pas de journal).
- **Aucun enregistrement** de la voix : le média ne traverse que Cloudflare.

### 3.2 Navigateur : connexion

1. `GET …/voice/ice` : serveurs ICE (STUN + TURN Cloudflare à durée courte).
2. `getUserMedia({ audio: { echoCancellation, noiseSuppression, autoGainControl } })`.
3. Une `RTCPeerConnection` ; offre → `POST …/voice/join` (le service crée la session Cloudflare,
   pousse la piste micro, rend la réponse SDP) ; réponse appliquée.
4. Arrivée d'un autre participant (`voice.joined`) : `POST …/voice/pull` (pistes à tirer) ; la
   réponse est une offre de Cloudflare → réponse locale → `PUT …/voice/renegotiate`.
5. Départ, coupure réseau : `voice.left`, nettoyage des pistes ; reprise : reconnexion à la
   salle (ICE restart, puis nouvelle session si besoin).

Contrainte connue de Chrome : une piste WebRTC distante ne passe dans Web Audio que si son
`MediaStream` est aussi attaché à un élément `<audio>` (muet). On le fait systématiquement.

## 4. Mixage spatial (navigateur)

Chaque voix reçue suit le graphe du moteur audio existant (docs/audio.md § 3.8) :

```
piste distante ─► MediaStreamSource ─► [effets de voix : lots suivants] ─► gain (distance, murs)
              ─► passe-bas (murs) ─► StereoPanner ─► bus « voix » ─► master ─► limiteur
```

- **Mode « Table »** : gain 1, panoramique 0, pas de murs : comme un appel.
- **Mode « Proximité »** (le MJ le choisit par scène) :
  - auditeur : mon token (joueur) ; pour le MJ, le token sélectionné, sinon le centre de la vue ;
  - source : le token du personnage incarné par celui qui parle ; le MJ hors token parle
    « partout » (gain 1, le narrateur) ;
  - distance en cases : plein volume jusqu'à `portée claire`, puis décroissance jusqu'au silence
    à `portée max` (réglages de la scène, défauts 6 et 24 cases), courbe reprise de `zoneMix` ;
  - murs : le même comptage que les zones sonores (`@vtt/vision`), le même étouffement (`muffle`) :
    volume divisé par deux par mur, passe-bas ;
  - panoramique : selon l'écart horizontal, comme les zones ;
  - mise à jour à chaque image (positions des tokens), paramètres lissés (`setTargetAtTime`).
- **Mixeur** : bus « voix » dans le mixeur personnel, volume par participant, sourdine.
- **Budgets** : 12 voix spatialisées au plus par auditeur ; mixage < 1 ms par image ; débit Opus
  ~32 kbit/s par voix (une séance de 3 h à 6 joueurs ≈ 1,3 Go sortant chez Cloudflare).

Limite assumée : chacun reçoit toutes les voix de la scène ; la distance est appliquée chez lui.
Un client modifié pourrait entendre de loin. Seul le canal privé est garanti par le serveur.

## 5. Canal privé MJ ↔ joueur

- Le MJ choisit un joueur (portrait, menu du token, panneau Personnages) : « Parler en privé ».
- Le navigateur du MJ pousse **une seconde piste**, clone du micro, **que seul ce joueur peut
  tirer** (le service le vérifie) ; pendant ce temps la piste publique du MJ est coupée
  (`enabled = false` : silence envoyé aux autres). Fin du privé : l'inverse.
- Le joueur peut répondre en privé : même mécanisme, sa piste privée n'est tirable que par le MJ.
- Interface : pastille « privé » sur les deux portraits, son de début et de fin discret.

## 6. Interface

Sans texte explicatif (UI sans blabla) :

- **Rejoindre la voix** : bouton du rail ou de la barre de la table ; premier usage : choix du
  micro et test de niveau.
- **Barre vocale** : micro (muet), casque (sourdine), mode d'émission **appui pour parler**
  (touche réglable dans les raccourcis) ou **détection de voix** (seuil), choix des appareils.
- **Qui parle** : anneau animé sur les tokens et les portraits du rail des joueurs.
- **MJ** : mode de la scène (Table ou Proximité, portées), couper un participant pour la table,
  canal privé.

## 7. Contrats

- Gateway : `'/v1/campaigns/:id/voice': 'UPSTREAM_VOICE_URL'`.
- `packages/contracts/src/voice.ts` : `VoiceParticipant`, `JoinVoice`, `PullTracks`,
  `Renegotiate`, `VoiceIceServers`, `VoiceSceneSettings { mode, clearRange, maxRange }`,
  `PrivateChannel`, charges des événements.
- Réglages de scène (`mode`, portées) : service campaign, avec la scène (une migration).
- Raccourcis : `voice.push-to-talk`, `voice.mute`, `voice.deafen` (docs/raccourcis.md).

## 8. Phases

1. **Socle** : service voice (Cloudflare, Valkey, NATS), contrats, gateway, Helm, secrets ;
   rejoindre et quitter, entendre tout le monde en mode Table, muet et sourdine, qui parle,
   reprise après coupure.
2. **Proximité** : réglages de scène, mixage spatial (distance, murs, panoramique), auditeur du
   MJ, bus « voix » du mixeur.
3. **Canal privé** MJ ↔ joueur (pistes privées gardées par le service).
4. **Confort** : appui pour parler et détection de voix, test du micro, volume par participant,
   activité Discord (voix de la table désactivée).
5. **Lots suivants** : réverbération de lieu, effets de voix par personnage, le MJ parle à travers
   un PNJ, pont Discord.

Chaque phase : tests unitaires (courbes, graphe, droits), tests d'intégration du service (API
Cloudflare simulée), e2e lancés par Théo. Avant la mise en ligne : textes légaux (traitement de la
voix sans enregistrement), docs/legal.md.

## 9. Plus tard

- **Pont Discord** : le bot rejoint le salon vocal, reçoit la voix de chaque utilisateur Discord
  séparément et la pousse dans la salle vocale (une piste par utilisateur), spatialisée pour les
  joueurs du site ; ceux de Discord entendent le salon normal.
- Sous-titres, transcription : à concevoir avec les textes légaux.
- Vidéo (caméras) : même transport, hors de ce chantier.

## 10. À préparer par Théo

- Créer l'application **Cloudflare Realtime** (SFU) et une **clé TURN** dans le compte
  Cloudflare ; me donner les noms des secrets à créer (identifiant d'app, jeton, identifiant et
  jeton de la clé TURN) pour le staging et le dev (`.env` du service voice).
