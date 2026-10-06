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
| Suppression de compte propagée à tous les services      | Fait, history compris                                                             |
| Export des données                                      | Fait (Profil › Sécurité, JSON assemblé dans le navigateur)                        |
| Comptes inactifs                                        | Fait (identity, passe toutes les 6 h)                                             |
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

## Suppression de compte (validée le 2026-10-05)

1. `DELETE /v1/users/me` (identity) **programme** la suppression : sessions et clés d'API coupées,
   compte masqué des autres (amis, profils publics, bot Discord), e-mail `suppression-programmee`
   avec la date. Toute connexion (mot de passe, Google, Discord, activité Discord) l'**annule**.
2. Sept jours plus tard, la passe d'identity (toutes les 6 h) **purge** le compte et publie
   `identity.user_deleted` (`USER_DELETED` dans `@vtt/contracts`). Chaque service efface ce qui
   lui appartient par un consommateur durable, au moins une fois, inbox comprise :

| Service   | Consommateur          | `identity.user_deleted`                                                                                                                                                                  | `campaign.deleted`                                |
| --------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| campaign  | `campaign-accounts`   | campagnes de MJ supprimées (`campaign.deleted`) ; départ des autres avec ses personnages ; messages, notes, épingles, tracés, mesures, notes de carte, invitations reçues, bannissements | cascade SQL (existait)                            |
| character | `character-lifecycle` | ses personnages purgés sans corbeille ; applications                                                                                                                                     | PNJ posés, modèles de PNJ et d'objets, catégories |
| dice      | `dice-lifecycle`      | préférences, inventaire, droits, jets personnels ; jets de campagne sous « Joueur supprimé », sans avatar                                                                                | jets de la campagne                               |
| audio     | `audio-campaigns`     | réglages du mixeur                                                                                                                                                                       | existait                                          |
| billing   | `billing-accounts`    | client Stripe supprimé si Stripe configuré, puis toutes les données de paiement                                                                                                          | —                                                 |
| history   | —                     | **question ouverte**                                                                                                                                                                     | **question ouverte**                              |

Les fichiers partent avec le balayage des orphelins ([nettoyage.md](nettoyage.md)), une fois plus
référencés. Les modèles de PNJ et d'objets ne partent que par un geste du MJ : supprimer sa
campagne ou son compte.

### History (validé le 2026-10-05)

Le journal reste immuable pour le service. Seules exceptions : `erase_campaign` et `erase_user`
(0002-erasure), `SECURITY DEFINER` du propriétaire, qui lèvent l'immuabilité le temps de leur
transaction (réglage `history.erasure`, vérifié par le trigger ; `history_svc` n'a toujours ni
UPDATE ni DELETE). `erase_user` remplace `payload.userName` par « Joueur supprimé » et recalcule
chaque chaîne touchée à partir du premier événement modifié : `verify_chain` reste vraie. Le
consommateur appelle la fonction juste après avoir ajouté l'événement ; rejouée, elle ne fait rien.

## Export des données (fait)

Profil › Sécurité › « Télécharger » : `lib/data-export.ts` lit les API de chaque service avec la
session de la personne et assemble `yner-donnees-AAAA-MM-JJ.json` (profil, titres, sessions,
amis, clés d'API, campagnes, personnages complets, ses notes complètes, jets personnels,
réglages des dés, du mixeur et de la barre de la carte). Une rubrique illisible est notée `{ error }` sans bloquer les
autres.

## Comptes inactifs (fait)

Dernière visite `users.last_seen_at`, au plus une écriture par jour (connexion, rafraîchissement) ;
partie du déploiement pour les comptes existants et importés (sinon les anciens comptes Firebase
seraient tous prévenus d'un coup). Sans visite depuis 3 ans : e-mail `inactivite` ; sans retour
sous 30 jours : suppression programmée comme ci-dessus.

Modèles Kourrier ajoutés : `suppression-programmee`, `inactivite` (`infra/mails/publier.sh`).

## Licences des contenus

- **SRD 5.1** (bestiaire, règles D&D) : CC-BY-4.0, attribution sur `/credits`. Les marques
  « D&D » ne sont pas couvertes : mention de non-affiliation.
- **Star Wars : Aux confins de l'Empire** : textes repris des livres, sans licence. Décision de
  Théo (2026-10-05) : gardé, présenté comme adaptation non officielle, retrait sur demande d'un
  ayant droit.
- **Illustrations** : achetées sur Etsy sous licence d'usage commercial (intégration dans un
  produit, pas de revente des fichiers seuls) ; d'autres générées. La bibliothèque n'a pas de
  bouton de téléchargement : à garder ainsi.
- **Polices** : Google Fonts (OFL, Apache 2.0) ; Hobbiton Brush Hand (Nancy Lorenz, « 100 %
  gratuite » sur dafont) et Aurebesh : gratuites, confirmé par Théo le 2026-10-05.
