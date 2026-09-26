# Yner — table de jeu de rôle virtuelle

Monorepo pnpm + Turborepo : un front Next.js, des microservices Node/TypeScript
derrière une gateway, PostgreSQL (un schéma par service), NATS JetStream et
Valkey, déployés sur k3s par Argo CD. Le plan de refonte est dans
[docs/refacto.md](docs/refacto.md).

## Démarrer

Prérequis : Node 22 (`.nvmrc`), pnpm 10, Docker Desktop.

```bash
pnpm install
pnpm dev          # toute la stack : infra, migrations, services et front
```

| Adresse                | Quoi                                  |
| ---------------------- | ------------------------------------- |
| http://localhost:3000  | front (`frontend`)                    |
| http://localhost:8080  | gateway                               |
| http://localhost:3001  | identity                              |
| localhost:5432         | PostgreSQL (`vtt` / `vtt`)            |

Par défaut, seuls PostgreSQL, NATS et Valkey démarrent. Services optionnels :
`pnpm dev --stockage` (S3 local sur :8333), `--mails` (Mailpit sur :8025),
`--observabilite` (Grafana sur :3300), ou `--tout`.

Autres commandes : `pnpm dev:down` (arrête l'infra), `pnpm dev:legacy`
(ancienne app sur :3100), `pnpm db:migrate <service>`, `pnpm test`,
`pnpm typecheck`, `pnpm lint`.

## Structure

```
frontend/             le front Next.js (@vtt/web)
backend/              un dossier par service : chacun est un pod indépendant,
  gateway/            utilisable par son API sans le front
  identity/           comptes, connexion, profils, amis, titres, clés d'API
                      (src/, db/ = migrations Liquibase, .env.example)
packages/
  contracts/          schémas partagés front/back (événements, erreurs, identifiants)
  platform/           socle des services (sécurité, logs, traces, cache, santé)
legacy/               ancienne app Firebase, référence jusqu'à la parité
tools/
  firebase-export/    export Firebase (comptes, Firestore) pour les imports
infra/
  local/              docker compose, pnpm dev, import Firebase
  docker/             Dockerfiles (services, front)
  helm/service/       chart Helm commun à tous les services
  gitops/             valeurs par environnement (staging, prod), lues par Argo CD
  argocd/             ApplicationSet et politique de signature des images
  cluster/            PostgreSQL CloudNativePG et sauvegardes
  postgres/           rôles SQL, lanceur Liquibase, gabarits, tests SQL
  ci/                 variables factices de build
docs/                 plan de refonte
```

### Ajouter un service

Créer `backend/<nom>/` avec un `package.json` (script `dev`), `src/main.ts`
démarré par `createService()` de `@vtt/platform`, un `.env.example` et, s'il a
une base, `db/changelog.yaml`. `pnpm dev` le démarre et le migre sans autre
modification.

## Conventions

- Commits conventionnels en français (`feat(identity): …`), vérifiés par commitlint.
- Aucun secret dans le dépôt : `.env` locaux, Secrets Kubernetes en déploiement.
- Chaque service n'accède qu'à son schéma, avec un rôle limité aux données ;
  le schéma est modifié uniquement par Liquibase avec le rôle propriétaire.
