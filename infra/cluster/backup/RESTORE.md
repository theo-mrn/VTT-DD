# Restauration PostgreSQL

Deux niveaux de sauvegarde, indépendants :

| Niveau                                  | Quoi                                 | Où                                             | Rétention | Sert à                                                              |
| --------------------------------------- | ------------------------------------ | ---------------------------------------------- | --------- | ------------------------------------------------------------------- |
| Physique continu (CNPG + Barman Cloud)  | Base complète + WAL                  | `r2:vtt-pg-backups`                            | 30 jours  | Revenir à la seconde près (PITR), perte du cluster                  |
| Logique quotidien (`pg-logical-backup`) | `pg_dump` par schéma, chiffré rclone | `r2:vtt-logical-backups` (autres identifiants) | 30 jours  | Restaurer un seul service, une erreur humaine, perte du bucket CNPG |

Valkey (cache) et NATS ne sont pas sauvegardés : le cache se reconstruit, et les
événements sont déjà persistés dans `history.events` et dans les outbox.

Le test automatique `pg-restore-test` restaure chaque dimanche la dernière sauvegarde
physique et vérifie la chaîne de hash de l'historique.

## A. Retour dans le temps (PITR) — incident grave

1. Geler les écritures : `kubectl -n vtt-prod scale deploy --all --replicas=0` (le front affiche la maintenance).
2. Créer un nouveau cluster depuis la sauvegarde, à l'instant voulu (UTC) :

   ```yaml
   apiVersion: postgresql.cnpg.io/v1
   kind: Cluster
   metadata: { name: vtt-pg-restored, namespace: data }
   spec:
     instances: 3
     imageName: ghcr.io/cloudnative-pg/postgis:17-3.5
     storage: { size: 20Gi, storageClass: local-path }
     bootstrap:
       recovery:
         source: origin
         recoveryTarget: { targetTime: '2026-09-25 14:00:00+00' }
     externalClusters:
       - name: origin
         plugin:
           name: barman-cloud.cloudnative-pg.io
           parameters: { barmanObjectName: r2-backups, serverName: vtt-pg }
   ```

3. Vérifier : `SELECT count(*) FROM history.verify_chain(NULL);` doit renvoyer 0.
4. Basculer les services vers `vtt-pg-restored-rw` (valeurs GitOps), relancer, puis
   supprimer l'ancien cluster une fois la situation stable.

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
