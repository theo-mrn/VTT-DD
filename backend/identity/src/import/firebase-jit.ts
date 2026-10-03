/**
 * Migration d'un compte Firebase à sa première connexion (« just in time ») :
 * identity ne connaît pas l'e-mail → Firebase vérifie e-mail et mot de passe →
 * le compte est créé dans identity avec le mot de passe re-hashé en argon2id et
 * le profil Firestore du joueur. Aucun hash n'est exporté : seul le joueur,
 * avec son propre mot de passe, déclenche la migration de son compte.
 *
 * Utilise la clé web publique de Firebase (Identity Toolkit) et le jeton du
 * joueur pour lire SON document users/{uid} (règles Firestore de l'ancienne app).
 */
import type { FirebaseAuthUser } from './firebase.js';

export interface CompteFirebaseVerifie {
  auth: FirebaseAuthUser;
  profil: Record<string, unknown>;
}

export interface ClientFirebase {
  /** null si l'e-mail ou le mot de passe est refusé par Firebase. */
  verifier(email: string, motDePasse: string): Promise<CompteFirebaseVerifie | null>;
}

type Fetch = typeof fetch;

/** Valeur Firestore (API REST) -> valeur JSON ordinaire. */
export function depuisFirestore(v: Record<string, unknown>): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('referenceValue' in v) return v.referenceValue;
  if ('arrayValue' in v) {
    const valeurs = (v.arrayValue as { values?: Record<string, unknown>[] }).values ?? [];
    return valeurs.map(depuisFirestore);
  }
  if ('mapValue' in v) {
    return champsFirestore(
      (v.mapValue as { fields?: Record<string, Record<string, unknown>> }).fields,
    );
  }
  return null;
}

export function champsFirestore(
  champs: Record<string, Record<string, unknown>> | undefined,
): Record<string, unknown> {
  const sortie: Record<string, unknown> = {};
  for (const [cle, valeur] of Object.entries(champs ?? {})) sortie[cle] = depuisFirestore(valeur);
  return sortie;
}

export function creerClientFirebase(opts: {
  apiKey: string;
  projectId: string;
  fetch?: Fetch;
}): ClientFirebase {
  const f = opts.fetch ?? fetch;
  const toolkit = 'https://identitytoolkit.googleapis.com/v1';
  const post = (url: string, corps: unknown) =>
    f(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(10_000),
    });

  return {
    async verifier(email, motDePasse) {
      const connexion = await post(`${toolkit}/accounts:signInWithPassword?key=${opts.apiKey}`, {
        email,
        password: motDePasse,
        returnSecureToken: true,
      });
      // 400 : identifiants refusés (INVALID_LOGIN_CREDENTIALS, USER_DISABLED…)
      if (connexion.status === 400) return null;
      if (!connexion.ok) throw new Error(`Firebase : connexion HTTP ${connexion.status}`);
      const { localId, idToken } = (await connexion.json()) as { localId: string; idToken: string };

      const recherche = await post(`${toolkit}/accounts:lookup?key=${opts.apiKey}`, { idToken });
      if (!recherche.ok) throw new Error(`Firebase : lecture du compte HTTP ${recherche.status}`);
      const [compte] =
        ((await recherche.json()) as { users?: Record<string, unknown>[] }).users ?? [];
      if (!compte || compte.localId !== localId) return null;

      // Profil : le joueur lit son propre document avec son jeton
      let profil: Record<string, unknown> = {};
      const doc = await f(
        `https://firestore.googleapis.com/v1/projects/${opts.projectId}/databases/(default)/documents/users/${encodeURIComponent(localId)}`,
        { headers: { authorization: `Bearer ${idToken}` }, signal: AbortSignal.timeout(10_000) },
      );
      if (doc.ok) {
        profil = champsFirestore(
          ((await doc.json()) as { fields?: Record<string, Record<string, unknown>> }).fields,
        );
      }

      return {
        auth: {
          localId,
          email: typeof compte.email === 'string' ? compte.email : email,
          emailVerified: compte.emailVerified === true,
          displayName: typeof compte.displayName === 'string' ? compte.displayName : undefined,
          photoUrl: typeof compte.photoUrl === 'string' ? compte.photoUrl : undefined,
          createdAt: typeof compte.createdAt === 'string' ? compte.createdAt : undefined,
          disabled: compte.disabled === true,
          providerUserInfo: Array.isArray(compte.providerUserInfo)
            ? (compte.providerUserInfo as { providerId: string; rawId: string; email?: string }[])
            : undefined,
        },
        profil,
      };
    },
  };
}
