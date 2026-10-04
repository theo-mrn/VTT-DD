# Tableaux de bord Grafana

Tableaux de bord chargés automatiquement dans Grafana (https://grafana.cluster.afflair.app),
dossier **VTT** : `kustomization.yaml` en fait une ConfigMap étiquetée `grafana_dashboard=1`,
déployée par l'application Argo `vtt-observability`. Un tableau de bord ajouté ici doit aussi
être listé dans `kustomization.yaml`. Modifier = commit, pas d'édition dans Grafana.

| Fichier          | Contenu                                                                          |
| ---------------- | -------------------------------------------------------------------------------- |
| `vtt-logs.json`  | Logs du namespace `vtt-staging` : volume, erreurs, 5xx, latence p95, refus par code métier, événements métier, recherche |
| `vtt-postgres.json` | Base `vtt-pg` (CloudNativePG) : tableau officiel du projet (cloudnative-pg/grafana-dashboards), connexions, transactions, réplication, disque, sauvegardes |

Les requêtes suivent la forme des logs décrite dans `docs/observabilite.md` § 2 (JSON pino :
`level`, `message`, `res.statusCode`, `responseTime`, `code`, `eventId`, `type`).
