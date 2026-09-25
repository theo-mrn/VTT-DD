import { uuidv7Timestamp } from '@vtt/contracts';
import { describe, expect, it } from 'vitest';
import { FirebaseAuthExport, transformFirebaseUsers } from './firebase.js';

const MAINTENANT = new Date('2026-09-25T12:00:00Z');

function exporter(users: unknown[]) {
  return FirebaseAuthExport.parse({ users });
}

describe('import des comptes Firebase', () => {
  it('garde le hash scrypt, le profil Firestore et la date de création', () => {
    const { comptes, rapport } = transformFirebaseUsers(
      exporter([
        {
          localId: 'uid-theo',
          email: 'theo@exemple.fr',
          emailVerified: true,
          passwordHash: 'aGFzaA==',
          salt: 'c2Vs',
          displayName: 'Théo Auth',
          createdAt: '1600000000000',
        },
      ]),
      new Map([
        [
          'uid-theo',
          {
            name: 'Théo',
            pp: 'https://assets.yner.fr/pp.webp',
            titre: 'Maître du jeu',
            bio: 'MJ depuis 2010',
            imageURL: 'https://assets.yner.fr/banniere.webp',
            borderType: 'gold',
            timeSpent: 1234.7,
            settings: { theme: 'sombre' },
          },
        ],
      ]),
      MAINTENANT,
    );

    expect(comptes).toHaveLength(1);
    const c = comptes[0]!;
    expect(c.legacyUid).toBe('uid-theo');
    expect(c.password).toEqual({ algorithm: 'firebase-scrypt', hash: 'aGFzaA==', salt: 'c2Vs' });
    expect(c.user).toMatchObject({
      email: 'theo@exemple.fr',
      emailVerified: true,
      disabledAt: null,
    });
    expect(c.user.createdAt.getTime()).toBe(1_600_000_000_000);
    // L'UUIDv7 est daté de la création d'origine : l'ordre chronologique est conservé
    expect(uuidv7Timestamp(c.user.id)).toBe(1_600_000_000_000);
    expect(c.profile).toEqual({
      name: 'Théo',
      avatarUrl: 'https://assets.yner.fr/pp.webp',
      title: 'Maître du jeu',
      bio: 'MJ depuis 2010',
      bannerUrl: 'https://assets.yner.fr/banniere.webp',
      borderType: 'gold',
      showPremiumBadge: true,
      timeSpentMinutes: 1234,
      settings: { theme: 'sombre' },
    });
    expect(rapport).toMatchObject({ comptes: 1, avecMotDePasse: 1, aReinitialiser: [] });
  });

  it('rattache les comptes Google et signale ceux qui devront réinitialiser leur mot de passe', () => {
    const { comptes, rapport } = transformFirebaseUsers(
      exporter([
        {
          localId: 'uid-google',
          email: 'g@exemple.fr',
          providerUserInfo: [
            { providerId: 'google.com', rawId: '10987654321', email: 'g@exemple.fr' },
          ],
        },
        // Hash absent de l'export (algorithme non standard) : aucun moyen de garder le mot de passe
        { localId: 'uid-sans-hash', email: 'x@exemple.fr' },
      ]),
      new Map(),
      MAINTENANT,
    );
    const google = comptes.find((c) => c.legacyUid === 'uid-google')!;
    expect(google.password).toBeNull();
    expect(google.oauth).toEqual([
      { provider: 'google', providerAccountId: '10987654321', email: 'g@exemple.fr' },
    ]);
    expect(rapport.googleUniquement).toBe(1);
    expect(rapport.aReinitialiser).toEqual(['uid-sans-hash']);
  });

  it('donne l’e-mail en double au compte le plus ancien, sans perdre l’autre compte', () => {
    const { comptes, rapport } = transformFirebaseUsers(
      exporter([
        { localId: 'recent', email: 'DUO@exemple.fr', createdAt: '1700000000000' },
        { localId: 'ancien', email: 'duo@exemple.fr', createdAt: '1600000000000' },
      ]),
      new Map(),
      MAINTENANT,
    );
    expect(comptes.find((c) => c.legacyUid === 'ancien')!.user.email).toBe('duo@exemple.fr');
    expect(comptes.find((c) => c.legacyUid === 'recent')!.user.email).toBeNull();
    expect(rapport.emailsEnDouble).toEqual(['recent']);
  });

  it('écarte un e-mail invalide et tronque les champs trop longs', () => {
    const { comptes, rapport } = transformFirebaseUsers(
      exporter([{ localId: 'u', email: 'pas un email' }]),
      new Map([['u', { name: 'N'.repeat(100), bio: 'B'.repeat(3000) }]]),
      MAINTENANT,
    );
    const c = comptes[0]!;
    expect(c.user.email).toBeNull();
    expect(c.profile.name).toHaveLength(64);
    expect(c.profile.bio).toHaveLength(2000);
    expect(rapport.emailsInvalides).toEqual(['u']);
  });

  it('respecte le masquage explicite du badge premium et les comptes désactivés', () => {
    const { comptes, rapport } = transformFirebaseUsers(
      exporter([{ localId: 'u', disabled: true }]),
      new Map([['u', { showPremiumBadge: false }]]),
      MAINTENANT,
    );
    expect(comptes[0]!.profile.showPremiumBadge).toBe(false);
    expect(comptes[0]!.user.disabledAt).toEqual(MAINTENANT);
    expect(rapport.desactives).toBe(1);
  });

  it('reprend le nom Firebase Auth à défaut du profil, puis « Joueur »', () => {
    const { comptes } = transformFirebaseUsers(
      exporter([{ localId: 'a', displayName: 'Depuis Auth' }, { localId: 'b' }]),
      new Map(),
      MAINTENANT,
    );
    expect(comptes.find((c) => c.legacyUid === 'a')!.profile.name).toBe('Depuis Auth');
    expect(comptes.find((c) => c.legacyUid === 'b')!.profile.name).toBe('Joueur');
  });

  it('liste les champs laissés aux tranches suivantes et les profils orphelins', () => {
    const { rapport } = transformFirebaseUsers(
      exporter([{ localId: 'u' }]),
      new Map([
        ['u', { name: 'A', room_id: 'r1', perso: 'MJ', titles: { x: 'unlocked' }, premium: true }],
        ['orphelin', { name: 'B', room_id: 'r2' }],
      ]),
      MAINTENANT,
    );
    expect(rapport.champsNonRepris).toEqual({ room_id: 1, perso: 1, titles: 1, premium: 1 });
    expect(rapport.profilsSansCompte).toEqual(['orphelin']);
  });

  it('refuse un export mal formé', () => {
    expect(() => FirebaseAuthExport.parse({ users: [{ email: 'sans-uid@x.fr' }] })).toThrow();
    expect(() => FirebaseAuthExport.parse([])).toThrow();
  });
});
