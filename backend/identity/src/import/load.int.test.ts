/**
 * Import de bout en bout sur un vrai PostgreSQL : export Firebase -> identity ->
 * connexion par HTTP avec l'ancien mot de passe. Ignoré sans TEST_DATABASE_URL.
 */
import { loadConfig } from '@vtt/platform';
import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildIdentity } from '../app.js';
import { IdentityConfig } from '../config.js';
import { createPasswordAccount } from '../db/accounts.js';
import { createDb, type Db } from '../db/client.js';
import { legacyIds, outbox, users } from '../db/schema.js';
import { hashPassword } from '../passwords/passwords.js';
import { generateSigningJwk } from '../tokens/jwt.js';
import { FirebaseAuthExport, transformFirebaseUsers } from './firebase.js';
import { LEGACY_KIND, loadImportedAccounts } from './load.js';

const URL = process.env.TEST_DATABASE_URL;
const ctx = { correlationId: 'test-import' };

describe.skipIf(!URL)('import des comptes Firebase sur Postgres', () => {
  let db: Db;
  let fermer: () => Promise<void>;
  let app: Awaited<ReturnType<typeof buildIdentity>>;
  const suffixe = crypto.randomUUID().slice(0, 8);
  const uid = (n: string) => `fb-${suffixe}-${n}`;
  const adresse = (n: string) => `test-${suffixe}-${n}@exemple.fr`;

  beforeAll(async () => {
    const c = createDb(URL!);
    db = c.db;
    fermer = () => c.pool.end();
    app = await buildIdentity(
      loadConfig(IdentityConfig, {
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        DATABASE_URL: URL!,
        JWT_ISSUER: 'https://auth.test.local',
        JWT_AUDIENCE: 'vtt-api',
        JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('test')]),
        COOKIE_SECURE: 'false',
        // Exemple public de Firebase (README de firebase/scrypt)
        FIREBASE_SCRYPT_SIGNER_KEY:
          'jxspr8Ki0RYycVU8zykbdLGjFQ3McFUH0uiiTvC8pVMXAn210wjLNmdZJzxUECKbm0QsEmYUSDzZvpjeJ9WmXA==', // gitleaks:allow
        FIREBASE_SCRYPT_SALT_SEPARATOR: 'Bw==',
        FIREBASE_SCRYPT_ROUNDS: '8',
        FIREBASE_SCRYPT_MEM_COST: '14',
      }),
      { db },
    );
  });

  afterAll(async () => {
    await app?.close();
    const ids = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(sql`${users.email} like ${`test-${suffixe}-%`}`)
    ).map((u) => u.id);
    const importes = (
      await db
        .select({ id: legacyIds.id })
        .from(legacyIds)
        .where(sql`${legacyIds.legacyId} like ${`fb-${suffixe}-%`}`)
    ).map((l) => l.id);
    const tous = [...new Set([...ids, ...importes])];
    if (tous.length) {
      await db.delete(outbox).where(inArray(sql`${outbox.envelope}->'aggregate'->>'id'`, tous));
      await db.delete(legacyIds).where(inArray(legacyIds.id, tous));
      await db.delete(users).where(inArray(users.id, tous));
    }
    await fermer();
  });

  const exportFirebase = () =>
    FirebaseAuthExport.parse({
      users: [
        {
          localId: uid('theo'),
          email: adresse('theo'),
          emailVerified: true,
          passwordHash:
            'lSrfV15cpx95/sZS2W9c9Kp6i/LVgQNDNC/qzrCnh1SAyZvqmZqAjTdn3aoItz+VHjoZilo78198JAdRuid5lQ==',
          salt: '42xEC+ixf3L2lw==',
          createdAt: '1600000000000',
        },
        {
          localId: uid('google'),
          email: adresse('google'),
          providerUserInfo: [
            { providerId: 'google.com', rawId: `g-${suffixe}`, email: adresse('google') },
          ],
        },
        { localId: uid('conflit'), email: adresse('conflit') },
      ],
    });

  it('importe, puis le joueur se connecte avec son ancien mot de passe et retrouve son profil', async () => {
    // Un compte créé entre-temps sur la nouvelle plateforme avec le même e-mail
    await createPasswordAccount(db, ctx, {
      email: adresse('conflit'),
      name: 'Nouveau',
      password: await hashPassword('x-x-x-x-x'),
    });

    const { comptes } = transformFirebaseUsers(
      exportFirebase(),
      new Map([[uid('theo'), { name: 'Théo', titre: 'Vétéran', timeSpent: 600 }]]),
    );
    const rapport = await loadImportedAccounts(db, ctx, comptes);
    expect(rapport.importes).toBe(2);
    expect(rapport.conflits).toEqual([
      { legacyUid: uid('conflit'), raison: 'e-mail déjà utilisé sur la nouvelle plateforme' },
    ]);

    const connexion = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: adresse('theo'), password: 'user1password' },
    });
    expect(connexion.statusCode).toBe(200);

    const moi = await app.inject({
      url: '/v1/users/me',
      headers: { authorization: `Bearer ${connexion.json().accessToken}` },
    });
    expect(moi.json()).toMatchObject({ name: 'Théo', title: 'Vétéran', timeSpentMinutes: 600 });

    // L'uid Firebase pointe vers le nouveau compte : les persos pourront y être rattachés
    const [lien] = await db
      .select({ id: legacyIds.id })
      .from(legacyIds)
      .where(eq(legacyIds.legacyId, uid('theo')));
    expect(lien?.id).toBe(connexion.json().user.id);
  });

  it('est rejouable : un second passage n’ajoute rien', async () => {
    const { comptes } = transformFirebaseUsers(exportFirebase(), new Map());
    const avant = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(legacyIds)
      .where(eq(legacyIds.kind, LEGACY_KIND));
    const rapport = await loadImportedAccounts(db, ctx, comptes);
    const apres = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(legacyIds)
      .where(eq(legacyIds.kind, LEGACY_KIND));
    expect(rapport.importes).toBe(0);
    expect(rapport.dejaImportes).toBe(2);
    expect(apres[0]!.n).toBe(avant[0]!.n);
  });
});
