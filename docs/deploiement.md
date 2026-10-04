# Déploiement continu

Livraison sur le cluster k3s de Théo (3 nœuds amd64, 2 vCPU et 8 Go chacun), géré par Argo CD
depuis le dépôt `argocd_registry`. Ce document fait foi pour la partie CD ; la CI est décrite
dans `docs/ci.md`.

## Principe

```
push main ──► release.yml : 18 images (services, migrations, web, worker audio)
                │            construites, signées (cosign keyless), SBOM + provenance
                ▼
              commit des digests dans infra/gitops/staging/*.yaml  [skip ci]
                │
                ▼
Argo CD (ApplicationSet vtt-services) ──► namespace vtt-staging
              Jobs de migration Liquibase (PreSync) puis Deployments
```

La CI ne touche jamais le cluster : elle écrit des digests dans Git, Argo CD synchronise.
Kyverno refuse dans `vtt-*` toute image `ghcr.io/theo-mrn/vtt-*` qui n'est pas signée par le
workflow de ce dépôt.

## Ce qui tourne où

| Namespace     | Contenu                                                               | Source                                                     |
| ------------- | --------------------------------------------------------------------- | ---------------------------------------------------------- |
| `vtt-staging` | 11 services + web, 1 réplique chacun                                  | `infra/gitops/staging/*.yaml` + chart `infra/helm/service` |
| `data`        | PostgreSQL `vtt-pg` (CNPG, 1 instance), PgBouncer, sauvegarde logique | `infra/cluster/data`, `infra/cluster/backup`               |
| `messaging`   | NATS JetStream, Valkey                                                | `infra/argocd/messaging.yaml`, `infra/messaging`           |
| `kyverno`     | contrôleur d'admission                                                | `argocd_registry` (`kyverno.yml`)                          |

Les Applications Argo CD de VTT sont décrites dans `infra/argocd/` ; une seule Application
`vtt` dans `argocd_registry` (app-of-apps, `prune: false` comme le reste du cluster) les
synchronise.

## Choix (2026-10-03)

- **Staging seul**, 1 réplique, pas d'autoscaling : la mémoire libre du cluster ne permet pas
  plus. Les fichiers `infra/gitops/prod/` restent prêts mais l'ApplicationSet ne les génère pas.
- **Sealed Secrets** (déjà sur le cluster) au lieu de SOPS : manifests chiffrés dans
  `infra/cluster/secrets/staging/`, produits par `infra/cluster/secrets/seal-staging.sh`.
- **Kyverno** installé pour vérifier les signatures à l'admission.
- **TLS** par le résolveur `letsencrypt` de Traefik (HTTP-01), pas de cert-manager.
- **Domaine** `yner.fr` : `staging.yner.fr` (web) et `api.staging.yner.fr` (gateway), en A
  vers `76.13.44.160` (LoadBalancer Traefik).
- **Fichiers** sur Cloudflare R2 (bucket applicatif), sauvegardes logiques dans un autre bucket.
- **PostgreSQL** en instance unique (décision du cluster, `docs/decisions/postgres-mono-instance.md`
  dans `argocd_registry`). Pas d'archivage WAL tant que le plugin Barman Cloud n'est pas installé
  (il exige cert-manager) : la sauvegarde est le `pg_dump` chiffré quotidien vers R2.
- **Observabilité** : pas de collecteur OTel sur le cluster pour l'instant ; l'exporteur est
  coupé (variable absente), les journaux JSON partent dans Loki par promtail.

## À fournir par Théo

1. **DNS** : `staging.yner.fr` et `api.staging.yner.fr` en A vers `76.13.44.160`. Le front et
   l'API partagent `staging.yner.fr` (Traefik envoie `/v1` à la gateway, WebSocket compris) ;
   `api.staging.yner.fr` sert aux retours OAuth et au webhook Stripe.
2. **`~/.config/vtt/staging.env`** (jamais commité), lu par `infra/cluster/secrets/seal-staging.sh` :
   - R2 applicatif : `R2_ENDPOINT`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
     `R2_PUBLIC_URL` (domaine public du bucket) ;
   - facultatif : `GOOGLE_CLIENT_ID/SECRET` et `DISCORD_CLIENT_ID/SECRET` (retours sur
     `https://api.staging.yner.fr/v1/auth/oauth/<fournisseur>/callback`), `KOURRIER_API_KEY`
     (envoi des e-mails : voir `infra/mails/README.md`),
     `STRIPE_*` (mode test), `FIREBASE_SCRYPT_*` (comptes importés) ;
   - sauvegarde : `BACKUP_R2_ACCESS_KEY_ID/SECRET_ACCESS_KEY` (bucket `vtt-logical-backups`,
     clé distincte), `BACKUP_VAULT_PASSWORD` et `BACKUP_VAULT_SALT` (chiffrement ; à garder
     aussi dans un gestionnaire de mots de passe, sans eux aucune restauration).
3. Lancer le script : il tire au hasard tout le reste (rôles Postgres, NATS, Valkey, secret
   interne, clés JWT Ed25519, secret d'envoi audio) et écrit les secrets scellés dans
   `infra/cluster/secrets/staging/`. Le relancer fait tourner tous ces secrets.

## Premier déploiement

1. Commiter les secrets scellés, fusionner sur `main` (la release construit les images et
   écrit leurs digests dans `infra/gitops/staging/`).
2. Pousser `kyverno.yml` puis `vtt.yml` dans `argocd_registry/kubernetes/system/argocd/apps/`
   (l'app racine les synchronise ; Kyverno n'intercepte que les namespaces étiquetés
   `kyverno.vtt/verify=true`, posé par l'ApplicationSet sur `vtt-staging`).
3. Argo CD crée `data`, `messaging`, puis `vtt-staging` ; les Jobs de migration passent avant
   chaque service.
4. Vérifier `https://staging.yner.fr` et `https://api.staging.yner.fr/healthz`.
