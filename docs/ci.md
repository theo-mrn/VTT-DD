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
| Manifests Kubernetes      | Chart des services rendu pour chaque environnement, charts tiers (NATS, Valkey, SonarQube) rendus depuis leurs Applications Argo CD, schémas validés par kubeconform.                                                                           |
| Image …                   | Chaque image construite et scannée par Trivy ; une CVE critique corrigeable bloque.                                                                                                                                                             |

CodeQL tourne à part (`codeql.yml`), chaque lundi et sur les PR.

## Lancer en local

- Lint, types, tests, build : `pnpm turbo run lint typecheck build` puis `pnpm turbo run test --concurrency=2`.
- Tests d'intégration d'un service : `TEST_DATABASE_URL=postgres://<rôle>:<mdp>@localhost:5432/vtt pnpm --filter @vtt/<service> test` (rôles et mots de passe de dev dans le job SQL).
- Bout en bout : stack de dev lancée (`pnpm dev`), puis `pnpm --filter @vtt/web e2e`.

## SonarQube

Auto-hébergé sur le cluster : édition Community Build, chart officiel, base CloudNativePG à part
(`infra/argocd/sonarqube.yaml`, `infra/cluster/sonarqube/`, `infra/sonarqube/values.yaml`),
servi sur `https://sonar.yner.fr`.

La Community Build n'analyse qu'une branche : chaque analyse (PR ou `main`) remplace la
précédente dans le projet. Le Quality Gate porte sur le « nouveau code » (par défaut : depuis
la version précédente), et le job échoue s'il ne passe pas.

### Mise en place (une fois)

1. **Nœud** : Elasticsearch embarqué exige `vm.max_map_count` ≥ 524288 (le conteneur d'init
   privilégié du chart est désactivé). Sur le nœud qui porte SonarQube :
   `echo 'vm.max_map_count=524288' | sudo tee /etc/sysctl.d/99-sonarqube.conf && sudo sysctl --system`.
2. **Secret de la sonde** (le pod n'est jamais prêt sans lui) :
   `kubectl -n sonarqube create secret generic sonarqube-monitoring --from-literal=passcode="$(openssl rand -hex 24)"`.
   Le namespace vient de `sonarqube-base` : appliquer d'abord `infra/argocd/sonarqube.yaml`.
3. **DNS** : `sonar.yner.fr` vers l'ingress (certificat Let's Encrypt par cert-manager).
4. **Premier accès** : `admin` / `admin`, mot de passe changé aussitôt.
5. **Projet** : créer le projet `vtt` (clé de `sonar-project.properties`), puis un jeton
   d'analyse de projet (My Account → Security).
6. **GitHub** (Settings → Secrets and variables → Actions) : secret `SONAR_TOKEN` (le jeton),
   variable `SONAR_HOST_URL` = `https://sonar.yner.fr`. Sans eux, le job SonarQube passe avec un
   avertissement.

### Protection de `main`

Settings → Branches → règle sur `main` : PR obligatoire, checks requis « Lint, types, tests »,
« Tests SQL (PostGIS) », « SonarQube (Quality Gate) », « Bout en bout (Playwright) », « Secrets
et dépendances », « Manifests Kubernetes ».

## Vercel

Vercel ne déploie plus que l'ancienne app, sur la branche `legacy` (Production Branch dans
Vercel). Le `vercel.json` du monorepo coupe tout déploiement des autres branches.
