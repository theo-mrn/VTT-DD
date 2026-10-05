# Paiement (service billing)

Conception du paiement de Yner : abonnement premium, achats à l'unité, factures, e-mails,
droits. Ce document fait foi ; le code de `backend/billing` le suit.

## Ce qui est vendu

| Offre           | Mode Stripe                                              | Droit donné                                                           |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------------------- |
| Premium mensuel | abonnement, 4,99 €/mois                                  | tous les skins de dés (présents et futurs), badge et bordures premium |
| Premium annuel  | abonnement, prix annuel réduit (à fixer, ex. 49,90 €/an) | idem                                                                  |
| Skin de dés     | paiement unique                                          | le skin, à vie                                                        |
| Cadre de jeton  | paiement unique                                          | le cadre, à vie                                                       |

Les fonctionnalités de l'ancienne app sont toutes gardées : achat d'un skin ou d'un cadre,
abonnement, résiliation, portail client, liste des factures, import des premiums et clients
Stripe existants.

## Décisions

| Sujet     | Choix                                                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Paiement  | Stripe Checkout hébergé (redirection, retour sur Yner). Apple Pay, Google Pay et 3-D Secure gérés par Stripe.                                          |
| Offre     | Mensuel et annuel, changement de formule depuis le compte (portail Stripe).                                                                            |
| TVA       | Pas de TVA au démarrage, conçu pour activer Stripe Tax sans rien refaire (voir « TVA »).                                                               |
| Droits    | billing tient la table des droits et publie des événements ; dice et identity les appliquent. Plus aucun appel HTTP de billing vers eux.               |
| E-mails   | Envoyés par billing via Kourrier (templates `infra/mails/templates/yner/`). Les e-mails de Stripe aux clients sont désactivés, pour ne jamais doubler. |
| Factures  | Émises et numérotées par Stripe (numérotation légale continue). Yner les liste et les envoie par e-mail avec le lien de la facture et du PDF.          |
| Catalogue | Défini dans le dépôt (`catalog/`), poussé dans Stripe (produits et prix) par un script, retrouvé par `lookup_key`. Plus de prix envoyé à la volée.     |

## TVA

- Tous les prix Stripe sont créés en `tax_behavior: inclusive` : le prix affiché (4,99 €) est le
  prix payé, avec ou sans TVA.
- Démarrage sans TVA : la mention « TVA non applicable, art. 293 B du CGI » est posée en pied de
  facture (réglage Stripe _Invoice template_), tant que le statut n'est pas décidé.
- Passage à la TVA plus tard : activer Stripe Tax dans le tableau de bord, puis `STRIPE_TAX=on`
  dans billing (ajoute `automatic_tax` aux sessions). L'adresse de facturation est déjà collectée
  (`billing_address_collection: auto`), aucune autre modification.

## Obligations légales (vente en ligne à des particuliers)

- **CGV** : page publique `/cgv` liée dans Checkout (`consent_collection.terms_of_service:
required`, URL déclarée dans Stripe). Texte à fournir ou valider par Théo.
- **Droit de rétractation** : pour un contenu numérique livré tout de suite (skin, premium),
  l'acheteur renonce expressément à son droit de rétractation (art. L221-28 13° du Code de la
  consommation). Texte affiché dans Checkout (`custom_text.terms_of_service_acceptance`) et accord
  enregistré avec l'achat (`consent.terms_of_service` de la session).
- **Reconduction tacite (loi Chatel)** : l'abonné annuel est prévenu par e-mail 30 jours avant le
  renouvellement, avec la date et le lien pour résilier. Tâche planifiée dans billing (voir
  « Tâches planifiées »).
- **Résiliation en trois clics** : bouton « Résilier » directement dans le compte, sans passer par
  le portail.

## Modèle de données (schéma `billing`)

```
customers       user_id (pk), stripe_customer_id (unique), email, created_at, updated_at
subscriptions   id (= sub_… Stripe, pk), user_id, plan (monthly | annual | legacy),
                status (incomplete | trialing | active | past_due | canceled | unpaid | …),
                price_id, current_period_start, current_period_end, cancel_at, canceled_at,
                ended_at, stripe_updated_at, created_at, updated_at
purchases       (existe) + status refunded, refunded_at, consent_at
invoices        id (= in_… Stripe, pk), user_id, subscription_id, number, status,
                amount_paid, currency, hosted_url, pdf_url, period_start, period_end, created_at
entitlements    id, user_id, kind (premium | dice_skin | token_frame), item_id,
                source (subscription | purchase | legacy | gift), source_id,
                granted_at, revoked_at, revoke_reason
processed_events, outbox, inbox   (existent)
```

- `entitlements` est la source de vérité des droits. Premium actif ⇔ une ligne `premium` non
  révoquée. Les colonnes `premium*` de `customers` disparaissent (migration qui recopie l'état).
- `subscriptions` garde l'historique : un abonné qui résilie puis revient a deux lignes.
- `invoices` est un miroir local alimenté par les webhooks : la liste des factures ne dépend plus
  d'un appel à Stripe à chaque affichage.

## Webhook

Principe gardé : signature vérifiée sur le corps brut, `processed_events` pour l'idempotence,
réponse 500 sans marquer l'événement en cas d'échec (Stripe relivre jusqu'à 3 jours).

Changement : Stripe ne garantit pas l'ordre des événements. Pour un abonnement ou une facture, le
traitement **relit l'objet chez Stripe** (état le plus récent) au lieu de croire la charge utile,
et ignore un état plus ancien que `stripe_updated_at`. Un événement en retard ne peut plus
réactiver un premium terminé.

| Événement                                                | Effet                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `checkout.session.completed`, `…async_payment_succeeded` | achat : droit accordé, e-mail de confirmation ; abonnement : synchronisé        |
| `checkout.session.async_payment_failed`, `…expired`      | achat abandonné                                                                 |
| `customer.subscription.created/updated/deleted`          | `subscriptions` synchronisée ; droit premium accordé ou révoqué selon le statut |
| `invoice.paid`                                           | `invoices` ; e-mail de facture                                                  |
| `invoice.payment_failed`                                 | e-mail « paiement échoué » avec le lien pour changer de carte                   |
| `charge.refunded`                                        | achat remboursé : droit révoqué, e-mail                                         |
| `charge.dispute.created`                                 | droit de l'achat contesté révoqué, alerte dans les logs                         |
| `customer.updated`                                       | e-mail de facturation recopié                                                   |

Statuts d'abonnement qui donnent le premium : `trialing`, `active`, `past_due` (Stripe relance
encore la carte : on laisse le premium pendant les relances). `unpaid`, `canceled`,
`incomplete_expired` : premium révoqué.

## Droits par événements

```
billing : entitlements + rights_versions + INSERT outbox (même transaction)
   └─► bus  vtt.global.billing.entitlements_changed
            { userId, version, premium, diceSkins[], tokenFrames[] }   (@vtt/contracts)
          ├─► dice      (durable dice-rights)      accès à tous les skins, inventaire « purchase »
          └─► identity  (durable identity-rights)  badge et bordures premium
```

- L'événement porte **l'état complet** des droits de l'utilisateur et une `version` croissante
  (`billing.rights_versions`), pas un « +1 skin » : un consommateur applique le dernier état reçu
  et ignore une version plus ancienne ou égale (`dice.billing_rights`,
  `identity.billing_rights`). L'ordre et les doublons sont sans effet.
- Publié seulement quand un droit change, dans la transaction du changement : pas de droit sans
  événement, ni d'événement sans droit.
- dice n'aligne que l'inventaire de source `purchase` : les skins importés de l'ancienne app,
  offerts ou gagnés ne sont jamais retirés. Un skin remboursé est retiré (`dice.skin_revoked`).
- Les consommateurs relisent tout le flux (7 jours) à leur création ; un service arrêté rattrape
  à son retour.
- Réalignement manuel (base de dice ou d'identity restaurée…) :
  `pnpm --filter @vtt/billing rights:republish [--user <uuid>]`, qui republie l'état de chacun.
- Les routes internes `PUT /internal/users/…` de dice et identity sont supprimées.

## E-mails

billing consomme ses propres événements (durable `billing-mails`, sur `vtt.global.billing.>`) et
envoie à Kourrier avec `idempotency-key = id de l'événement` : un e-mail n'est jamais envoyé deux
fois, et un e-mail part même si Kourrier était coupé au moment du paiement (message relivré). Un
refus définitif de Kourrier (template absent…) est journalisé et abandonné. À sa création, le
consommateur ne lit que les événements à venir : un déploiement n'envoie rien pour le passé.

| Template (`yner/<nom>/fr/`) | Déclencheur                                                                 |
| --------------------------- | --------------------------------------------------------------------------- |
| `premium-active`            | facture payée, création d'abonnement (`billing_reason` subscription_create) |
| `facture`                   | facture payée, renouvellement ou changement de formule (montant > 0)        |
| `achat-confirme`            | facture payée d'un achat à l'unité (facture créée par Checkout)             |
| `paiement-echoue`           | `billing.invoice_payment_failed` : lien pour régler la facture              |
| `resiliation-programmee`    | `billing.subscription_cancellation_scheduled` : date de fin                 |
| `premium-termine`           | `billing.subscription_ended`                                                |
| `remboursement`             | `billing.purchase_refunded`                                                 |
| `rappel-reconduction`       | abonnement annuel, 30 jours avant le renouvellement (lot 5)                 |

- Les confirmations partent sur la **facture payée** (et non sur l'achat) : chaque e-mail porte le
  numéro de facture et ses liens (en ligne et PDF), relus dans `billing.invoices`.
- Destinataire : `customers.email`, l'e-mail du client Stripe saisi dans Checkout, suivi par
  `customer.updated`. Sans e-mail connu (premium importé), rien n'est envoyé.
- Templates à publier sur R2 (`bash infra/mails/publier.sh`) **avant** de déployer billing.

## API (via la gateway)

| Route                                    | Rôle                                                            |
| ---------------------------------------- | --------------------------------------------------------------- |
| `GET  /v1/billing/plans`                 | formules et prix (depuis le catalogue)                          |
| `GET  /v1/billing/me`                    | formule, statut, fin de période, résiliation, paiement en échec |
| `POST /v1/billing/subscribe { plan }`    | session Checkout d'abonnement                                   |
| `POST /v1/billing/subscription/cancel`   | résiliation en fin de période                                   |
| `POST /v1/billing/subscription/resume`   | annule une résiliation programmée                               |
| `POST /v1/billing/portal`                | portail Stripe : carte, changement de formule, factures         |
| `POST /v1/billing/checkout { itemId }`   | session Checkout d'un achat                                     |
| `GET  /v1/billing/checkout/sessions/:id` | état au retour de Checkout                                      |
| `GET  /v1/billing/invoices`              | factures (miroir local)                                         |
| `GET  /v1/billing/purchases`             | achats                                                          |
| `POST /v1/billing/webhook`               | Stripe (public, signé)                                          |

## Front

- **Compte → Abonnement** (`/profil/abonnement`, onglet du compte) : sans premium, choix mensuel ou
  annuel (économie affichée) et « Devenir Premium » ; avec premium, formule, prochain prélèvement
  ou date de fin, alerte si le paiement a échoué (« Mettre à jour ma carte »), Résilier (dialogue
  de confirmation) ou Reprendre, Gérer le paiement (portail Stripe) ; factures (lien en ligne et
  PDF) et achats (remboursés barrés).
- **Boutique de dés** : bouton d'achat au prix de l'article (Stripe Checkout, retour sur la page
  courante) ; onglet Premium vers la page Abonnement.
- **Retour de Checkout** : `/paiement/succes` interroge billing jusqu'à la confirmation (le
  webhook peut arriver après le retour), rafraîchit les dés possédés, puis « Continuer » ramène à
  la page d'origine ; `/paiement/annule`.
- Chemins partagés avec le backend par `PAGES_FRONT` (`@vtt/contracts`) : retours de Checkout,
  liens des e-mails.
- **`/cgv`** : lot 5.

## Tâches planifiées (dans billing, verrou consultatif : un seul réplica)

- **Réconciliation** (chaque nuit) : relit chez Stripe les abonnements non terminés et les compare
  à la base ; corrige et journalise tout écart (webhook perdu).
- **Rappel de reconduction** (chaque jour) : abonnements annuels qui se renouvellent dans 30 jours,
  e-mail une seule fois par période.

## Exploitation

- Staging en mode test Stripe, prod en mode live ; une configuration de portail par mode.
- Catalogue : `pnpm --filter @vtt/billing catalog:sync` crée ou met à jour produits et prix
  (`lookup_key` = identifiant du catalogue). Un prix Stripe ne change jamais : un nouveau prix
  reprend la `lookup_key`, les abonnés existants gardent l'ancien tarif.
- Dev : `stripe listen --forward-to localhost:8080/v1/billing/webhook`.
- Observabilité : métriques `billing_payments_total{kind,outcome}`, `billing_webhook_failures_total`,
  panneau dans le tableau de bord Grafana ; alerte si un webhook échoue plus d'une heure.
- Abonnements de l'ancienne app (prix créés à la volée) : honorés tels quels, formule `legacy`,
  jusqu'à leur résiliation.

## Mise en route d'un compte Stripe (staging en mode test, prod en live)

1. **Produits et prix** : `STRIPE_SECRET_KEY=… pnpm --filter @vtt/billing catalog:sync` (simulation),
   puis `--apply`. À relancer après tout changement de prix dans `catalog/`.
2. **Endpoint du webhook** (_Developers → Webhooks_) : `https://api.<env>/v1/billing/webhook`,
   événements :
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `customer.subscription.created`, `customer.subscription.updated`,
   `customer.subscription.deleted`, `customer.subscription.paused`,
   `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_failed`,
   `invoice.finalized`, `invoice.voided`, `invoice.marked_uncollectible`, `charge.refunded`,
   `charge.dispute.created`, `customer.updated`. Son `whsec_…` va dans `STRIPE_WEBHOOK_SECRET`.
3. **Portail client** (_Settings → Billing → Customer portal_) : mise à jour du moyen de paiement,
   historique des factures, résiliation **en fin de période**, changement de formule entre les
   deux prix du produit _Yner Premium_.
4. **Relances** (_Settings → Billing → Subscriptions and emails_) : Smart Retries, puis
   **annuler l'abonnement** quand toutes les tentatives ont échoué.
5. **Factures** (_Settings → Billing → Invoice template_) : pied de page « TVA non applicable,
   art. 293 B du CGI » tant que la TVA n'est pas décidée.
6. **E-mails de Stripe aux clients** : à couper seulement quand le lot 3 (e-mails Kourrier) est en
   ligne, sinon plus personne ne reçoit de reçu.
7. **Rattrapage** des clients de l'ancienne app : `pnpm --filter @vtt/billing stripe:backfill`
   (abonnements et factures recopiés, sans e-mail).

## Lots

1. **Données et abonnement** (fait le 2026-10-05) : migrations (`subscriptions`, `invoices`, `entitlements`), catalogue
   Stripe et `catalog:sync`, abonnement mensuel et annuel, webhook refondu (relecture chez Stripe,
   remboursements, contestations), résiliation et reprise.
2. **Droits par événements** (fait le 2026-10-05) : relais d'outbox de billing, consommateurs
   dans dice et identity, `rights:republish`, retrait des appels HTTP.
3. **E-mails** (fait le 2026-10-05) : templates Kourrier, consommateur `billing-mails`.
4. **Front** (fait le 2026-10-05) : page Abonnement, boutique active, retours de Checkout.
5. **Légal et mise en ligne** : CGV, consentement, rappel de reconduction, réconciliation,
   configuration du portail, clés live.
