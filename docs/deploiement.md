# Déploiement continu

Livraison sur le cluster k3s de Théo (3 nœuds amd64, 2 vCPU et 8 Go chacun), géré par Argo CD
depuis le dépôt `argocd_registry`. Ce document fait foi pour la partie CD ; la CI est décrite
dans `docs/ci.md`.

## Principe

```
push main ──► release.yml : ~22 images (services, migrations, web, worker audio)
                │            reprises si inchangées, sinon construites, signées (cosign keyless), SBOM + provenance
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

### Images reprises (clé de contenu)

Chaque image a une **clé de contenu** : l'empreinte de ce qui y entre (dossier du service,
`backend/platform`, `packages`, lockfile, Dockerfile, arguments, variables du dépôt ; pour une
image de migration, son seul dossier `db`). Si `vtt-<image>:src-<clé>` existe déjà sur ghcr,
la release reprend son digest sans rien reconstruire : le fichier GitOps ne change pas, Argo CD
ne redéploie rien, les nœuds ne téléchargent rien. Le tag `src-<clé>` n'est posé qu'après
signature et attestation.

Pourquoi : jusqu'au 2026-10-08, chaque push reconstruisait et redéployait les ~22 images (digests
jamais identiques). Les nœuds accumulaient des dizaines de Go d'images ; le master a atteint
98 % de disque et le staging est tombé. Côté nœuds, le kubelet supprime désormais les images
inutilisées dès 70 % (rôle Ansible `kubelet_image_gc`, dépôt `infra`), et des alertes disque
(80 / 90 %) et processeur volé partent vers n8n (`node-alerts.yml`, dépôt `argocd_registry`).

Pour tout reconstruire quand même : changer `v1` dans l'étape `key` de release.yml.

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

## Production (décisions de Théo, 2026-10-09)

| Sujet    | Choix                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Base     | **Serveur PostgreSQL à part** : cluster CNPG `vtt-pg-prod` (namespace `data`), mêmes rôles que le staging mais d'autres mots de passe — les rôles sont écrits en dur dans les migrations, un serveur commun aurait partagé les identifiants |
| Données  | **Clonées une fois** depuis le staging (`pg_dump` de `vtt` → `vtt-pg-prod`), puis séparées                                                                                                                                                  |
| Fichiers | **Même bucket R2** que le staging (un fichier supprimé d'un côté disparaît de l'autre)                                                                                                                                                      |
| Adresses | **Provisoire d'abord** : `app.yner.fr` (front, `/v1` vers la gateway) et `api.yner.fr` (OAuth, webhooks) ; le legacy reste sur `yner.fr` (Vercel) jusqu'à validation, puis bascule                                                          |
| Stripe   | **Live partout** : la prod a son propre webhook live, le staging garde le sien                                                                                                                                                              |

### Étapes

1. **Base de prod** (dépôt) : `infra/cluster/data-prod/` (cluster `vtt-pg-prod`, une instance,
   réservation 512 Mo, 20 Go `local-path` ; pooler `vtt-pg-prod-pooler` ; sauvegarde logique
   quotidienne vers R2, préfixe `prod/`) et son Application Argo CD.
2. **Messagerie** (dépôt) : Valkey `valkey-prod` (Application `messaging-valkey-prod`) ; le compte
   NATS `PROD` existe déjà (`nats-accounts.PROD_PASSWORD`).
3. **Secrets de prod** (Théo, `infra/cluster/secrets/seal-prod.sh`) : mots de passe PostgreSQL et
   Valkey de prod, secret interne et clés JWT neufs ; mot de passe NATS de prod relu dans le
   cluster ; valeurs externes reprises de `~/.config/vtt/staging.env` (R2, Stripe live, OAuth,
   Kourrier, Cloudflare Realtime, Firebase) plus le secret du webhook Stripe de prod.
4. **Services** (dépôt) : `infra/gitops/prod/*.yaml` régénérés à partir du staging (namespace
   `vtt-prod`, adresses ci-dessus, une réplique) ; l'ApplicationSet couvre `prod` ; une release
   de prod part d'un tag `v*.*.*` (approbation de l'environnement `production`).
5. **Clonage des données** (une fois, avant le premier démarrage des services de prod) : dump du
   staging, restauration dans `vtt-pg-prod`.
6. **À régler par Théo** : DNS `app.yner.fr` et `api.yner.fr` (Cloudflare, proxifiés, vers
   `76.13.44.160`) ; redirections OAuth Google et Discord vers `api.yner.fr` ; webhook Stripe
   live `https://api.yner.fr/v1/billing/webhook`.
7. **Bascule** : après validation sur `app.yner.fr`, `yner.fr` passe de Vercel au cluster.
