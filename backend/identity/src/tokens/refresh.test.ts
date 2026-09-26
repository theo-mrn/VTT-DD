import { describe, expect, it } from 'vitest';
import {
  endSession,
  hashRefreshToken,
  REFRESH_TOKEN_TTL_MS,
  rotateSession,
  SESSION_FAMILY_MAX_MS,
  startSession,
  type NewSession,
  type SessionRecord,
  type SessionStore,
} from './refresh.js';

const JOUR = 24 * 3600 * 1000;
const USER = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

/** Stockage en mémoire respectant le contrat de SessionStore. */
function memoire() {
  const lignes: (SessionRecord & { tokenHash: Buffer })[] = [];
  const store: SessionStore = {
    async transaction(fn) {
      return fn({
        async findByHashForUpdate(h) {
          return lignes.find((l) => l.tokenHash.equals(h)) ?? null;
        },
        async insert(s: NewSession) {
          lignes.push({ ...s, rotatedAt: null, revokedAt: null });
        },
        async markRotated(id, at) {
          lignes.find((l) => l.id === id)!.rotatedAt = at;
        },
        async revokeFamily(familyId, at) {
          for (const l of lignes) if (l.familyId === familyId && !l.revokedAt) l.revokedAt = at;
        },
      });
    },
  };
  return { store, lignes };
}

describe('refresh tokens', () => {
  it('ne stockent que l’empreinte du jeton', async () => {
    const { store, lignes } = memoire();
    const { token } = await startSession(store, USER);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]!.tokenHash.equals(hashRefreshToken(token))).toBe(true);
    expect(JSON.stringify(lignes)).not.toContain(token);
  });

  it('tournent : l’ancien jeton est consommé, le nouveau reste dans la même famille', async () => {
    const { store } = memoire();
    const t0 = new Date('2026-09-25T10:00:00Z');
    const debut = await startSession(store, USER, {}, t0);
    const r = await rotateSession(store, debut.token, {}, new Date(t0.getTime() + 60_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.userId).toBe(USER);
    expect(r.familyId).toBe(debut.familyId);
    expect(r.token).not.toBe(debut.token);
  });

  it('révoquent toute la famille quand un jeton consommé revient (vol)', async () => {
    const { store } = memoire();
    const debut = await startSession(store, USER);
    const r1 = await rotateSession(store, debut.token);
    expect(r1.ok).toBe(true);

    // L'attaquant rejoue l'ancien jeton
    expect(await rotateSession(store, debut.token)).toEqual({ ok: false, reason: 'reused' });
    // L'utilisateur légitime est déconnecté lui aussi : la chaîne entière est morte
    if (r1.ok)
      expect(await rotateSession(store, r1.token)).toEqual({ ok: false, reason: 'revoked' });
  });

  it('refusent un jeton inconnu', async () => {
    const { store } = memoire();
    expect(await rotateSession(store, 'nimporte-quoi')).toEqual({ ok: false, reason: 'unknown' });
  });

  it('expirent après 30 jours sans utilisation', async () => {
    const { store } = memoire();
    const t0 = new Date('2026-09-25T10:00:00Z');
    const { token } = await startSession(store, USER, {}, t0);
    const tard = new Date(t0.getTime() + REFRESH_TOKEN_TTL_MS + 1);
    expect(await rotateSession(store, token, {}, tard)).toEqual({ ok: false, reason: 'expired' });
  });

  it('glissent tant qu’on les utilise, mais pas au-delà de 180 jours après la connexion', async () => {
    const { store } = memoire();
    const t0 = new Date('2026-09-25T10:00:00Z');
    const a = (jours: number) => new Date(t0.getTime() + jours * JOUR);
    let { token } = await startSession(store, USER, {}, t0);

    // Utilisé tous les 20 jours : bien au-delà des 30 jours d'inactivité, toujours connecté
    for (let jour = 20; jour <= 160; jour += 20) {
      const r = await rotateSession(store, token, {}, a(jour));
      expect(r.ok, `jour ${jour}`).toBe(true);
      if (!r.ok) return;
      expect(r.expiresAt.getTime()).toBeLessThanOrEqual(t0.getTime() + SESSION_FAMILY_MAX_MS);
      token = r.token;
    }

    // Jour 179 : encore dans le plafond
    const r179 = await rotateSession(store, token, {}, a(179));
    expect(r179.ok).toBe(true);
    if (!r179.ok) return;
    // Jour 180 : plafond atteint, reconnexion obligatoire même en utilisation continue
    expect(await rotateSession(store, r179.token, {}, a(180))).toEqual({
      ok: false,
      reason: 'expired',
    });
  });

  it('la déconnexion révoque la famille de cet appareil seulement', async () => {
    const { store } = memoire();
    const telephone = await startSession(store, USER);
    const ordinateur = await startSession(store, USER);
    await endSession(store, telephone.token);
    expect(await rotateSession(store, telephone.token)).toEqual({ ok: false, reason: 'revoked' });
    expect((await rotateSession(store, ordinateur.token)).ok).toBe(true);
  });
});
