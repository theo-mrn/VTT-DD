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
| http://localhost:3002  | character                             |
| http://localhost:3003  | campaign                              |
| http://localhost:3004  | dice                                  |
| localhost:5432         | PostgreSQL (`vtt` / `vtt`)            |

Par défaut, seuls PostgreSQL, NATS et Valkey démarrent. Services optionnels :
`pnpm dev --mails` (Kourrier sur :8090 et Mailpit sur :8025, voir `infra/mails/`),
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
  character/          personnages et systèmes de jeu, règles recalculées côté
                      serveur (contrat : docs/api-character.md)
  campaign/           campagnes, membres, invitations, personnages engagés et combat
                      (contrat : docs/api-campaign.md)
  dice/               jets de dés tirés par le serveur, historique, statistiques et
                      préférences de dés (contrat : docs/api-dice.md)
packages/
  contracts/          schémas partagés front/back (événements, erreurs, identifiants)
  platform/           socle des services (sécurité, logs, traces, cache, santé)
  rules/              moteur de règles générique (fiches, création, jets, achats)
  systemes/           systèmes de référence en données (D&D, Star Wars, Nooblies)
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

### Le front

| Dossier (`frontend/src/`)  | Rôle                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `components/ui/`           | primitives du design system (bouton, champ, dialog, onglets, palette…)       |
| `components/shell/`        | cadre de l'app : barre latérale, barre haute, palette ⌘K, pages « focus »    |
| `app/(app)/`               | pages connectées avec le cadre : accueil, campagnes, personnages, dés, notes |
| `app/(focus)/`             | pages plein écran : onboarding, assistants de création, « Qui joue ? »       |
| `lib/`                     | hooks de domaine (TanStack Query) : les composants n'appellent pas l'API   |

Jetons de couleur et ambiances de campagne : `app/globals.css`. Les fiches,
l'assistant de création et les jets lisent le système (`@vtt/rules`) et sa
présentation (`packages/systemes/systemes/<id>/presentation.yaml`) : aucune
clé de jeu n'est codée dans le front.

Campagnes et personnages passent par leurs services (`lib/campagnes.ts`,
`lib/personnages.ts`, adaptateurs explicites vers les types de l'UI). Seuls les
notes et l'historique des jets restent dans un dépôt local au navigateur
(`lib/depot-local.ts`) en attendant leur branchement : ne pas activer
`NEXT_PUBLIC_SERVICES` d'ici là.

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
