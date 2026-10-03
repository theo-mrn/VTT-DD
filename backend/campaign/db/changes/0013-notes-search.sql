--liquibase formatted sql

-- Texte brut et recherche plein texte des notes. Le service calcule, à chaque écriture, le HTML
-- assaini (content), le texte brut (plain_text), l'aperçu (preview) et la forme de recherche
-- (search_text : minuscules, sans accents ni ligatures, sans extension unaccent). Le vecteur
-- combine la configuration « french » (racines : cheval ⇄ chevaux) et « simple » (mots vides
-- gardés, pour la recherche au fil de la frappe). sanitizer_version : version de l'assainisseur
-- qui a écrit content ; 0 pour les notes importées, réassainies par le service (docs/api-notes.md).

--changeset campaign:0013-notes-search
--comment: Colonnes calculées par le service, vecteur de recherche généré et index GIN.
ALTER TABLE notes ADD COLUMN plain_text text NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN preview text NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN search_text text NOT NULL DEFAULT '';
ALTER TABLE notes ADD COLUMN sanitizer_version smallint NOT NULL DEFAULT 0;
ALTER TABLE notes ADD CONSTRAINT notes_plain_text_length CHECK (char_length(plain_text) <= 200000);
ALTER TABLE notes ADD CONSTRAINT notes_preview_length CHECK (char_length(preview) <= 400);
ALTER TABLE notes ADD CONSTRAINT notes_search_text_length CHECK (char_length(search_text) <= 300000);
ALTER TABLE notes ADD COLUMN search tsvector
  GENERATED ALWAYS AS (to_tsvector('french', search_text) || to_tsvector('simple', search_text)) STORED;
CREATE INDEX notes_search ON notes USING gin (search);
-- Notes à réassainir (importées, ou écrites par une version antérieure de l'assainisseur)
CREATE INDEX notes_sanitizer ON notes (sanitizer_version, id);
--rollback DROP INDEX notes_sanitizer; DROP INDEX notes_search;
--rollback ALTER TABLE notes DROP COLUMN search;
--rollback ALTER TABLE notes DROP CONSTRAINT notes_search_text_length;
--rollback ALTER TABLE notes DROP CONSTRAINT notes_preview_length;
--rollback ALTER TABLE notes DROP CONSTRAINT notes_plain_text_length;
--rollback ALTER TABLE notes DROP COLUMN sanitizer_version, DROP COLUMN search_text;
--rollback ALTER TABLE notes DROP COLUMN preview, DROP COLUMN plain_text;
