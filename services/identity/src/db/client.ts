import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';

export type Db = NodePgDatabase<typeof schema>;

/**
 * Connexion du service, avec le rôle identity_svc (données uniquement).
 * Le rôle identity_owner n'est jamais utilisé ici : il est réservé à Liquibase.
 */
export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 10,
    // Une requête bloquée ne doit pas retenir la connexion indéfiniment
    statement_timeout: 5_000,
    application_name: 'identity',
  });
  return { db: drizzle(pool, { schema }), pool };
}
