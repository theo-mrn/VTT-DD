/**
 * Transformation des comptes Firebase vers le schéma identity (fonction pure).
 *
 * Entrées :
 *  - l'export de Firebase Auth : `firebase auth:export comptes.json --format=json`
 *    ({"users": [...]}, format lu dans firebase-tools/src/accountExporter.ts) ;
 *  - les documents Firestore `users/{uid}` (profil).
 *
 * Rien n'est perdu en silence : chaque anomalie est comptée dans le rapport, et
 * les champs Firestore qui ne relèvent pas d'identity (salle courante, titres,
 * premium, skins…) sont listés pour que les tranches suivantes les importent
 * depuis le même export.
 */
import { uuidv7 } from '@vtt/contracts';
import { z } from 'zod';
import type { StoredPassword } from '../passwords/passwords.js';

export const FirebaseAuthUser = z.looseObject({
  localId: z.string().min(1),
  email: z.string().optional(),
  emailVerified: z.boolean().optional(),
  /** base64 standard ; absent si le compte n'utilise pas le scrypt par défaut du projet. */
  passwordHash: z.string().optional(),
  salt: z.string().optional(),
  displayName: z.string().optional(),
  photoUrl: z.string().optional(),
  /** Millisecondes depuis l'époque Unix, en chaîne dans l'export. */
  createdAt: z.union([z.string(), z.number()]).optional(),
  disabled: z.boolean().optional(),
  providerUserInfo: z
    .array(
      z.looseObject({ providerId: z.string(), rawId: z.string(), email: z.string().optional() }),
    )
    .optional(),
});
export type FirebaseAuthUser = z.infer<typeof FirebaseAuthUser>;

export const FirebaseAuthExport = z.object({ users: z.array(FirebaseAuthUser) });

/** Champs du document Firestore users/{uid} repris par identity. */
const CHAMPS_PROFIL = new Set([
  'name',
  'email',
  'pp',
  'titre',
  'bio',
  'imageURL',
  'borderType',
  'showPremiumBadge',
  'timeSpent',
  'settings',
]);

const EMAIL = /^[^@\s]+@[^@\s]+$/;
const NOM_MAX = 64;
const BIO_MAX = 2000;

export interface ImportedAccount {
  legacyUid: string;
  user: {
    id: string;
    email: string | null;
    emailVerified: boolean;
    createdAt: Date;
    disabledAt: Date | null;
  };
  profile: {
    name: string;
    avatarUrl: string | null;
    title: string | null;
    bio: string | null;
    bannerUrl: string | null;
    borderType: string;
    showPremiumBadge: boolean;
    timeSpentMinutes: number;
    settings: Record<string, unknown>;
  };
  password: StoredPassword | null;
  oauth: { provider: 'google'; providerAccountId: string; email: string | null }[];
}

export interface ImportReport {
  comptes: number;
  avecMotDePasse: number;
  googleUniquement: number;
  /** Ni hash exploitable ni Google : ces joueurs devront réinitialiser leur mot de passe. */
  aReinitialiser: string[];
  emailsInvalides: string[];
  /** Même e-mail sur plusieurs comptes : le plus ancien le garde. */
  emailsEnDouble: string[];
  desactives: number;
  /** Documents Firestore users/{uid} sans compte Firebase Auth. */
  profilsSansCompte: string[];
  /** Champs Firestore laissés aux tranches suivantes, avec leur nombre d'occurrences. */
  champsNonRepris: Record<string, number>;
}

function texte(v: unknown, max?: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '') return null;
  return max ? t.slice(0, max) : t;
}

function dateCreation(u: FirebaseAuthUser, repli: Date): Date {
  const ms = Number(u.createdAt);
  return Number.isFinite(ms) && ms > 0 ? new Date(ms) : repli;
}

export function transformFirebaseUsers(
  auth: z.infer<typeof FirebaseAuthExport>,
  profils: ReadonlyMap<string, Record<string, unknown>>,
  now: Date = new Date(),
): { comptes: ImportedAccount[]; rapport: ImportReport } {
  const rapport: ImportReport = {
    comptes: 0,
    avecMotDePasse: 0,
    googleUniquement: 0,
    aReinitialiser: [],
    emailsInvalides: [],
    emailsEnDouble: [],
    desactives: 0,
    profilsSansCompte: [],
    champsNonRepris: {},
  };

  // Les plus anciens d'abord : en cas d'e-mail en double, le compte d'origine le garde
  const tries = [...auth.users].sort(
    (a, b) => dateCreation(a, now).getTime() - dateCreation(b, now).getTime(),
  );
  const emailsVus = new Set<string>();
  const comptes: ImportedAccount[] = [];

  for (const u of tries) {
    const doc = profils.get(u.localId) ?? {};
    const creation = dateCreation(u, now);

    let email = texte(u.email) ?? texte(doc.email);
    if (email && !EMAIL.test(email)) {
      rapport.emailsInvalides.push(u.localId);
      email = null;
    }
    if (email) {
      const cle = email.toLowerCase();
      if (emailsVus.has(cle)) {
        rapport.emailsEnDouble.push(u.localId);
        email = null;
      } else {
        emailsVus.add(cle);
      }
    }

    const google = (u.providerUserInfo ?? [])
      .filter((p) => p.providerId === 'google.com')
      .map((p) => ({
        provider: 'google' as const,
        providerAccountId: p.rawId,
        email: texte(p.email),
      }));

    const password: StoredPassword | null =
      u.passwordHash && u.salt
        ? { algorithm: 'firebase-scrypt', hash: u.passwordHash, salt: u.salt }
        : null;
    if (password) rapport.avecMotDePasse++;
    else if (google.length) rapport.googleUniquement++;
    else rapport.aReinitialiser.push(u.localId);

    if (u.disabled) rapport.desactives++;

    for (const champ of Object.keys(doc)) {
      if (!CHAMPS_PROFIL.has(champ)) {
        rapport.champsNonRepris[champ] = (rapport.champsNonRepris[champ] ?? 0) + 1;
      }
    }

    const temps = Number(doc.timeSpent);
    comptes.push({
      legacyUid: u.localId,
      user: {
        // UUIDv7 daté de la création d'origine : l'ordre chronologique est conservé
        id: uuidv7(creation.getTime()),
        email,
        emailVerified: u.emailVerified === true,
        createdAt: creation,
        disabledAt: u.disabled ? now : null,
      },
      profile: {
        name: texte(doc.name, NOM_MAX) ?? texte(u.displayName, NOM_MAX) ?? 'Joueur',
        avatarUrl: texte(doc.pp) ?? texte(u.photoUrl),
        title: texte(doc.titre),
        bio: texte(doc.bio, BIO_MAX),
        bannerUrl: texte(doc.imageURL),
        borderType: texte(doc.borderType) ?? 'none',
        // Affiché par défaut, comme dans l'ancienne app
        showPremiumBadge: doc.showPremiumBadge !== false,
        timeSpentMinutes: Number.isFinite(temps) && temps > 0 ? Math.floor(temps) : 0,
        settings:
          doc.settings && typeof doc.settings === 'object' && !Array.isArray(doc.settings)
            ? (doc.settings as Record<string, unknown>)
            : {},
      },
      password,
      oauth: google,
    });
  }

  const uids = new Set(auth.users.map((u) => u.localId));
  for (const uid of profils.keys()) if (!uids.has(uid)) rapport.profilsSansCompte.push(uid);

  rapport.comptes = comptes.length;
  return { comptes, rapport };
}
