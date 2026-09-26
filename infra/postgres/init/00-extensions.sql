-- Exécuté au premier démarrage du conteneur de dev (et par le bootstrap CNPG en prod).
CREATE EXTENSION IF NOT EXISTS postgis;          -- géométrie de la carte
CREATE EXTENSION IF NOT EXISTS pg_stat_statements; -- requêtes lentes
CREATE EXTENSION IF NOT EXISTS pgcrypto;         -- digest() pour la chaîne de hash
CREATE EXTENSION IF NOT EXISTS btree_gist;       -- index GiST mixtes (map_id + géométrie)
