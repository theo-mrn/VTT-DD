--liquibase formatted sql

--changeset identity:9999-journal-liquibase runAlways:true
--comment: Le rôle du service reçoit le DML sur tout ce que crée identity_owner (privilèges par défaut), y compris le journal de Liquibase. On le lui retire : un service compromis ne doit pas pouvoir falsifier l'historique des migrations.
REVOKE ALL ON TABLE databasechangelog, databasechangeloglock FROM identity_svc;
--rollback SELECT 1;
