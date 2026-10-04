# Tableaux de bord Grafana

Fichiers JSON à importer dans Grafana (https://grafana.cluster.afflair.app) : **Dashboards >
New > Import**, puis déposer le fichier. La source Loki se choisit à l'import (variable `loki`).

| Fichier          | Contenu                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `vtt-logs.json`  | Logs du namespace `vtt-staging` : volume, erreurs, 5xx, latence p95, refus par code métier, événements métier, recherche |

Les requêtes suivent la forme des logs décrite dans `docs/observabilite.md` § 2 (JSON pino :
`level`, `message`, `res.statusCode`, `responseTime`, `code`, `eventId`, `type`).
