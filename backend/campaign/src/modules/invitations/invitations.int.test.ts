/**
 * Invitations : code aléatoire stocké haché, expiration, nombre
 * d'utilisations, adhésion comme joueur.
 */
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invitations } from '../../db/schema.js';
import {
  appDeTest,
  outils,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';
import { empreinte } from './codes.js';

interface Invitation {
  code: string;
  url: string;
  expireLe: string;
  utilisations: number;
}

describe.skipIf(!TEST_DATABASE_URL)('invitations', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    mj = await t.utilisateur();
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const rejoindre = (u: Utilisateur, code: string) =>
    o.requete(u, 'POST', '/v1/rooms/rejoindre', { code });

  it('crée un lien, stocke seulement l’empreinte, fait rejoindre comme joueur', async () => {
    const id = await o.salle(mj);
    const res = await o.requete(mj, 'POST', `/v1/rooms/${id}/invitations`, {
      expireDans: 3600,
      utilisations: 5,
    });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const inv = res.json() as Invitation;
    expect(inv.code).toMatch(/^inv_[A-Za-z0-9_-]{27}$/);
    expect(inv.url).toBe(`https://jeu.test.local/rejoindre/${inv.code}`);
    expect(new Date(inv.expireLe).getTime() - Date.now()).toBeGreaterThan(3500_000);
    expect(inv.utilisations).toBe(5);

    const [ligne] = await t.db!.select().from(invitations).where(eq(invitations.roomId, id));
    expect(ligne!.codeHash).toBe(empreinte(inv.code));
    expect(JSON.stringify(ligne)).not.toContain(inv.code);

    const r = await rejoindre(alice, inv.code);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ id, role: 'joueur' });
    // Déjà membre : la salle est renvoyée sans consommer d'utilisation
    expect((await rejoindre(alice, inv.code)).statusCode).toBe(200);
    expect((await rejoindre(mj, inv.code)).json()).toMatchObject({ role: 'mj' });
    const [apres] = await t.db!.select().from(invitations).where(eq(invitations.roomId, id));
    expect(apres!.utilisations).toBe(1);
  });

  it('refuse un code faux (404), expiré ou épuisé (410)', async () => {
    const id = await o.salle(mj);
    for (const code of ['nimporte-quoi', `inv_${'A'.repeat(27)}`]) {
      const res = await rejoindre(alice, code);
      expect(res.statusCode, code).toBe(404);
    }

    const unique = await o.ok<Invitation>(mj, 'POST', `/v1/rooms/${id}/invitations`, {
      utilisations: 1,
    });
    expect((await rejoindre(alice, unique.code)).statusCode).toBe(200);
    expect((await rejoindre(bob, unique.code)).json()).toMatchObject({
      status: 410,
      code: 'invitation_epuisee',
    });

    const courte = await o.ok<Invitation>(mj, 'POST', `/v1/rooms/${id}/invitations`, {
      expireDans: 60,
    });
    t.avancer(61_000);
    expect((await rejoindre(bob, courte.code)).json()).toMatchObject({
      status: 410,
      code: 'invitation_expiree',
    });
    expect((await o.requete(bob, 'GET', `/v1/rooms/${id}`)).statusCode).toBe(404);
  });

  it('bornes : durée et utilisations limitées, MJ seulement', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    for (const corps of [{ expireDans: 10 }, { expireDans: 31 * 86400 }, { utilisations: 0 }]) {
      expect((await o.requete(mj, 'POST', `/v1/rooms/${id}/invitations`, corps)).statusCode).toBe(
        400,
      );
    }
    expect((await o.requete(alice, 'POST', `/v1/rooms/${id}/invitations`, {})).statusCode).toBe(
      403,
    );
    const defaut = await o.ok<Invitation>(mj, 'POST', `/v1/rooms/${id}/invitations`, {});
    expect(defaut.utilisations).toBe(10);
  });

  it('deux adhésions simultanées ne dépassent pas le nombre d’utilisations', async () => {
    const id = await o.salle(mj);
    const inv = await o.ok<Invitation>(mj, 'POST', `/v1/rooms/${id}/invitations`, {
      utilisations: 1,
    });
    const statuts = (await Promise.all([rejoindre(alice, inv.code), rejoindre(bob, inv.code)]))
      .map((r) => r.statusCode)
      .sort();
    expect(statuts).toEqual([200, 410]);
  });
});
