/**
 * Discussion de la salle : envoi par les membres, lecture paginée et en
 * polling, suppression par l'auteur ou le MJ, limite de débit.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import {
  appDeTest,
  outils,
  TEST_DATABASE_URL,
  type Contexte,
  type Utilisateur,
} from '../../test/app-de-test.js';

interface Message {
  id: string;
  auteur: { id: string; nom: string | null; avatarUrl: string | null };
  texte: string;
  createdAt: string;
}

describe.skipIf(!TEST_DATABASE_URL)('messages de la salle', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let mj: Utilisateur;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest({ RATE_LIMIT_MESSAGES_MAX: '5' });
    o = outils(t);
    mj = await t.utilisateur('Maître');
    alice = await t.utilisateur('Alice');
    bob = await t.utilisateur('Bob');
  });

  afterEach(async () => {
    await t.fermer();
  });

  const ecrire = (u: Utilisateur, roomId: string, texte: string) =>
    o.requete(u, 'POST', `/v1/rooms/${roomId}/messages`, { texte });

  it('les membres écrivent et lisent, avec l’auteur ; événement room.message_posted', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    const res = await ecrire(alice, id, '  Bonjour la table  ');
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json()).toMatchObject({
      texte: 'Bonjour la table',
      auteur: { id: alice.id, nom: 'Alice', avatarUrl: null },
      createdAt: expect.any(String),
    });
    await ecrire(mj, id, 'Bienvenue');

    const liste = await o.ok<Message[]>(alice, 'GET', `/v1/rooms/${id}/messages`);
    expect(liste.map((m) => [m.auteur.nom, m.texte])).toEqual([
      ['Alice', 'Bonjour la table'],
      ['Maître', 'Bienvenue'],
    ]);

    const [evenement] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(
        sql`${outbox.envelope}->>'roomId' = ${id} and ${outbox.envelope}->>'type' = 'room.message_posted'`,
      )
      .orderBy(outbox.id)
      .limit(1);
    expect(evenement!.envelope).toMatchObject({
      payload: { id: liste[0]!.id, auteurId: alice.id, texte: 'Bonjour la table' },
    });
  });

  it('pages : derniers messages, page précédente (avant), nouveaux messages (apres)', async () => {
    const id = await o.salle(mj);
    const ids: string[] = [];
    for (let i = 1; i <= 5; i++) {
      // Débit limité à 5 par minute dans ce test : pile la limite
      ids.push(
        (await o.ok<Message>(mj, 'POST', `/v1/rooms/${id}/messages`, { texte: `m${i}` })).id,
      );
    }
    const textes = (l: Message[]) => l.map((m) => m.texte);
    const url = `/v1/rooms/${id}/messages`;
    expect(textes(await o.ok<Message[]>(mj, 'GET', `${url}?limite=2`))).toEqual(['m4', 'm5']);
    expect(textes(await o.ok<Message[]>(mj, 'GET', `${url}?limite=2&avant=${ids[3]}`))).toEqual([
      'm2',
      'm3',
    ]);
    expect(textes(await o.ok<Message[]>(mj, 'GET', `${url}?apres=${ids[2]}`))).toEqual([
      'm4',
      'm5',
    ]);
    expect(await o.ok<Message[]>(mj, 'GET', `${url}?apres=${ids[4]}`)).toEqual([]);
    for (const q of ['limite=0', 'limite=101', `avant=${ids[1]}&apres=${ids[0]}`, 'avant=x']) {
      expect((await o.requete(mj, 'GET', `${url}?${q}`)).statusCode, q).toBe(400);
    }
  });

  it('refus : non-membre, message vide ou trop long, débit dépassé', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice]);
    expect((await ecrire(bob, id, 'Coucou')).statusCode).toBe(404);
    expect((await o.requete(bob, 'GET', `/v1/rooms/${id}/messages`)).statusCode).toBe(404);
    expect((await ecrire(alice, id, '   ')).statusCode).toBe(400);
    expect((await ecrire(alice, id, 'x'.repeat(1001))).statusCode).toBe(400);
    expect((await ecrire(alice, id, 'x'.repeat(1000))).statusCode).toBe(201);

    for (let i = 0; i < 4; i++) expect((await ecrire(alice, id, `m${i}`)).statusCode).toBe(201);
    const trop = await ecrire(alice, id, 'encore');
    expect(trop.json()).toMatchObject({ status: 429, code: 'trop_de_messages' });
    expect(trop.headers['retry-after']).toBe('60');
    // La limite est propre à chaque membre
    expect((await ecrire(mj, id, 'Doucement')).statusCode).toBe(201);
  });

  it('suppression : l’auteur ou le MJ, jamais un autre joueur', async () => {
    const id = await o.salle(mj, 'dnd-classic', [alice, bob]);
    const m1 = (await ecrire(alice, id, 'un')).json() as Message;
    const m2 = (await ecrire(alice, id, 'deux')).json() as Message;
    const supprimer = (u: Utilisateur, m: string) =>
      o.requete(u, 'DELETE', `/v1/rooms/${id}/messages/${m}`);

    expect((await supprimer(bob, m1.id)).statusCode).toBe(403);
    expect((await supprimer(alice, m1.id)).statusCode).toBe(204);
    expect((await supprimer(alice, m1.id)).statusCode).toBe(404);
    expect((await supprimer(mj, m2.id)).statusCode).toBe(204);
    expect(await o.ok(bob, 'GET', `/v1/rooms/${id}/messages`)).toEqual([]);
    // Un message d'une autre salle est introuvable ici
    const autre = await o.salle(bob);
    const ailleurs = (await ecrire(bob, autre, 'ailleurs')).json() as Message;
    expect((await supprimer(mj, ailleurs.id)).statusCode).toBe(404);
  });
});
