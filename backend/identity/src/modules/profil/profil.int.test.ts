/**
 * Routes du profil par HTTP, sur un vrai PostgreSQL (rôle identity_svc).
 * Ignorées si TEST_DATABASE_URL est absent. Chaque test crée ses comptes.
 */
import { loadConfig, createService } from '@vtt/platform';
import { and, eq, sql } from 'drizzle-orm';
import { createLocalJWKSet } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IdentityConfig } from '../../config.js';
import { oauthAccounts, outbox, profiles, users } from '../../db/schema.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { createJwtSigner, generateSigningJwk } from '../../tokens/jwt.js';
import { registerProfil } from './index.js';
import type { DemandeSignature } from './stockage.js';

const CDN = 'https://cdn.test.local';
const S3 = {
  S3_ENDPOINT: 'http://s3.test.local:8333',
  S3_BUCKET: 'vtt',
  S3_ACCESS_KEY_ID: 'cle-test',
  S3_SECRET_ACCESS_KEY: 'secret-test',
  S3_PUBLIC_URL: CDN,
};

describe.skipIf(!TEST_DATABASE_URL)('profil par HTTP', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;

  beforeAll(async () => {
    t = await appDeTest(S3);
  });
  afterAll(async () => {
    await t?.fermer();
  });

  /** Application à part : la limite d'inscriptions (10/min par IP) est propre à chaque instance. */
  async function avecNouvelleApp(fn: (t: Awaited<ReturnType<typeof appDeTest>>) => Promise<void>) {
    const autre = await appDeTest();
    try {
      await fn(autre);
    } finally {
      await autre.fermer();
    }
  }

  const evenements = async (userId: string, type: string) =>
    (
      await t.db
        .select({ envelope: outbox.envelope })
        .from(outbox)
        .where(
          and(
            sql`${outbox.envelope}->'aggregate'->>'id' = ${userId}`,
            sql`${outbox.envelope}->>'type' = ${type}`,
          ),
        )
    ).map((l) => l.envelope as { payload: Record<string, unknown>; visibility: string });

  it('exige une authentification', async () => {
    for (const url of ['/v1/users/me', '/v1/users?search=abc']) {
      expect((await t.app.inject({ url })).statusCode, url).toBe(401);
    }
  });

  it('GET /v1/users/me renvoie le profil complet et les moyens de connexion', async () => {
    const moi = await t.inscrire('Théo');
    const res = await t.app.inject({ url: '/v1/users/me', headers: moi.auth });
    expect(res.statusCode).toBe(200);
    const corps = res.json();
    expect(corps).toEqual({
      id: moi.id,
      email: moi.email,
      emailVerified: false,
      name: 'Théo',
      avatarUrl: null,
      title: null,
      bio: null,
      bannerUrl: null,
      borderType: 'none',
      showPremiumBadge: true,
      timeSpentMinutes: 0,
      emailNotifications: true,
      settings: {},
      hasPassword: true,
      providers: [],
      createdAt: expect.any(String),
    });
    expect(new Date(corps.createdAt).toISOString()).toBe(corps.createdAt);

    await t.db.insert(oauthAccounts).values([
      { provider: 'google', providerAccountId: `g-${crypto.randomUUID()}`, userId: moi.id },
      { provider: 'discord', providerAccountId: `d-${crypto.randomUUID()}`, userId: moi.id },
      { provider: 'discord', providerAccountId: `d-${crypto.randomUUID()}`, userId: moi.id },
    ]);
    const apres = await t.app.inject({ url: '/v1/users/me', headers: moi.auth });
    expect(apres.json().providers).toEqual(['discord', 'google']);
  });

  it('PATCH /v1/users/me met à jour chaque champ et trace les champs modifiés', async () => {
    const moi = await t.inscrire('Avant');
    const [avant] = await t.db
      .select({ updatedAt: profiles.updatedAt })
      .from(profiles)
      .where(eq(profiles.userId, moi.id));

    const modif = {
      name: '  Après  ',
      bio: 'Barde à ses heures',
      avatarUrl: `${CDN}/avatars/${moi.id}/0190a-avatar.png`,
      bannerUrl: `${CDN}/banners/${moi.id}/0190a-banniere.webp`,
      borderType: 'magic_shine_aurora',
      showPremiumBadge: false,
      emailNotifications: false,
      settings: { theme: 'sombre', des: { son: true } },
    };
    const res = await t.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: moi.auth,
      payload: modif,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ...modif, name: 'Après', email: moi.email });

    const [apres] = await t.db
      .select({ updatedAt: profiles.updatedAt })
      .from(profiles)
      .where(eq(profiles.userId, moi.id));
    expect(apres!.updatedAt.getTime()).toBeGreaterThan(avant!.updatedAt.getTime());

    const [evt, ...autres] = await evenements(moi.id, 'identity.profile_updated');
    expect(autres).toHaveLength(0);
    expect(evt!.visibility).toBe('owner');
    expect(evt!.payload).toEqual({
      fields: [
        'avatarUrl',
        'bannerUrl',
        'bio',
        'borderType',
        'emailNotifications',
        'name',
        'settings',
        'showPremiumBadge',
      ],
    });
    // Jamais de valeur saisie ni d'e-mail dans l'événement
    const brut = JSON.stringify(evt);
    for (const secret of ['Après', 'Barde', 'sombre', moi.email]) {
      expect(brut).not.toContain(secret);
    }

    // Mêmes valeurs (clés de settings dans un autre ordre) : aucun nouvel événement
    const identique = await t.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: moi.auth,
      payload: { ...modif, settings: { des: { son: true }, theme: 'sombre' } },
    });
    expect(identique.statusCode).toBe(200);
    expect(await evenements(moi.id, 'identity.profile_updated')).toHaveLength(1);

    // Effacement de la bio et des images, un seul champ par requête
    for (const [champ, valeur] of [
      ['bio', null],
      ['avatarUrl', null],
      ['bannerUrl', null],
    ] as const) {
      const r = await t.app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: moi.auth,
        payload: { [champ]: valeur },
      });
      expect(r.statusCode, champ).toBe(200);
      expect(r.json()[champ], champ).toBeNull();
    }
    const tous = await evenements(moi.id, 'identity.profile_updated');
    expect(tous.map((e) => e.payload.fields)).toEqual(
      expect.arrayContaining([['bio'], ['avatarUrl'], ['bannerUrl']]),
    );
  });

  it('refuse les entrées invalides', async () => {
    const moi = await t.inscrire();
    const refus = [
      { name: '  ' },
      { bio: 'x'.repeat(2001) },
      { borderType: 'arc-en-ciel' },
      { settings: { gros: 'x'.repeat(17 * 1024) } },
      { settings: [1, 2] },
      { title: 'Légende' },
    ];
    for (const payload of refus) {
      const r = await t.app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: moi.auth,
        payload,
      });
      expect(r.statusCode, Object.keys(payload)[0]).toBe(400);
    }
  });

  it('refuse une URL d’image arbitraire ou hors du dossier de l’utilisateur', async () => {
    const moi = await t.inscrire();
    const autre = await t.inscrire();
    const refusees = [
      { avatarUrl: 'https://pirate.exemple/pisteur.png' },
      { avatarUrl: `${CDN}/avatars/${autre.id}/a.png` },
      { avatarUrl: `${CDN}/banners/${moi.id}/a.png` },
      { avatarUrl: `${CDN}/avatars/${moi.id}/../${autre.id}/a.png` },
      { bannerUrl: `${CDN}/avatars/${moi.id}/a.png` },
    ];
    for (const payload of refusees) {
      const r = await t.app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: moi.auth,
        payload,
      });
      expect(r.statusCode, JSON.stringify(payload)).toBe(400);
      expect(r.json().code).toBe('invalid_image_url');
    }
    const profil = await t.app.inject({ url: '/v1/users/me', headers: moi.auth });
    expect(profil.json().avatarUrl).toBeNull();
    expect(await evenements(moi.id, 'identity.profile_updated')).toHaveLength(0);
  });

  it('garde une ancienne URL (import Firebase) tant qu’elle ne change pas', async () => {
    const moi = await t.inscrire();
    const ancienne = 'https://firebasestorage.googleapis.com/v0/b/ancien/o/pp';
    await t.db.update(profiles).set({ avatarUrl: ancienne }).where(eq(profiles.userId, moi.id));
    const r = await t.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: moi.auth,
      payload: { avatarUrl: ancienne, name: 'Nouveau nom' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ avatarUrl: ancienne, name: 'Nouveau nom' });
  });

  it('POST /v1/users/me/uploads signe une URL S3 dans le dossier de l’utilisateur', async () => {
    const moi = await t.inscrire();
    const r = await t.app.inject({
      method: 'POST',
      url: '/v1/users/me/uploads',
      headers: moi.auth,
      payload: { kind: 'banner', contentType: 'image/webp', size: 2048 },
    });
    expect(r.statusCode).toBe(200);
    const { uploadUrl, publicUrl, expiresIn } = r.json();
    expect(expiresIn).toBe(300);
    expect(publicUrl).toMatch(new RegExp(`^${CDN}/banners/${moi.id}/[0-9a-f-]{36}\\.webp$`));
    const cle = publicUrl.slice(CDN.length + 1);
    const signee = new URL(uploadUrl);
    expect(signee.origin + signee.pathname).toBe(`${S3.S3_ENDPOINT}/vtt/${cle}`);
    expect(signee.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;content-type;host');

    // L'URL publique obtenue est ensuite acceptée comme bannière
    const patch = await t.app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: moi.auth,
      payload: { bannerUrl: publicUrl },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().bannerUrl).toBe(publicUrl);

    const trop = await t.app.inject({
      method: 'POST',
      url: '/v1/users/me/uploads',
      headers: moi.auth,
      payload: { kind: 'avatar', contentType: 'image/png', size: 5 * 1024 * 1024 + 1 },
    });
    expect(trop.statusCode).toBe(400);
  });

  it('POST /v1/users/me/uploads répond 503 sans stockage configuré', async () => {
    const sansStockage = await appDeTest();
    try {
      const moi = await sansStockage.inscrire();
      const r = await sansStockage.app.inject({
        method: 'POST',
        url: '/v1/users/me/uploads',
        headers: moi.auth,
        payload: { kind: 'avatar', contentType: 'image/png', size: 100 },
      });
      expect(r.statusCode).toBe(503);
      expect(r.json().code).toBe('storage_unavailable');

      // Sans stockage, aucune nouvelle URL d'image n'est acceptée
      const patch = await sansStockage.app.inject({
        method: 'PATCH',
        url: '/v1/users/me',
        headers: moi.auth,
        payload: { avatarUrl: `${CDN}/avatars/${moi.id}/a.png` },
      });
      expect(patch.statusCode).toBe(400);
    } finally {
      await sansStockage.fermer();
    }
  });

  it('utilise le signataire injecté (simulé)', async () => {
    const signer = await createJwtSigner({
      privateJwks: [await generateSigningJwk('simule')],
      issuer: 'https://auth.test.local',
      audience: 'vtt-api',
    });
    const config = loadConfig(IdentityConfig, {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      DATABASE_URL: TEST_DATABASE_URL!,
      JWT_ISSUER: 'https://auth.test.local',
      JWT_AUDIENCE: 'vtt-api',
      JWT_PRIVATE_JWKS: JSON.stringify([await generateSigningJwk('inutile')]),
      S3_PUBLIC_URL: `${CDN}/`,
    });
    const app = await createService({
      config,
      authKeyResolver: createLocalJWKSet(signer.jwks()),
    });
    const demandes: DemandeSignature[] = [];
    await registerProfil(app, { config, db: t.db }, async (d) => {
      demandes.push(d);
      return `https://signe.test/${d.cle}?sig=1`;
    });
    try {
      const userId = crypto.randomUUID();
      const r = await app.inject({
        method: 'POST',
        url: '/v1/users/me/uploads',
        headers: {
          authorization: `Bearer ${await signer.sign({ userId, roles: ['user'], rooms: {} })}`,
        },
        payload: { kind: 'avatar', contentType: 'image/gif', size: 777 },
      });
      expect(r.statusCode).toBe(200);
      expect(demandes).toHaveLength(1);
      const [d] = demandes;
      expect(d).toMatchObject({ contentType: 'image/gif', taille: 777, expiresIn: 300 });
      expect(d!.cle).toMatch(new RegExp(`^avatars/${userId}/[0-9a-f-]{36}\\.gif$`));
      expect(r.json()).toEqual({
        uploadUrl: `https://signe.test/${d!.cle}?sig=1`,
        publicUrl: `${CDN}/${d!.cle}`,
        expiresIn: 300,
      });
    } finally {
      await app.close();
    }
  });

  it('GET /v1/users/:id renvoie le profil public, sans e-mail', async () => {
    const lecteur = await t.inscrire('Lecteur');
    const cible = await t.inscrire('Cible');
    const r = await t.app.inject({ url: `/v1/users/${cible.id}`, headers: lecteur.auth });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      id: cible.id,
      name: 'Cible',
      avatarUrl: null,
      title: null,
      bio: null,
      bannerUrl: null,
      borderType: 'none',
      premium: false,
      showPremiumBadge: true,
      timeSpentMinutes: 0,
    });
    expect(r.body).not.toContain(cible.email);
    expect(r.body).not.toContain('settings');

    const inconnu = await t.app.inject({
      url: `/v1/users/${crypto.randomUUID()}`,
      headers: lecteur.auth,
    });
    expect(inconnu.statusCode).toBe(404);
    const invalide = await t.app.inject({ url: '/v1/users/pas-un-uuid', headers: lecteur.auth });
    expect(invalide.statusCode).toBe(400);

    await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, cible.id));
    const desactive = await t.app.inject({ url: `/v1/users/${cible.id}`, headers: lecteur.auth });
    expect(desactive.statusCode).toBe(404);
  });

  it('GET /v1/users recherche par nom, échappe les jokers et exclut soi-même', () =>
    avecNouvelleApp(async (t) => {
      const jeton = crypto.randomUUID().slice(0, 8);
      const moi = await t.inscrire(`Moi 50%${jeton}`);
      const pourcent = await t.inscrire(`Zoé 50%${jeton}`);
      const souligne = await t.inscrire(`Ana 50_${jeton}`);
      await t.inscrire(`Bob 50x${jeton}`);
      const desactive = await t.inscrire(`Eve 50%${jeton}`);
      await t.db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, desactive.id));

      const chercher = (search: string, limit?: number) =>
        t.app.inject({
          url: '/v1/users',
          query: { search, ...(limit ? { limit: String(limit) } : {}) },
          headers: moi.auth,
        });

      const r = await chercher(`50%${jeton}`);
      expect(r.statusCode).toBe(200);
      expect(r.json()).toEqual([
        { id: pourcent.id, name: `Zoé 50%${jeton}`, avatarUrl: null, title: null },
      ]);

      const s = await chercher(`50_${jeton}`);
      expect(s.json().map((u: { id: string }) => u.id)).toEqual([souligne.id]);

      // Insensible à la casse, trié par nom, sans moi ni le compte désactivé
      const tous = await chercher(jeton.toUpperCase());
      expect(tous.json().map((u: { name: string }) => u.name)).toEqual([
        `Ana 50_${jeton}`,
        `Bob 50x${jeton}`,
        `Zoé 50%${jeton}`,
      ]);
      expect(tous.body).not.toContain('@');

      expect((await chercher(jeton, 2)).json()).toHaveLength(2);
      expect((await chercher('a')).statusCode).toBe(400);
      expect((await chercher(jeton, 21)).statusCode).toBe(400);
    }));

  it('POST /v1/users/me/time additionne exactement deux ajouts simultanés', () =>
    avecNouvelleApp(async (t) => {
      const moi = await t.inscrire();
      const ajout = (minutes: number) =>
        t.app.inject({
          method: 'POST',
          url: '/v1/users/me/time',
          headers: moi.auth,
          payload: { minutes },
        });
      const reponses = await Promise.all([ajout(7), ajout(5)]);
      for (const r of reponses) {
        expect(r.statusCode).toBe(200);
        expect(r.json().unlockedTitles).toEqual(expect.any(Array));
      }
      // Le premier servi voit 5 ou 7, le second voit le total exact
      const [premier, second] = reponses
        .map((r) => r.json().timeSpentMinutes as number)
        .sort((a, b) => a - b);
      expect([5, 7]).toContain(premier);
      expect(second).toBe(12);
      const profil = await t.app.inject({ url: '/v1/users/me', headers: moi.auth });
      expect(profil.json().timeSpentMinutes).toBe(12);

      const evts = await evenements(moi.id, 'identity.play_time_added');
      expect(evts.map((e) => e.payload.minutes).sort()).toEqual([5, 7]);

      for (const minutes of [0, 61, 2.5]) {
        expect((await ajout(minutes)).statusCode, String(minutes)).toBe(400);
      }
    }));
});
