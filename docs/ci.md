# Intégration continue

`.github/workflows/ci.yml`, à chaque push sur une PR et sur `main`. Une PR ne fusionne que si
tous les jobs passent (règles de protection de la branche, voir la fin).

| Job                       | Ce qu'il vérifie                                                                                                                                                                                                                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, types, tests        | Formatage, commits conventionnels, lint, types, build, tests unitaires avec couverture. Sur une PR, seulement les paquets touchés (`--affected`). Tests deux paquets à la fois : tous ensemble, les tests de propriétés dépassent leurs délais. |
| Tests SQL (PostGIS)       | Base neuve : smoke SQL (schéma jetable), migrations Liquibase de chaque service (appliquer, annuler, réappliquer), droits de chaque schéma, puis tests d'intégration de chaque service sur cette base avec son rôle, avec couverture.           |
| SonarQube (Quality Gate)  | Analyse du code et de la couverture (unitaires et intégration) ; échoue si le Quality Gate échoue : nouveau code couvert, sans bug ni faille ajoutés.                                                                                           |
| Bout en bout (Playwright) | Stack complète (`infra/ci/e2e-stack.sh` : infra, migrations, services compilés, front servi) et les parcours de `frontend/e2e`. En cas d'échec : rapport, traces et journaux de chaque processus en artefact `e2e`.                             |
| Secrets et dépendances    | Gitleaks, revue des nouvelles dépendances (licences, failles), `pnpm audit`, OSV-Scanner.                                                                                                                                                       |
| Manifests Kubernetes      | Chart des services rendu pour chaque environnement, charts tiers (NATS, Valkey) rendus depuis leurs Applications Argo CD, schémas validés par kubeconform.                                                                                      |
| Image …                   | Chaque image construite et scannée par Trivy ; une CVE critique corrigeable bloque.                                                                                                                                                             |

CodeQL tourne à part (`codeql.yml`), chaque lundi et sur les PR.

## Lancer en local

- Lint, types, tests, build : `pnpm turbo run lint typecheck build` puis `pnpm turbo run test --concurrency=2`.
- Tests d'intégration d'un service : `TEST_DATABASE_URL=postgres://<rôle>:<mdp>@localhost:5432/vtt pnpm --filter @vtt/<service> test` (rôles et mots de passe de dev dans le job SQL).
- Bout en bout : stack de dev lancée (`pnpm dev`), puis `pnpm --filter @vtt/web e2e`.

## SonarQube

Instance existante : `https://sonarqube.cluster.afflair.app` (hors de ce dépôt). Le job envoie
l'analyse et la couverture, puis attend le Quality Gate (`sonar.qualitygate.wait`) : il échoue
si le nouveau code n'est pas couvert ou ajoute un bug ou une faille. Projet : `vtt`
(`sonar-project.properties`).

### Mise en place (une fois)

1. **Accès depuis GitHub Actions** : l'instance est derrière la SSO `auth.cluster.afflair.app`,
   qui redirige toute requête non connectée, y compris l'API. Le scanner (runner GitHub) doit
   la traverser : exempter de la SSO les routes `/api/` (elles exigent déjà un jeton
   SonarQube), ou lancer ce job sur un runner auto-hébergé dans le cluster.
2. **Projet** : créer le projet `vtt`, puis un jeton d'analyse de projet.
3. **GitHub** (Settings → Secrets and variables → Actions) : secret `SONAR_TOKEN` (le jeton),
   variable `SONAR_HOST_URL` = `https://sonarqube.cluster.afflair.app`. Sans eux, le job
   SonarQube passe avec un avertissement.

### Protection de `main`

Settings → Branches → règle sur `main` : PR obligatoire, checks requis « Lint, types, tests »,
« Tests SQL (PostGIS) », « SonarQube (Quality Gate) », « Bout en bout (Playwright) », « Secrets
et dépendances », « Manifests Kubernetes ».

## Vercel

Vercel ne déploie plus que l'ancienne app, sur la branche `legacy` (Production Branch dans
Vercel). Le `vercel.json` du monorepo coupe tout déploiement des autres branches.
