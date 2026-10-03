/**
 * Présentation libre (concept, apparence, histoire), résumé des listes et
 * tirage renvoyé par l'étape « tirer » de la création.
 */
import { charger } from '@vtt/rules';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { catalogueReference, type Catalogue } from '../../regles/catalogue.js';
import { appDeTest, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;
type Utilisateur = Awaited<ReturnType<Contexte['utilisateur']>>;

interface Personnage {
  id: string;
  version: number;
  details: { concept: string; appearance: string; backstory: string };
  summary: { tagline: string; highlights: { label: string; value: string }[] };
  etat: { valeurs: Record<string, unknown> };
  tirage?: {
    attributs: string[];
    retenu: { valeurs: number[]; jets: unknown[][] };
    essais: number;
  };
}

describe.skipIf(!TEST_DATABASE_URL)('personnages : présentation, résumé, tirage', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let alice: Utilisateur;
  let bob: Utilisateur;

  beforeEach(async () => {
    t = await appDeTest();
    o = outils(t);
    alice = await t.utilisateur();
    bob = await t.utilisateur();
  });
  afterEach(async () => t.fermer());

  const envoyer = (
    u: Utilisateur,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    payload?: object,
  ) => t.app.inject({ method, url, headers: u.auth, ...(payload ? { payload } : {}) });

  it('concept, apparence et histoire : champs envoyés seulement, diff dans character.updated', async () => {
    const p = (await o.ok(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Aelys',
    })) as unknown as Personnage;
    expect(p.details).toEqual({ concept: '', appearance: '', backstory: '' });

    const r1 = (await o.ok(alice, 'PATCH', `/v1/characters/${p.id}`, {
      version: p.version,
      details: { concept: '  Mage exilée  ', backstory: 'Née à Ashenvale.' },
    })) as unknown as Personnage;
    expect(r1.details).toEqual({
      concept: 'Mage exilée',
      appearance: '',
      backstory: 'Née à Ashenvale.',
    });
    const r2 = (await o.ok(alice, 'PATCH', `/v1/characters/${p.id}`, {
      version: r1.version,
      details: { appearance: 'Cheveux d’argent' },
    })) as unknown as Personnage;
    expect(r2.details).toEqual({
      concept: 'Mage exilée',
      appearance: 'Cheveux d’argent',
      backstory: 'Née à Ashenvale.',
    });

    const [liste] = (await (await envoyer(alice, 'GET', '/v1/characters')).json()) as {
      concept: string;
    }[];
    expect(liste!.concept).toBe('Mage exilée');

    const [, modif] = await t
      .db!.select({ envelope: outbox.envelope })
      .from(outbox)
      .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${p.id}`)
      .orderBy(outbox.id);
    expect((modif!.envelope as { payload: object }).payload).toMatchObject({
      operation: 'profil',
      changes: expect.arrayContaining([
        { path: 'details.concept', before: '', after: 'Mage exilée' },
      ]),
    });

    // Bornes, et personne d'autre que le propriétaire (ou le MJ) ne modifie
    expect(
      (
        await envoyer(alice, 'PATCH', `/v1/characters/${p.id}`, {
          version: r2.version,
          details: { concept: 'x'.repeat(161) },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await envoyer(bob, 'PATCH', `/v1/characters/${p.id}`, {
          version: r2.version,
          details: { concept: 'Pirate' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('résumé des listes : entrées uniques et valeurs clés, recalculé après une écriture', async () => {
    const p = (await o.nainGuerrier(alice, 'Thorin')) as unknown as Personnage;
    expect(p.summary.tagline).toContain('Nain');
    expect(p.summary.tagline).toContain('Guerrier');
    expect(p.summary.highlights.length).toBeGreaterThan(0);
    expect(p.summary.highlights.length).toBeLessThanOrEqual(3);

    const [liste] = (await (await envoyer(alice, 'GET', '/v1/characters')).json()) as {
      summary: Personnage['summary'];
    }[];
    expect(liste!.summary).toEqual(p.summary);
  });

  it('tirage libre : valeurs montrées d’abord, puis réparties sur le même tirage', async () => {
    // D&D dont les caractéristiques se répartissent librement (aucun système de référence ne le fait)
    const reference = catalogueReference();
    const doc = structuredClone(reference.documents('dnd-classic')!.systeme) as unknown as {
      creation: { etapes: { id: string; attribution?: string }[] }[];
    };
    for (const c of doc.creation)
      for (const e of c.etapes) if (e.id === 'caracteristiques') e.attribution = 'libre';
    const charge = charger(doc);
    if (!charge.ok) throw new Error(charge.erreurs[0]?.message);
    const catalogue: Catalogue = {
      ...reference,
      charge: (id) => (id === 'dnd-classic' ? charge.systeme : reference.charge(id)),
    };
    const t2 = await appDeTest({}, { catalogue });
    try {
      const o2 = outils(t2);
      const u = await t2.utilisateur();
      let p = (await o2.ok(u, 'POST', '/v1/characters', {
        systemeId: 'dnd-classic',
        type: 'personnage',
        nom: 'Libre',
      })) as unknown as Personnage;
      p = (await o2.etapes(u, p as never, [
        ['race', { entrees: [{ entree: 'nain' }] }],
        ['profil', { entrees: [{ entree: 'guerrier' }] }],
      ])) as unknown as Personnage;
      const tire = (await o2.ok(u, 'POST', `/v1/characters/${p.id}/creation/caracteristiques`, {
        version: p.version,
      })) as unknown as Personnage;
      const valeurs = tire.tirage!.retenu.valeurs;
      expect(valeurs).toHaveLength(6);
      expect(tire.etat.valeurs.FOR).toBeUndefined();

      const cles = tire.tirage!.attributs;
      const affectation = Object.fromEntries(cles.map((c, i) => [c, cles.length - 1 - i]));
      const reparti = (await o2.ok(u, 'POST', `/v1/characters/${p.id}/creation/caracteristiques`, {
        version: tire.version,
        affectation,
      })) as unknown as Personnage;
      expect(cles.map((c) => reparti.etat.valeurs[c])).toEqual([...valeurs].reverse());
      expect(reparti.tirage!.retenu.valeurs).toEqual(valeurs);
    } finally {
      await t2.fermer();
    }
  });

  it('étape « tirer » : la réponse porte le tirage retenu, dés compris', async () => {
    let p = (await o.ok(alice, 'POST', '/v1/characters', {
      systemeId: 'dnd-classic',
      type: 'personnage',
      nom: 'Brom',
    })) as unknown as Personnage;
    p = (await o.etapes(alice, p as never, [
      ['race', { entrees: [{ entree: 'nain' }] }],
      ['profil', { entrees: [{ entree: 'guerrier' }] }],
    ])) as unknown as Personnage;
    const res = (await o.ok(alice, 'POST', `/v1/characters/${p.id}/creation/caracteristiques`, {
      version: p.version,
    })) as unknown as Personnage;
    expect(res.tirage).toBeDefined();
    expect(res.tirage!.attributs).toHaveLength(6);
    expect(res.tirage!.retenu.valeurs).toHaveLength(6);
    expect(res.tirage!.retenu.jets).toHaveLength(6);
    // Les valeurs tirées sont celles de l'état, dans l'ordre des attributs
    res.tirage!.attributs.forEach((cle, i) =>
      expect(res.etat.valeurs[cle]).toBe(res.tirage!.retenu.valeurs[i]),
    );

    // Une autre étape ne porte pas de tirage
    const voies = (await o.ok(alice, 'POST', `/v1/characters/${p.id}/creation/voies`, {
      version: res.version,
      entrees: [{ entree: 'guerrier-resistance' }],
    })) as unknown as Personnage;
    expect(voies.tirage).toBeUndefined();
  });
});
