# Marketplace de créateurs

Oct 7, 2026 · conception, puis v1 (`feat/marketplace`)

Les membres publient des **packs** (scènes de carte prêtes à jouer, modèles de PNJ, modèles
d'objets), gratuits ou payants ; les autres les trouvent, les acquièrent et les installent dans
leurs campagnes en un clic. Ce document fait foi : le code de `backend/marketplace`, les ajouts
de `backend/billing` et les écrans `frontend/src/{lib,components}/marketplace` le suivent.

## 1. Périmètre

### v1 (livrée)

| Domaine    | Contenu                                                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contenu    | Pack versionné : scènes (fond, dimensions, grilles, murs et portes, lumières, pièces, objets posés), modèles de PNJ (état du système), modèles d'objets (images de décor)      |
| Créateurs  | Profil de créateur (nom public, présentation), fiches produit, brouillon → en revue → publié / refusé, retrait et remise en vente, versions et notes de version                |
| Acheteurs  | Catalogue (recherche, filtres système, type, prix ; tris), fiche produit, acquisition gratuite ou payante, bibliothèque, installation dans une campagne, mises à jour, avis    |
| Paiement   | Par billing : Stripe Connect (comptes créateurs, commission, versements, factures émises au nom du créateur), **désactivé par défaut**, testé sur un Stripe simulé             |
| Modération | Revue de chaque version avant publication, file des modérateurs, signalements, retrait (et purge des fichiers pour droit d'auteur), contrôle a posteriori des fiches modifiées |
| Confiance  | Licence déclarée, attestation des droits à chaque soumission, contenu sexuel exclu, avertissements de contenu balisés, limites d'envoi et de débit                             |
| Stockage   | R2 seulement : fichiers du pack copiés dans `marketplace/<fiche>/…`, immuables une fois soumis                                                                                 |

### Plus tard (v2 et au-delà)

- Packs de **documents** (handouts), de **sons** (bibliothèque audio) et portails entre scènes d'un
  même pack ; skins de dés de créateurs (la boutique des dés est un catalogue de rendus 3D
  maison : un skin de créateur demanderait un format d'échange et une revue technique).
- Installation **côté serveur** (saga par événements, § 6.4) si l'installation par le navigateur
  montre ses limites.
- Prix libre, promotions, codes de réduction, lots ; remboursement en libre-service.
- Catalogue lisible sans compte (SEO), pages publiques des créateurs.
- E-mails propres à la marketplace (vente réalisée, version publiée, refus) ; aujourd'hui seul
  l'e-mail de facture existant part (`achat-confirme`).
- Recours contre une décision de modération dans l'interface (aujourd'hui : `contact@yner.fr`).

## 2. Où vit le code

**Un nouveau service, `backend/marketplace`** (port 3011, schéma `marketplace`), sur le modèle
d'audio : `createService`, Liquibase, outbox et relais, consommateur durable, client des droits
de campaign.

| Option                    | Pour                                               | Contre                                                                                                                                            |
| ------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Service marketplace** ✔ | Domaine à part (catalogue, créateurs, revue, avis) | Un déploiement de plus                                                                                                                            |
| Module de billing         | Proche de l'argent                                 | billing est petit et critique (clés Stripe, webhooks) : y mettre un catalogue, de la recherche, des envois et de la modération élargit sa surface |
| Module de campaign        | Proche des scènes                                  | Un pack vit hors de toute campagne et les traverse toutes ; campaign est déjà le plus gros service                                                |

Partage des responsabilités :

- **marketplace** : créateurs, fiches, versions, fichiers des packs, acquisitions, installations
  (suivi), avis, signalements, modération. Ne parle jamais à Stripe.
- **billing** : tout ce qui touche à Stripe — comptes Connect des créateurs, sessions Checkout des
  ventes, commission, webhooks, remboursements, factures. Publie les ventes sur le bus.
- **campaign / character** : inchangés. L'installation passe par leurs routes publiques
  existantes (droits du MJ, quota, événements, validation de l'état du système).

```
navigateur ──► marketplace ──(interne : droits)──► campaign
     │              │ ──(interne : session de vente)──► billing ──► Stripe
     │              ◄──── bus : billing.marketplace_sale_* , billing.connect_account_updated
     └──► campaign / character (routes publiques) : installation d'un pack
```

## 3. Modèle

### 3.1 Pack

Un **pack** est le contenu d'une **version** d'une fiche : un document JSON (`PackContent`,
`@vtt/contracts/marketplace`) plus les fichiers qu'il cite.

```ts
PackContent = {
  format: 1,
  systemId: string | null,        // obligatoire dès qu'il y a des PNJ
  scenes: [{ ref, scene, obstacles[], lights[], rooms[], objects[] }],   // ≤ 20
  npcTemplates: [{ ref, name, imageUrl, tokenUrl, actions[], etat }],   // ≤ 300
  objectTemplates: [{ ref, name, imageUrl, category }],                 // ≤ 500
}
```

- Les éléments de scène reprennent les schémas de création de la carte (`CreateMapObstacle`,
  `CreateMapLight`…) **sans** ce qui n'a de sens que dans une campagne (calque, jeton attaché,
  personnages autorisés, liens). Un pack ne contient ni jetons, ni brouillard, ni dessins, ni
  notes de carte, ni zones sonores (sons : v2).
- `etat` d'un modèle de PNJ est opaque pour marketplace (borné en taille) : character le valide à
  l'installation, dans le système de la campagne.
- Le document est rangé sur R2 (`marketplace/<fiche>/versions/<version>.json`), avec sa taille et
  son SHA-256 ; il n'est servi que par l'API, aux acquéreurs, au créateur et aux modérateurs.

### 3.2 Fichiers

- À l'envoi du contenu, chaque adresse d'image ou de vidéo du pack est **copiée côté serveur**
  (R2 → R2, `CopyObject`) dans `marketplace/<fiche>/assets/<uuidv7>.<ext>`, puis l'adresse est
  réécrite. Le pack ne dépend plus de la campagne d'origine (que son MJ peut vider).
- Sources admises : fichiers de notre stockage sous `campaigns/` et `characters/` (format de nos
  envois, images et vidéos, 10 Mo par image, 100 Mo par vidéo), et chemins du front (`/…`, gardés
  tels quels). Toute autre adresse est refusée (422 `asset_not_allowed`, avec la liste) : le
  composeur propose de retirer ces images.
- Une même source déjà copiée pour la fiche est réutilisée (`listing_assets`, unique par source) :
  une nouvelle version ne recopie pas tout.
- Couverture et galerie : envoi direct du navigateur (route commune `POST …/uploads`, usages
  `marketplace-cover` et `marketplace-image`, dossier `marketplace/<fiche>/`).
- Installés dans une campagne, les éléments **citent les fichiers de la marketplace** : rien n'est
  recopié, rien ne compte dans les 5 Go de la campagne, et le balayage des orphelins (qui ne
  regarde que `campaigns/` et `characters/`) n'y touche jamais.
- Purge : seulement au retrait pour droit d'auteur (§ 7) ; ailleurs, les fichiers d'une version
  soumise ne sont jamais modifiés ni supprimés (un acquéreur garde ce qu'il a installé).

### 3.3 Données (schéma `marketplace`)

```
creators          user_id (pk), slug (unique), display_name, bio, payouts_ready,
                  created_at, updated_at, version
listings          id, creator_id, slug (unique), title, summary, description, system_id,
                  license, attribution, price_cents, currency, tags[], content_warnings[],
                  cover_url, gallery[], status, kinds[], current_version_id,
                  acquisitions_count, rating_count, rating_sum, search (tsvector généré),
                  needs_recheck, removed_reason, published_at, created_at, updated_at, version
listing_versions  id, listing_id, number (x.y.z), notes, status, content_key, content_sha256,
                  content_bytes, counts (jsonb), system_id, rights_attested_at,
                  submitted_at, reviewed_at, reviewed_by, review_reason, review_note,
                  published_at, created_at, updated_at
listing_assets    listing_id, source_key, key, bytes, content_type  (unique listing+source)
acquisitions      user_id + listing_id (pk), source (free | purchase | gift), sale_id,
                  acquired_at, revoked_at, revoke_reason
installs          id, user_id, listing_id, version_id, campaign_id, status (started | done),
                  created (jsonb : comptes créés), started_at, completed_at
reviews           listing_id + user_id (pk), rating (1–5), comment, created_at, updated_at
reports           id, listing_id, reporter_id, reason, details, status (open | resolved |
                  dismissed), outcome, created_at, resolved_at, resolved_by
outbox, inbox
```

Statuts d'une fiche : `draft` → (première version approuvée) `published` ; `unlisted` (retirée
par son créateur, remise en vente possible) ; `removed` (retirée par la modération, définitif).
Statuts d'une version : `draft` → `in_review` → `published` | `rejected` (une version refusée
reste lisible par son créateur ; il en crée une nouvelle).

## 4. Parcours

### 4.1 Créateur

1. **Devenir créateur** : nom public et présentation (`PUT /v1/marketplace/me/creator`).
2. **Nouvelle fiche** (brouillon) : titre, résumé, description, système, licence, crédits,
   étiquettes, avertissements, prix (0 tant que la vente est coupée), couverture et galerie.
3. **Composer le pack** depuis une campagne dont il est MJ : il coche des scènes, des modèles de
   PNJ et d'objets ; le navigateur lit ces éléments (routes existantes), construit le
   `PackContent` (fonction pure, testée) et l'envoie (`PUT …/versions/:id/content`). marketplace
   valide, copie les fichiers, range le document, compte les éléments.
4. **Soumettre** la version (numéro `x.y.z` croissant, notes de version, attestation des droits).
5. **Revue** par un modérateur : publiée (la fiche aussi, à la première) ou refusée (motif).
6. Ensuite : nouvelle version (même parcours), fiche modifiable à tout moment (une fiche publiée
   modifiée revient dans la file « À revoir » des modérateurs), retrait et remise en vente.
7. **Vendre** : bouton « Activer les ventes » → onboarding Stripe Connect (billing) ; tableau des
   ventes et accès au tableau de bord Stripe Express (versements, factures).

### 4.2 Acheteur

1. **Catalogue** `/marketplace` : recherche (titre, résumé, étiquettes, créateur ; sans accents),
   filtres système, type de contenu, gratuit / payant ; tris populaires, récents, mieux notés,
   prix. Une fiche retirée ou en brouillon n'y apparaît jamais.
2. **Fiche** `/marketplace/<slug>` : galerie, description, contenu (comptes), licence,
   avertissements, versions et notes, avis ; « Obtenir » (gratuit) ou « Acheter 4,99 € »
   (Checkout, retour sur la fiche), « Installer » si déjà acquis.
3. **Bibliothèque** `/marketplace/library` : acquisitions, version la plus récente, campagnes où
   le pack est installé et en quelle version ; « Installer » / « Mettre à jour ».
4. **Avis** : acquéreurs seulement (« avis vérifiés »), une note 1–5 et un commentaire par compte,
   modifiable ; jamais sur sa propre fiche.

### 4.3 Installation

1. `POST /v1/marketplace/library/:listingId/installs { campaignId }` : acquisition active, MJ de
   la campagne (droits demandés à campaign), fiche non retirée par la modération → `install`
   (`started`) et le contenu de la dernière version publiée.
2. Le navigateur applique le pack par les routes existantes, dans cet ordre : modèles d'objets,
   catégorie « <titre du pack> » puis modèles de PNJ (seulement si le système du pack est celui
   de la campagne, sinon ignorés et signalés), scènes (création, puis murs, lumières, pièces et
   objets par lots de 500). Chaque écriture porte un `Idempotency-Key` dérivé de l'installation
   et de l'étape : relancer après une coupure ne double rien dans les 24 h.
3. `POST /v1/marketplace/installs/:id/complete { created }` → `done`, événement
   `marketplace.pack_installed` dans la campagne (MJ seulement).

Une mise à jour **installe la nouvelle version à côté** (nouvelles scènes, nouveaux modèles) :
jamais d'écrasement de ce que le MJ a pu modifier. L'écran montre la version installée par
campagne.

## 5. Paiement (billing)

### 5.1 Modèle Stripe

- **Comptes connectés** : Accounts v2 (`/v2/core/accounts`), tableau de bord **Express**,
  configuration `merchant` (paiements par carte, versements), responsabilités frais et pertes à
  la plateforme (`fees_collector`, `losses_collector` : `application`). Onboarding hébergé par
  Stripe (Account Link `account_onboarding`), connexion au tableau de bord Express (lien de
  connexion) pour les versements et les factures.
- **Ventes** : Checkout hébergé, `mode: payment`, prix de la fiche en `price_data`
  (`tax_behavior: inclusive` ; un prix Stripe par fiche n'aurait pas de sens), **charge de
  destination** `on_behalf_of` + `transfer_data.destination` = compte du créateur,
  `application_fee_amount` = commission. Le créateur est le vendeur : la facture est émise **en
  son nom** (`invoice_creation.invoice_data.issuer = { type: 'account', account }`).
- **Commission** : 15 % du prix TTC, 0,50 € au moins (`MARKETPLACE_FEE` dans `@vtt/contracts`,
  même calcul affiché au créateur et prélevé par billing). Les frais Stripe sont à la charge de la
  plateforme. Prix : 0 (gratuit) ou de 2 € à 200 €.
- **Remboursement et contestation** : `charge.refunded` (total) et `charge.dispute.created` →
  vente remboursée ou contestée → acquisition révoquée. Un remboursement se fait depuis le
  tableau de bord Stripe avec « Rembourser les frais d'application » et « Annuler le transfert ».

### 5.2 Ajouts à billing

| Route                                 | Rôle                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `GET  /v1/billing/connect/me`         | vente activée sur ce serveur, état du compte du créateur              |
| `POST /v1/billing/connect/onboarding` | crée le compte connecté s'il manque, rend le lien d'onboarding Stripe |
| `POST /v1/billing/connect/refresh`    | relit le compte chez Stripe (retour de l'onboarding)                  |
| `POST /v1/billing/connect/dashboard`  | lien de connexion au tableau de bord Express                          |
| `GET  /v1/billing/connect/sales`      | ventes du créateur : montant, commission, net, statut                 |
| `POST /v1/billing/connect/webhook`    | événements des comptes connectés (signés, secret à part)              |
| `POST /internal/marketplace/checkout` | session de vente demandée par marketplace (secret interne)            |

- Tables : `connected_accounts` (un compte par utilisateur), `marketplace_sales` (une par session
  Checkout : acheteur, vendeur, fiche, montant, commission, statuts, `consent_at`).
- Événements : `billing.connect_account_updated` (état complet, versionné comme les droits),
  `billing.marketplace_sale_completed`, `billing.marketplace_sale_refunded`,
  `billing.marketplace_sale_disputed` ; contrats dans `@vtt/contracts/billing`.
- Le retour de Checkout (`/paiement/succes`) connaît le type `marketplace` et renvoie sur la
  fiche ; la liste « Achats » du compte inclut les packs achetés.
- Réglages : `STRIPE_CONNECT=off` par défaut (routes 503 `connect_disabled`),
  `STRIPE_CONNECT_WEBHOOK_SECRET`, `INTERNAL_API_SECRET`. Côté marketplace,
  `MARKETPLACE_PAID_LISTINGS=off` par défaut : un prix non nul est refusé (422
  `paid_listings_disabled`) et l'écran ne propose que le gratuit.

### 5.3 Fil d'une vente

```
POST /v1/marketplace/listings/:id/checkout  (acheteur)
  marketplace : fiche publiée, payante, pas à soi, pas déjà acquise, créateur payouts_ready
  → POST /internal/marketplace/checkout (billing) : compte du vendeur actif, commission,
    session Checkout, ligne marketplace_sales « pending » → { url }
Stripe Checkout → webhook checkout.session.completed (billing)
  → marketplace_sales « completed » + billing.marketplace_sale_completed (outbox)
  → bus → marketplace (durable marketplace-events) : acquisition « purchase »
```

Le retour de l'acheteur peut précéder le webhook : la fiche interroge marketplace jusqu'à
l'acquisition (comme la boutique de dés).

## 6. API marketplace (via la gateway, `/v1/marketplace`)

### 6.1 Lecture

| Route                                         | Réponse                                                                |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `GET /config`                                 | vente activée, commission, bornes de prix, licences, avertissements    |
| `GET /me`                                     | profil de créateur (ou null), modérateur                               |
| `GET /listings?q&system&kind&price&sort&page` | catalogue (20 par page, total)                                         |
| `GET /listings/:slugOrId`                     | fiche publique, possession, versions publiées, mon avis                |
| `GET /listings/:id/reviews?page`              | avis                                                                   |
| `GET /creators/:slug`                         | créateur et ses fiches publiées                                        |
| `GET /library`                                | mes acquisitions, dernière version, installations                      |
| `GET /library/:listingId/content`             | contenu de la dernière version publiée (acquéreur)                     |
| `GET /studio/listings`                        | mes fiches, tous statuts                                               |
| `GET /studio/listings/:id`                    | ma fiche, ses versions                                                 |
| `GET /studio/versions/:id/content`            | contenu d'une de mes versions                                          |
| `GET /moderation/queue`                       | versions en revue, fiches à revoir, signalements ouverts (modérateurs) |
| `GET /moderation/versions/:id/content`        | contenu d'une version en revue                                         |

### 6.2 Écriture (chacune émet un événement, `event-guard.test.ts`)

| Route                                                   | Événement                                     |
| ------------------------------------------------------- | --------------------------------------------- |
| `PUT /me/creator`                                       | `marketplace.creator_registered` / `_updated` |
| `POST /studio/listings`                                 | `marketplace.listing_created`                 |
| `PATCH /studio/listings/:id`                            | `marketplace.listing_updated`                 |
| `DELETE /studio/listings/:id` (brouillon jamais publié) | `marketplace.listing_deleted`                 |
| `POST /studio/listings/:id/unlist` · `/relist`          | `marketplace.listing_unlisted` / `_relisted`  |
| `POST /studio/listings/:id/versions`                    | `marketplace.version_created`                 |
| `PUT /studio/versions/:id/content`                      | `marketplace.version_content_set`             |
| `PATCH /studio/versions/:id`                            | `marketplace.version_updated`                 |
| `POST /studio/versions/:id/submit`                      | `marketplace.version_submitted`               |
| `DELETE /studio/versions/:id` (brouillon)               | `marketplace.version_deleted`                 |
| `POST /listings/:id/acquire` (gratuit)                  | `marketplace.listing_acquired`                |
| `POST /listings/:id/checkout` (payant)                  | `marketplace.checkout_started`                |
| `PUT /listings/:id/review` · `DELETE`                   | `marketplace.review_posted` / `_deleted`      |
| `POST /listings/:id/reports`                            | `marketplace.listing_reported`                |
| `POST /library/:listingId/installs`                     | `marketplace.install_started` (campagne, MJ)  |
| `POST /installs/:id/complete`                           | `marketplace.pack_installed` (campagne, MJ)   |
| `POST /moderation/versions/:id/approve` · `reject`      | `marketplace.version_published` / `_rejected` |
| `POST /moderation/listings/:id/remove`                  | `marketplace.listing_removed`                 |
| `POST /moderation/listings/:id/recheck`                 | `marketplace.listing_rechecked`               |
| `POST /moderation/reviews/:listingId/:userId/delete`    | `marketplace.review_deleted`                  |
| `POST /moderation/reports/:id/dismiss`                  | `marketplace.report_resolved`                 |

Exception justifiée : `POST /studio/listings/:id/uploads` (URL d'envoi signée, rien d'écrit ; la
couverture est enregistrée ensuite par `PATCH`, tracé).

Charges utiles : identifiants, statuts, nombres et codes de motif seulement — jamais de titre,
description, commentaire ni détail de signalement (journal d'historique en ajout seul, sans texte
libre ni donnée personnelle). Visibilité `owner` hors campagne, `gm_only` dans une campagne.

### 6.3 Consommateur (durable `marketplace-events`)

| Événement                            | Effet                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------- |
| `billing.marketplace_sale_completed` | acquisition `purchase` (+1 sur la fiche) ; `marketplace.listing_acquired` |
| `billing.marketplace_sale_refunded`  | acquisition révoquée (`refund`) ; `marketplace.acquisition_revoked`       |
| `billing.marketplace_sale_disputed`  | idem (`dispute`)                                                          |
| `billing.connect_account_updated`    | `creators.payouts_ready` (dernière version appliquée seulement)           |
| `identity.user_deleted`              | voir § 9                                                                  |

### 6.4 Installation : pourquoi par le navigateur

L'installation réutilise les routes publiques de campaign et character : leurs droits (MJ), leur
validation (schémas stricts de la carte, état du système recalculé par `@vtt/rules`), leurs
événements (l'historique montre chaque scène créée) et le quota, sans nouveau contrat entre
services ni accès de marketplace aux données de jeu. Les risques — installation interrompue,
double clic — sont couverts par l'idempotence de chaque écriture et le suivi `installs`.
Alternative écartée pour la v1 : une saga par le bus (`marketplace.install_requested` consommé
par campaign et character, qui écriraient en masse puis répondraient) — atomique par service mais
deux consommateurs lourds à écrire dans les services les plus chargés, pour un gain faible tant
qu'un pack reste petit (20 scènes au plus).

## 7. Modération et confiance

- **Modérateurs** : `MARKETPLACE_MODERATORS` (identifiants de comptes, séparés par des virgules)
  dans marketplace. Il n'y a pas de rôle d'administration dans identity : un rôle dédié pourra
  remplacer cette liste sans toucher aux routes (`requireModerator`).
- **Revue avant publication** : chaque version passe en revue. Approuver publie ; refuser exige un
  motif (`rights`, `adult`, `hateful`, `quality`, `broken`, `misleading`, `other`) et une note au
  créateur.
- **Fiche modifiée après publication** : appliquée tout de suite, marquée « à revoir » pour un
  contrôle a posteriori (la couverture ou le texte peuvent changer).
- **Signalements** : tout membre, un signalement ouvert par fiche et par compte, motifs
  `copyright`, `adult`, `hateful`, `broken`, `misleading`, `other`, détails facultatifs ; 5 par
  heure. Le modérateur classe ou retire.
- **Retrait** (`removed`, définitif) : hors catalogue, plus d'acquisition ni d'installation ; les
  acquéreurs gardent ce qui est déjà installé. Motif `copyright` : en plus, **purge des fichiers**
  de la fiche sur R2 (notification d'un ayant droit) — les scènes installées perdent leurs images.
- **Contenu** : contenu sexuel explicite interdit (refusé en revue, retiré sur signalement) ;
  violence, horreur, gore, drogues, phobies balisés (`content_warnings`), affichés sur la fiche et
  filtrables.
- **Licence** : déclarée par fiche (`personal` usage personnel, `cc-by-4.0`, `cc-by-sa-4.0`,
  `cc-by-nc-4.0`, `cc0-1.0`, `ogl-1.0a`, `orc`), crédits libres (`attribution`) pour les éléments
  tiers ; attestation des droits horodatée à chaque soumission.
- **Limites** : 20 fiches non publiées par créateur, une version en cours par fiche, 10
  soumissions par jour, contenu JSON de 8 Mo, 400 fichiers et 500 Mo par version, 8 images de
  galerie ; débits par minute sur l'écriture (envois 30, contenu 10, signalements 5/h).

## 8. Front

- `lib/marketplace/` : client (`marketplaceApi`, clés TanStack Query), `pack-builder.ts`
  (campagne → `PackContent`, pur et testé), `installer.ts` (plan d'installation et exécution
  idempotente, testé), `format.ts` (prix, licences, statuts).
- `components/marketplace/` : vitrine (tuiles et filtres, même langage que la boutique de dés),
  fiche produit, bibliothèque, studio du créateur (fiches, éditeur, composeur, versions, ventes),
  file de modération.
- Routes : `/marketplace`, `/marketplace/[slug]`, `/marketplace/library`, `/marketplace/studio`,
  `/marketplace/studio/[id]`, `/marketplace/moderation`, `/marketplace/creators/[slug]` ;
  entrée « Marketplace » dans la barre latérale.
- Aucun texte d'aide visible (infobulles), pas d'icône `Sparkles`, couleurs par variables.

## 9. Comptes supprimés

`identity.user_deleted` : ses acquisitions, avis (notes de fiches recalculées), installations et
signalements (auteur effacé, signalement gardé) sont supprimés ; ses fiches publiées sont
retirées (`unlisted`, créateur « Créateur supprimé ») mais leurs fichiers restent pour les
acquéreurs ; son profil de créateur est supprimé. Dans billing : son compte connecté est oublié
(à clôturer dans Stripe), ses achats supprimés comme les autres achats ; les ventes dont il est
le vendeur gardent son identifiant (sans donnée personnelle) pour la comptabilité.

## 10. Décisions prises

| Sujet          | Décision                                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Où vit le code | Nouveau service `marketplace` ; Stripe reste dans billing ; installation par les routes existantes de campaign et character     |
| Contenu v1     | Scènes (murs, lumières, pièces, objets), modèles de PNJ et d'objets ; pas de documents, sons, portails ni skins de dés          |
| Format         | `PackContent` versionné (`format: 1`) dans `@vtt/contracts`, schémas de la carte réutilisés                                     |
| Fichiers       | Copiés à l'envoi dans `marketplace/<fiche>/assets/`, immuables, cités par les campagnes (hors quota) ; sources : notre stockage |
| Versions       | `x.y.z` croissant, une seule en cours, revue à chaque version, mise à jour installée à côté (jamais d'écrasement)               |
| Commission     | 15 % TTC, minimum 0,50 € ; frais Stripe pour la plateforme ; prix 2 € à 200 €                                                   |
| Stripe         | Accounts v2 Express, charges de destination `on_behalf_of`, facture émise au nom du créateur, `price_data` par fiche            |
| Interrupteurs  | `STRIPE_CONNECT=off` (billing) et `MARKETPLACE_PAID_LISTINGS=off` (marketplace) par défaut : la v1 tourne en gratuit seulement  |
| Modération     | Revue avant publication, contrôle a posteriori des fiches modifiées, liste `MARKETPLACE_MODERATORS`, purge sur droit d'auteur   |
| Adultes        | Contenu sexuel exclu ; thèmes durs balisés par avertissements                                                                   |
| Avis           | Acquéreurs seulement, un par compte, note 1–5 et commentaire, pas sur sa propre fiche                                           |
| Recherche      | `tsvector` généré (configuration `simple`) sur un texte sans accents tenu par le service ; préfixes                             |
| Catalogue      | Réservé aux comptes connectés (comme le reste de l'app) ; public en v2                                                          |
| Classement     | Populaires = acquisitions, mieux notés = moyenne bayésienne (5 avis à 3,5 de base), récents = date de publication               |

## 11. Mise en route

### Local

1. Rôles et migrations : `pnpm dev` (ou, à la main, `infra/postgres/init/10-schemas-and-roles.sql`
   dans psql, puis `bash infra/postgres/liquibase/migrate.sh marketplace update` et
   `… billing update`).
2. `backend/marketplace/.env` (copié depuis `.env.example`) : valeurs `R2_*` du staging comme
   les autres services ; son identifiant de compte dans `MARKETPLACE_MODERATORS` pour voir
   l'onglet « Modération ».
3. Gateway : `UPSTREAM_MARKETPLACE_URL=http://localhost:3011` (dans `.env.example`, complété
   par `pnpm dev`).

### Parcours à l'écran (gratuit)

1. **Marketplace › Studio** : « Créer mon profil de créateur », puis « Nouveau pack ».
2. Dans l'éditeur : titre, résumé, couverture (exigée pour soumettre), « Enregistrer ».
3. **Versions › Nouvelle version**, « Composer » : choisir une campagne dont on est MJ, cocher
   des scènes et des modèles, « Envoyer » (les fichiers sont copiés dans `marketplace/`).
4. Cocher « Je détiens les droits sur tout ce contenu », « Soumettre à la revue ».
5. Avec un compte modérateur : **Modération › En revue**, « Contenu », « Publier ».
6. Avec un autre compte : **Catalogue**, ouvrir la fiche, « Obtenir gratuitement »,
   « Installer » dans une de ses campagnes : scènes (murs, lumières, objets) et modèles
   apparaissent dans la campagne ; **Bibliothèque** montre la version installée.
7. Avis, « Signaler », puis en modération « Retirer » (motif « Droits non établis » : fichiers
   purgés).

### Vente

Voir [paiement.md](paiement.md), « Marketplace : vente des packs par Stripe Connect ». Tests :
`backend/billing/src/modules/connect/connect.int.test.ts` (Stripe et Connect simulés).

### Tests

```sh
TEST_DATABASE_URL=postgres://marketplace_svc:marketplace-dev@localhost:5432/vtt \
  pnpm --filter @vtt/marketplace test
TEST_DATABASE_URL=postgres://billing_svc:billing-dev@localhost:5432/vtt \
  pnpm --filter @vtt/billing test
bash infra/postgres/tests/marketplace-droits.sh
```

## 12. Déploiement (à faire par Théo)

- `infra/gitops/<env>/marketplace.yaml` (chart commun, sur le modèle d'audio) : port 3011,
  `DATABASE_URL` (secret `pg-marketplace`), job de migrations (`marketplace-migrations`, secret
  `pg-marketplace-owner`), `NATS_URL`, `REDIS_URL`, `JWT_*`, `JWKS_URL`, `INTERNAL_API_SECRET`,
  `CAMPAIGN_URL`, `BILLING_URL`, `R2_*`, `MARKETPLACE_MODERATORS`,
  `MARKETPLACE_PAID_LISTINGS=off`. NetworkPolicies : gateway → marketplace ; marketplace →
  campaign et billing (routes internes).
- Gateway : `UPSTREAM_MARKETPLACE_URL`. billing : `INTERNAL_API_SECRET`, `STRIPE_CONNECT=off`.
- Secrets scellés `pg-marketplace` et `pg-marketplace-owner` (`infra/cluster/secrets`), **puis**,
  dans le même changement, les rôles `marketplace_owner` et `marketplace_svc` dans
  `infra/cluster/data/postgres-cluster.yaml` (`managed.roles`, sur le modèle d'audio). Ce
  dossier est synchronisé par Argo CD : déclarer les rôles avant leurs secrets mettrait le
  cluster en erreur de réconciliation (retirés à l'assemblage pour cette raison). Sur une base
  existante, appliquer ensuite `infra/cluster/data/schemas.sql` (idempotent) pour créer le
  schéma.
- La release met à jour l'image de marketplace dès que son fichier GitOps existe (sinon elle
  l'ignore, `release.yml`).
