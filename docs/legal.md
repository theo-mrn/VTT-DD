# Légal : pages, données personnelles, licences

> Chantier ouvert le 2026-10-05. Éditeur : Théo MORIN, particulier ; contact `contact@yner.fr`.
> Yner ne vend rien (voir [paiement.md](paiement.md)) : pas de conditions de vente, pas de
> médiateur de la consommation.

## État

| Sujet                                                   | État                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mentions légales `/legal`                               | Fait                                                                              |
| Politique de confidentialité `/privacy`                 | Fait                                                                              |
| Conditions d'utilisation `/terms` (signalement compris) | Fait                                                                              |
| Crédits et licences `/credits` (attribution du SRD 5.1) | Fait                                                                              |
| Liens : pied de page, inscription                       | Fait                                                                              |
| Accord avant le lecteur YouTube                         | Fait (`lib/consent/youtube.ts`, bandeau, réglage du profil)                       |
| Purge des sessions et jetons d'e-mail (identity)        | Fait (toutes les 6 h)                                                             |
| Journaux Loki 30 jours                                  | Prêt dans `argocd_registry` (compacteur), à pousser                               |
| `robots.txt`, sitemap                                   | Fait : indexé sur `yner.fr` seulement                                             |
| Suppression de compte propagée à tous les services      | **À faire** : conception ci-dessous, à valider                                    |
| Export des données                                      | **À faire** : conception ci-dessous, à valider                                    |
| Comptes inactifs                                        | **À faire** : conception ci-dessous, à valider                                    |
| Liens légaux dans les consoles Google, Discord, X       | **Théo** : URL de `/privacy` et `/terms` dans l'écran de consentement et les apps |
| Images du bestiaire venues de dnd5eapi.co               | **À vérifier** : licence des images non documentée par 5e-bits                    |

## Registre des traitements

Tenu ici (article 30 du RGPD) ; la politique de confidentialité en est la version publique.

| Traitement         | Données                                               | Base légale      | Durée                                           | Où                                        |
| ------------------ | ----------------------------------------------------- | ---------------- | ----------------------------------------------- | ----------------------------------------- |
| Comptes            | e-mail, nom, mot de passe haché, profil, comptes liés | Contrat          | Vie du compte                                   | identity                                  |
| Sessions           | IP, navigateur, dates                                 | Intérêt légitime | 30 jours après rotation, révocation, expiration | identity (`purgeExpired`)                 |
| Jeu                | campagnes, cartes, personnages, notes, jets, audio    | Contrat          | Vie du compte                                   | campaign, character, dice, audio, history |
| Fichiers envoyés   | images                                                | Contrat          | Tant que référencés                             | R2, balayage des orphelins                |
| E-mails de service | e-mail                                                | Contrat          | Envoi                                           | Kourrier → Amazon SES (Paris)             |
| Journaux, traces   | IP, requêtes, erreurs                                 | Intérêt légitime | 30 jours, traces 3 jours                        | Loki, Tempo                               |
| Sauvegardes        | toute la base                                         | Intérêt légitime | 7 jours                                         | CloudNativePG → R2                        |
| Lecteur YouTube    | traceurs de YouTube                                   | Consentement     | Choix gardé dans le navigateur                  | front                                     |

Sous-traitants : Hostinger (serveurs, Paris), Cloudflare (CDN, R2), Amazon Web Services (SES,
Paris) ; Google, Discord, X et YouTube seulement à l'initiative de l'utilisateur.

## En cas de fuite de données

1. Couper l'accès (secret révoqué, session, nœud isolé) ; garder les traces.
2. Évaluer : quelles données, combien de personnes, quel risque.
3. Sous 72 heures après en avoir eu connaissance : notification à la CNIL (téléservice
   « notifier une violation »), sauf risque improbable pour les personnes.
4. Risque élevé (mots de passe, données de connexion) : prévenir les personnes concernées par
   e-mail, avec ce qu'elles doivent faire.
5. Noter l'incident ici (date, nature, mesures), même sans notification.

## Conception à valider : suppression de compte

**Constat** : `DELETE /v1/users/me` (identity, Profil › Sécurité) supprime le compte et émet
`identity.user_deleted`, mais **aucun service ne l'écoute**. Campagnes, personnages, notes, jets,
audio, historique et fichiers restent, alors que la fenêtre promet « toutes ses données ». Et
`campaign.deleted` n'est écouté que par audio et realtime : supprimer une campagne laisse ses
PNJ, modèles, jets et son historique.

**Décidé avec Théo** : les campagnes dont la personne est MJ sont supprimées avec le compte ; ses
personnages dans les campagnes des autres aussi.

**Principe** : le chemin de [nettoyage.md](nettoyage.md) — chaque service supprime ses propres
données en réaction à un événement, jamais sur appel direct ; les fichiers partent avec le
balayage des orphelins, une fois plus référencés.

| Service   | Sur `identity.user_deleted`                                                                                                                                                                                                                                       | Sur `campaign.deleted` (manque aujourd'hui) |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| campaign  | supprime ses campagnes de MJ (même chemin que `DELETE /v1/campaigns/:id`, un `campaign.deleted` par campagne) ; retire ses adhésions, invitations, bannissements, notes personnelles, épingles, campagne active ; ses tracés et mesures sur les cartes des autres | — (cascade SQL existante)                   |
| character | purge immédiate de ses personnages, sans corbeille ; candidatures                                                                                                                                                                                                 | PNJ, modèles, catégories de la campagne     |
| dice      | préférences, inventaire, jets personnels                                                                                                                                                                                                                          | jets de la campagne                         |
| audio     | réglages du mixeur                                                                                                                                                                                                                                                | existe déjà                                 |
| history   | événements sans campagne dont il est l'auteur                                                                                                                                                                                                                     | événements de la campagne                   |
| billing   | client, droits ; client Stripe supprimé (service éteint aujourd'hui)                                                                                                                                                                                              | —                                           |
| identity  | déjà fait (cascade : profil, sessions, amis, clés, liaison du bot Discord)                                                                                                                                                                                        | —                                           |

À valider :

1. **Délai** — (a) suppression immédiate, comme aujourd'hui ; (b) **recommandé** : compte
   désactivé tout de suite (sessions coupées, invisible), purge définitive à 7 jours, annulable
   en se reconnectant, comme la corbeille des personnages. Protège d'une erreur ou d'un compte
   volé.
2. **Historique dans les campagnes des autres** — chaque campagne a une chaîne d'empreintes
   (`prev_hash`) : effacer des événements la casse. **Recommandé** : les garder, l'auteur n'étant
   plus qu'un identifiant sans compte, affiché « Joueur supprimé » ; vérifier qu'aucun payload ne
   recopie un nom ou un e-mail de compte. Sinon : supprimer et recalculer la chaîne.
3. **La fenêtre de suppression** liste ce qui part : « 3 campagnes de MJ et leurs 7 joueurs,
   4 personnages ». Le bouton n'est réactivé qu'avec la propagation en place.

## Conception à valider : export des données

**Recommandé** : un bouton « Télécharger mes données » (Profil › Sécurité) qui appelle
`GET /v1/<service>/me/export` sur chaque service avec la session de la personne, et assemble un
seul fichier JSON dans le navigateur. Pas d'orchestrateur côté serveur, chaque service sait ce
qui lui appartient. Les fichiers (images) y figurent par leur adresse, pas en pièces jointes.

## Conception à valider : comptes inactifs

**Recommandé** : sans connexion depuis 3 ans, un e-mail prévient 30 jours avant, puis le compte
suit le chemin de suppression. Demande une colonne `users.last_seen_at` (les sessions sont
purgées, elles ne disent plus la dernière visite), mise à jour au rafraîchissement du jeton,
au plus une fois par jour.

## Licences des contenus

- **SRD 5.1** (bestiaire, règles D&D) : CC-BY-4.0, attribution sur `/credits`. Les marques
  « D&D » ne sont pas couvertes : mention de non-affiliation.
- **Star Wars : Aux confins de l'Empire** : textes repris des livres, sans licence. Décision de
  Théo (2026-10-05) : gardé, présenté comme adaptation non officielle, retrait sur demande d'un
  ayant droit.
- **Illustrations** : achetées sur Etsy sous licence d'usage commercial (intégration dans un
  produit, pas de revente des fichiers seuls) ; d'autres générées. La bibliothèque n'a pas de
  bouton de téléchargement : à garder ainsi.
- **Polices** : Google Fonts (OFL, Apache 2.0) ; `HobbitonBrushHand.ttf` et `Aurebesh-Italic.ttf`
  (systèmes de jeu) : licences à vérifier.
