--liquibase formatted sql

--changeset identity:0012-account-lifecycle
--comment: Suppression de compte différée (docs/legal.md) : demandée, le compte est purgé 7 jours plus tard sauf reconnexion. Dernière visite (au plus une mise à jour par jour) et avertissement d'inactivité pour les comptes sans connexion depuis 3 ans.
ALTER TABLE users ADD COLUMN deletion_requested_at timestamptz;
ALTER TABLE users ADD COLUMN last_seen_at timestamptz;
ALTER TABLE users ADD COLUMN inactivity_warned_at timestamptz;
CREATE INDEX users_deletion_requested ON users (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;
--rollback DROP INDEX users_deletion_requested;
--rollback ALTER TABLE users DROP COLUMN inactivity_warned_at;
--rollback ALTER TABLE users DROP COLUMN last_seen_at;
--rollback ALTER TABLE users DROP COLUMN deletion_requested_at;

--changeset identity:0012-account-lifecycle-backfill
--comment: Dernière visite inconnue pour les comptes existants (dont ceux importés de Firebase avec leur date de création d'origine) : l'horloge d'inactivité part du déploiement, jamais de la création, sinon d'anciens comptes actifs seraient prévenus puis supprimés d'un coup.
UPDATE users SET last_seen_at = now() WHERE last_seen_at IS NULL;
--rollback SELECT 1;
