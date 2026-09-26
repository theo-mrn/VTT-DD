import { describe, expect, it } from 'vitest';
import {
  attendrePlancher,
  DUREE_JETON_MS,
  echeanceJeton,
  empreinteJeton,
  jetonUtilisable,
  lienJeton,
  nouveauJeton,
} from './jetons.js';
import { mailReinitialisation, mailVerification } from './mails.js';

describe('jetons envoyés par e-mail', () => {
  it('génère 32 octets aléatoires en base64url, dont seule l’empreinte SHA-256 est stockée', () => {
    const a = nouveauJeton();
    const b = nouveauJeton();
    expect(a.jeton).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(a.jeton, 'base64url')).toHaveLength(32);
    expect(a.empreinte).toHaveLength(32);
    expect(a.empreinte.equals(empreinteJeton(a.jeton))).toBe(true);
    expect(a.jeton).not.toBe(b.jeton);
  });

  it('fixe les durées : une heure pour la réinitialisation, 24 h pour la vérification', () => {
    const t0 = new Date('2026-09-26T10:00:00Z');
    expect(echeanceJeton('password_reset', t0).toISOString()).toBe('2026-09-26T11:00:00.000Z');
    expect(echeanceJeton('email_verification', t0).toISOString()).toBe('2026-09-27T10:00:00.000Z');
    expect(DUREE_JETON_MS.password_reset).toBe(3_600_000);
  });

  it('construit les liens du front, avec ou sans barre finale dans APP_URL', () => {
    expect(lienJeton('https://yner.fr', 'password_reset', 'abc_-')).toBe(
      'https://yner.fr/reinitialisation?jeton=abc_-',
    );
    expect(lienJeton('https://yner.fr/', 'email_verification', 'xyz')).toBe(
      'https://yner.fr/verification-email?jeton=xyz',
    );
  });

  describe('jetonUtilisable', () => {
    const maintenant = new Date('2026-09-26T10:00:00Z');
    const valide = {
      email: 'Alice@Exemple.fr',
      expiresAt: new Date('2026-09-26T10:30:00Z'),
      usedAt: null,
    };

    it('accepte un jeton neuf pour la même adresse, casse comprise', () => {
      expect(jetonUtilisable(valide, 'alice@exemple.fr', maintenant)).toBe(true);
    });

    it('refuse un jeton déjà utilisé', () => {
      expect(
        jetonUtilisable({ ...valide, usedAt: maintenant }, 'alice@exemple.fr', maintenant),
      ).toBe(false);
    });

    it('refuse un jeton expiré (échéance comprise)', () => {
      expect(
        jetonUtilisable({ ...valide, expiresAt: maintenant }, 'alice@exemple.fr', maintenant),
      ).toBe(false);
    });

    it('refuse un jeton si l’adresse du compte a changé ou disparu', () => {
      expect(jetonUtilisable(valide, 'bob@exemple.fr', maintenant)).toBe(false);
      expect(jetonUtilisable(valide, null, maintenant)).toBe(false);
    });
  });

  it('attend le temps restant jusqu’au plancher, et rien s’il est dépassé', async () => {
    const debut = Date.now();
    await attendrePlancher(debut, 30);
    expect(Date.now() - debut).toBeGreaterThanOrEqual(29);

    const avant = Date.now();
    await attendrePlancher(avant - 1000, 30);
    expect(Date.now() - avant).toBeLessThan(20);
  });
});

describe('e-mails de sécurité', () => {
  it('le mail de réinitialisation est en français et contient le lien', () => {
    const lien = 'https://yner.fr/reinitialisation?jeton=abc';
    const mail = mailReinitialisation('alice@exemple.fr', lien);
    expect(mail.to).toBe('alice@exemple.fr');
    expect(mail.subject).toBe('Réinitialisation de votre mot de passe');
    expect(mail.text).toContain(lien);
    expect(mail.text).toContain('une heure');
    expect(mail.html).toContain(`href="${lien}"`);
  });

  it('le mail de vérification contient le lien et échappe le HTML', () => {
    const mail = mailVerification('alice@exemple.fr', 'https://yner.fr/v?jeton=a&b="c"');
    expect(mail.subject).toBe('Vérifiez votre adresse e-mail');
    expect(mail.text).toContain('24 heures');
    expect(mail.html).toContain('href="https://yner.fr/v?jeton=a&amp;b=&quot;c&quot;"');
    expect(mail.html).not.toContain('"c"');
  });
});
