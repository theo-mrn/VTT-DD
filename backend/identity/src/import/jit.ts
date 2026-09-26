/**
 * Crée dans identity le compte d'un joueur Firebase vérifié à sa connexion.
 * Réutilise la transformation et le chargement de l'import (mêmes règles,
 * même rattachement legacy_ids pour les personnages).
 */
import type { Db } from '../db/client.js';
import type { EventContext } from '../db/outbox.js';
import { hashPassword } from '../passwords/passwords.js';
import type { ClientFirebase } from './firebase-jit.js';
import { transformFirebaseUsers } from './firebase.js';
import { loadImportedAccounts } from './load.js';

/** Renvoie l'identifiant du compte créé, ou null (refusé, désactivé, conflit). */
export async function migrerALaConnexion(
  db: Db,
  ctx: EventContext,
  client: ClientFirebase,
  email: string,
  motDePasse: string,
): Promise<string | null> {
  const verifie = await client.verifier(email, motDePasse);
  if (!verifie || verifie.auth.disabled) return null;

  const { comptes } = transformFirebaseUsers(
    { users: [verifie.auth] },
    new Map([[verifie.auth.localId, verifie.profil]]),
  );
  const compte = comptes[0];
  if (!compte?.user.email) return null;
  // Le mot de passe vient d'être validé par Firebase : directement en argon2id
  compte.password = await hashPassword(motDePasse);

  const rapport = await loadImportedAccounts(db, ctx, [compte]);
  return rapport.importes === 1 ? compte.user.id : null;
}
