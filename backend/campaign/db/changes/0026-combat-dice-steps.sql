--liquibase formatted sql

-- Attaque en étapes (docs/combat.md § 6) : le jet, puis les dégâts des cibles touchées, puis la
-- table ; chaque étape est lancée par l'attaquant (dés 3D, ou tirés par le serveur à la demande).
-- `resolving_since` sépare « résolution en cours » (character calcule l'étape suivante) de « dés
-- à lancer » (`pending_steps`) ; `auto_roll` : les étapes s'enchaînent seules (lot du MJ).

--changeset campaign:0026-attacks-resolving
--comment: Résolution en cours chez character (réactions reçues, étape de dés envoyée) : une seule à la fois ; restée ouverte plus de 30 s, elle peut être relancée.
ALTER TABLE campaign_attacks ADD COLUMN resolving_since timestamptz;
--rollback ALTER TABLE campaign_attacks DROP COLUMN resolving_since;

--changeset campaign:0026-attacks-auto-roll
--comment: Les étapes de dés s'enchaînent seules, tirées par le serveur (attaques en masse du MJ).
ALTER TABLE campaign_attacks ADD COLUMN auto_roll boolean NOT NULL DEFAULT false;
--rollback ALTER TABLE campaign_attacks DROP COLUMN auto_roll;
