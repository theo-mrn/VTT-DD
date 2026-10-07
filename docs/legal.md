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
réglages des dés, du mixeur, de la barre de la carte et des raccourcis). Une rubrique illisible est notée `{ error }` sans bloquer les
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

## Marketplace de créateurs (à ajouter avant l'ouverture)

> Liste de travail, pas de texte juridique : chaque point est à rédiger ou valider (avocat,
> expert-comptable) avant d'ouvrir la marketplace au public, et **avant** `STRIPE_CONNECT=on`
> pour la vente. Conception : [marketplace.md](marketplace.md). L'en-tête de ce document (« Yner
> ne vend rien ») ne vaut plus dès que la vente est ouverte.

### Conditions d'utilisation (`/terms`) : tous les membres

- **Rôle de Yner** : hébergeur et intermédiaire (place de marché), pas éditeur du contenu des
  créateurs ; responsabilité limitée au retrait prompt d'un contenu signalé (LCEN art. 6, DSA
  art. 6).
- **Contenus interdits** : contenu sexuel explicite, haineux, illicite, contrefaisant ; thèmes
  durs permis s'ils sont balisés (avertissements : violence, horreur, gore, drogues, phobies).
- **Signalement et décisions** (DSA art. 16 et 17) : mécanisme de notification (bouton
  « Signaler », motifs), information du créateur et **motivation de chaque décision** (refus en
  revue, retrait : motif et note), voie de recours (aujourd'hui `contact@yner.fr` ; DSA art. 20
  à vérifier : Yner relève a priori de l'exemption micro ou petite entreprise).
- **Avis** (art. L111-7-2 du Code de la consommation) : préciser qu'ils sont **vérifiés**
  (seuls les acquéreurs notent), sans contrepartie, publiés sans tri, modifiables et
  supprimables par leur auteur, retirés seulement s'ils enfreignent les règles.
- **Classement** (art. L111-7 et D111-7 ; règlement P2B 2019/1150 pour les créateurs
  professionnels) : paramètres du classement du catalogue — populaires (nombre d'acquisitions),
  mieux notés (moyenne pondérée par le nombre d'avis), récents, prix ; pas de mise en avant
  payée.
- **Licence d'utilisation accordée à l'acquéreur** : usage dans ses parties sur Yner, selon la
  licence déclarée par le créateur ; pas de revente ni de redistribution des fichiers ; le
  contenu installé reste utilisable si le pack est retiré, sauf retrait pour droits d'un tiers
  (fichiers supprimés).

### Conditions des créateurs (nouveau document, accepté à la création du profil)

- **Garantie des droits** : le créateur déclare détenir les droits sur tout ce qu'il publie
  (attestation horodatée à chaque soumission, déjà en place) et garantit Yner contre les
  réclamations de tiers ; licences tierces (SRD, CC) citées dans les crédits.
- **Licence accordée à Yner** : héberger, reproduire et afficher le contenu pour le
  distribuer ; conservation des fichiers d'une version pour ses acquéreurs, même après retrait
  par le créateur ou suppression de son compte.
- **Revue, refus, retrait** : critères, délais indicatifs, motifs, effets (retrait pour droits :
  fichiers supprimés).
- **Vente** : commission (15 % TTC, 0,50 € au moins, frais Stripe à la charge de Yner), prix de
  2 € à 200 €, versements par Stripe (conditions du Stripe Connected Account Agreement à
  accepter pendant l'onboarding), remboursements et contestations (vente annulée, commission
  remboursée), facture émise **au nom du créateur**.
- **Statut du créateur** (art. L111-7 Code de la consommation) : déclarer s'il agit en
  professionnel ou non ; l'afficher sur sa page et ses fiches (à ajouter au profil de créateur)
  et rappeler à l'acheteur que le droit de la consommation ne s'applique pas à un vendeur
  particulier.
- **Fiscalité et obligations du créateur** (art. 242 bis du CGI) : informer le créateur, à
  chaque vente et par un récapitulatif annuel, de ses obligations fiscales et sociales (revenus
  à déclarer, statut de micro-entrepreneur au-delà d'une activité occasionnelle). **DAC7**
  (directive 2021/514, art. 1649 ter A du CGI) : à vérifier si la vente de contenu numérique
  entre dans les « activités concernées » ; si oui, collecte des données fiscales des vendeurs
  (Stripe Connect les collecte en partie) et déclaration annuelle à la DGFiP.

### Conditions de vente (`/cgv`) : achats de packs

- **Vendeur** : le créateur (identité ou dénomination, statut), Yner en intermédiaire ; prix
  TTC.
- **Contenu numérique livré tout de suite** : renonciation expresse au droit de rétractation
  (art. L221-28 13°), déjà prévue dans Checkout (`STRIPE_TERMS=on`), à étendre aux packs.
- **TVA** : sur une place de marché de services électroniques, Yner peut être réputé
  prestataire (art. 9 bis du règlement d'exécution 282/2011) et redevable de la TVA sur la
  vente entière ; à trancher avec un expert-comptable (statut de franchise en base, Stripe Tax,
  mentions des factures émises au nom du créateur).
- **Réclamations et remboursements** : qui traite (Yner en premier), délais, cas d'un pack
  inutilisable ; médiateur de la consommation à désigner dès que Yner vend à des particuliers.

### Données personnelles (`/privacy` et registre)

- Nouveau traitement « Marketplace » : profil de créateur (nom public, présentation),
  acquisitions, installations, avis, signalements (texte libre conservé hors du journal) ;
  base légale : contrat ; durée : vie du compte (signalements gardés sans auteur).
- Paiement des créateurs : données d'identité et bancaires collectées **par Stripe** (Stripe
  responsable de traitement pour la vérification KYC) ; Yner ne garde que l'identifiant du
  compte et son état.
- Suppression de compte : déjà propagée (marketplace : `marketplace-events` ; billing : compte
  connecté oublié, **à clôturer aussi dans Stripe**) ; les ventes gardent l'identifiant du
  vendeur pour la comptabilité (10 ans, art. L123-22 du Code de commerce).
