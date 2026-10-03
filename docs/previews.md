# Environnements éphémères (previews)

Un environnement complet par pull request, créé à la demande et détruit avec elle. À monter
**après** le staging (`docs/deploiement.md`), sur la même chaîne : images signées, Argo CD,
Sealed Secrets, Kyverno.

## Règles (décidées le 2026-10-03)

- **Déclencheur** : une PR qui porte le label `preview`, ouverte depuis une branche du dépôt
  (jamais un fork : le dépôt est public). Fermeture de la PR ou retrait du label : tout est
  supprimé, base comprise.
- **Capacité** : 2 previews au plus en même temps (≈ 2 Go chacune ; le cluster a ≈ 6 Go libres
  une fois le staging en place). Au-delà, la CI refuse de construire et le dit sur la PR.
- **Données** : copie du staging au moment de la création (dernier `pg_dump` chiffré de la
  sauvegarde logique, restauré dans la base de la preview).
- **Adresse** : `pr-<n>.preview.yner.fr` (front et `/v1`), DNS joker `*.preview.yner.fr` vers
  `76.13.44.160`, un certificat Let's Encrypt par preview (résolveur Traefik, HTTP-01).

## Fonctionnement

```
PR + label preview ──► ci.yml (job preview) : images taguées pr-<n>-<sha>, signées
        │
        ▼
ApplicationSet vtt-previews (générateur pullRequest GitHub, filtre label)
        │  une Application par PR, chart infra/helm/preview
        ▼
namespace vtt-pr-<n> : Postgres (CNPG, 1 instance, 1 Gi), NATS, Valkey, 11 services, web
        Job de copie (restaure le dump du staging) puis Jobs de migration, puis services
```

- **Tout dans le namespace** : base, bus et cache sont propres à la preview ; supprimer le
  namespace (finalizer Argo CD) emporte tout, volumes compris.
- **Images** : tag `pr-<n>-<sha>` passé par le générateur (pas de digests commités par PR) ;
  Kyverno admet les signatures du workflow `ci.yml` sur `refs/pull/*` en plus de `release.yml`.
- **Secrets** : les valeurs externes (R2, OAuth) dans un SealedSecret de portée cluster, copié
  dans chaque preview ; les secrets internes (rôles Postgres, JWT, NATS, Valkey, secret interne)
  générés par un Job à la création de la preview.

## Pièges à traiter

- **Fichiers** : la copie référence les fichiers du staging (mêmes URL publiques). Une preview
  écrit sous un préfixe à elle (`previews/pr-<n>/`) et n'a jamais le nettoyage des orphelins
  actif (`ORPHAN_SWEEP: off`), sinon elle supprimerait des fichiers du staging.
- **E-mails** : `SMTP_URL` absent (aucun e-mail réel depuis une preview).
- **OAuth** : les fournisseurs n'acceptent pas de joker dans les URL de retour ; connexion par
  e-mail et mot de passe seulement (comptes du staging copiés).
- **Paiements** : Stripe absent.
- **Charge** : jobs de copie et de migration en série, ressources minimales, une réplique.
