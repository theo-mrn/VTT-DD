# Restauration PostgreSQL

Deux niveaux de sauvegarde, indépendants :

| Niveau                                  | Quoi                                 | Où                                             | Rétention | Sert à                                                              |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------- | --------- | ------------------------------------------------------------------- |
| Physique continu (CNPG + Barman Cloud)  | Base complète chaque nuit + WAL      | `r2:vtt-pg-wal`                                | 7 jours   | Revenir à la seconde près (PITR, perte ≤ 5 min), perte du cluster   |
| Logique quotidien (`pg-logical-backup`) | `pg_dump` par schéma, chiffré rclone | `r2:vtt-logical-backups` (autres identifiants) | 30 jours  | Restaurer un seul service, une erreur humaine, perte du bucket CNPG |

Valkey (cache) et NATS ne sont pas sauvegardés : le cache se reconstruit, et les
événements sont déjà persistés dans `history.events` et dans les outbox.

Le test automatique `pg-restore-test` restaure chaque dimanche la dernière sauvegarde
physique et vérifie la chaîne de hash de l'historique.

## État des sauvegardes

```bash
kubectl -n data get backups                      # sauvegardes de base (une par nuit, 4 h UTC)
kubectl -n data get scheduledbackup vtt-pg-daily
kubectl -n data get cluster vtt-pg -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")]}'
kubectl -n data get cronjob pg-logical-backup pg-restore-test   # dump nocturne, test du dimanche
```

Secrets des deux sauvegardes (jetons R2 limités à leur bucket, clé de chiffrement des dumps) :
`infra/cluster/secrets/seal-backups.sh`. La clé `BACKUP_VAULT_PASSWORD`/`SALT` est aussi rangée
hors du cluster : sans elle, les dumps sont illisibles.

## A. Retour dans le temps (PITR) — incident grave

Une commande, l'heure en heure de Paris (on peut d'abord la lancer avec `--essai`, qui vérifie
tout et montre la modification du dépôt sans rien pousser ni supprimer) :

```bash
infra/cluster/backup/pitr.sh "2026-10-04 14:59"
```

Elle vérifie que l'instant est couvert, force l'archivage du WAL, écrit la restauration dans le
dépôt (`bootstrap.recovery`) avec une **nouvelle lignée d'archive** (`vtt-pg-pitrN` : l'ancienne
reste intacte dans R2), demande confirmation, supprime le cluster (Argo le recrée depuis
l'archive), redémarre PgBouncer, puis lance la première sauvegarde de base de la nouvelle lignée.
Tout ce qui a été écrit après l'instant choisi est perdu.

Pourquoi recréer la base : Postgres ne sait pas reculer une base en marche, son journal ne se lit
que vers l'avant. On repart de la sauvegarde de base et on rejoue le WAL jusqu'à l'instant voulu.

Après la restauration, vérifier la chaîne de hash de l'historique :
`SELECT count(*) FROM (SELECT DISTINCT campaign_id FROM history.events) r, LATERAL history.verify_chain(r.campaign_id);`
doit renvoyer 0 (même requête que le test de restauration hebdomadaire).

## B. Restaurer un seul schéma depuis le dump logique

```bash
# 1. Récupérer et déchiffrer (même config rclone que le CronJob)
rclone copy vault:2026-09-25T0130Z ./restore
cd restore && sha256sum -c SHA256SUMS

# 2. Base cible : les extensions doivent exister AVANT pg_restore
#    (postgis, btree_gist, pgcrypto, pg_stat_statements), sinon les index GiST échouent.
psql -d vtt_restore -f infra/postgres/init/00-extensions.sql

# 3. Restaurer
pg_restore --no-owner --exit-on-error -d vtt_restore campaign.dump
```

Puis recopier les lignes utiles vers la prod, ou renommer le schéma, selon l'incident.
