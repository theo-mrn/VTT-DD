--liquibase formatted sql

--changeset dice:9999-liquibase-journal runAlways:true
--comment: Le rôle du service reçoit le DML sur tout ce que crée dice_owner (privilèges par défaut), y compris le journal de Liquibase. On le lui retire : un service compromis ne doit pas pouvoir falsifier l'historique des migrations.
REVOKE ALL ON TABLE databasechangelog, databasechangeloglock FROM dice_svc;
--rollback SELECT 1;
