--liquibase formatted sql

--changeset identity:0015-profile-locale
--comment: Langue de l'interface choisie sur le compte (docs/i18n.md § 3). NULL : pas de choix, le navigateur décide. La liste des langues vit dans @vtt/contracts (LOCALES) ; la base ne vérifie que la forme d'un code, pour qu'ajouter une langue ne demande aucune migration.
ALTER TABLE profiles ADD COLUMN locale text;
ALTER TABLE profiles ADD CONSTRAINT profiles_locale_format CHECK (locale ~ '^[a-z]{2,3}(-[A-Z]{2})?$');
--rollback ALTER TABLE profiles DROP CONSTRAINT profiles_locale_format;
--rollback ALTER TABLE profiles DROP COLUMN locale;
