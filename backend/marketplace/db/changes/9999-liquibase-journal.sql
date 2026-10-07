--liquibase formatted sql

--changeset marketplace:9999-liquibase-journal runAlways:true
--comment: Le rôle du service reçoit le DML sur tout ce que crée marketplace_owner (privilèges par défaut), y compris le journal de Liquibase. On le lui retire : un service compromis ne doit pas pouvoir falsifier l'historique des migrations.
REVOKE ALL ON TABLE databasechangelog, databasechangeloglock FROM marketplace_svc;
--rollback SELECT 1;
