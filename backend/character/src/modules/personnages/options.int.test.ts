/**
 * Règles optionnelles de la campagne du personnage (droits de campagne simulés) : la
 * fiche d'autorité, les achats, les actions et la fiche lue par dice les respectent ; une
 * option éteinte garde les données sans effet.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type PersonnageApi, type Utilisateur } from '../../test/outils.js';

const SECRET = 'secret-interne-de-test-0123456789abcdef';
const interne = { 'x-internal-secret': SECRET };

type Personnage = PersonnageApi & {
  etat: { possessions: { entree: string; champs: Record<string, unknown> }[] };
  summary: { tagline: string };
};

describe.skipIf(!TEST_DATABASE_URL)('règles optionnelles de la campagne', () => {
  let t: Awaited<ReturnType<typeof appDeTest>>;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let alice: Utilisateur;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({ INTERNAL_API_SECRET: SECRET }, { droits: salles.droits });
    o = outils(t);
    alice = await t.utilisateur();
  });

  afterEach(async () => {
    await t.fermer();
  });

  const lire = (p: { id: string }) =>
    o.ok(alice, 'GET', `/v1/characters/${p.id}`) as Promise<Personnage>;
  const valeur = (p: PersonnageApi, cle: string) => p.fiche.valeurs[cle]?.valeur;

  /** Nain guerrier qui porte une enclume de 500 kg (objet personnalisé). */
  async function surcharge() {
    const thorin = await o.nainGuerrier(alice, 'Thorin');
    return (await o.ok(alice, 'POST', `/v1/characters/${thorin.id}/possessions`, {
      version: thorin.version,
      entree: 'objet-libre',
      champs: { nom: 'Enclume', poids: 500 },
    })) as Personnage;
  }

  it('éteinte (hors campagne ou par défaut) : pas de charge, le poids saisi est gardé', async () => {
    const thorin = await surcharge();
    expect(valeur(thorin, 'charge')).toBeUndefined();
    expect(thorin.etat.possessions.find((p) => p.entree === 'objet-libre')?.champs.poids).toBe(500);
  });

  it('allumée par la campagne : charge, malus de Défense et de Contact, jusqu’à dice', async () => {
    const thorin = await surcharge();
    const defense = Number(valeur(thorin, 'Defense'));
    const contact = Number(valeur(thorin, 'Contact'));

    salles.regler(thorin.id, { encombrement: true });
    const regle = await lire(thorin);
    expect(Number(valeur(regle, 'charge'))).toBeGreaterThanOrEqual(501.5);
    expect(valeur(regle, 'chargeMax')).toBe(Number(valeur(regle, 'FOR')) * 5);
    expect(valeur(regle, 'surcharge')).toBe(true);
    expect(valeur(regle, 'Defense')).toBe(defense - 2);
    expect(valeur(regle, 'Contact')).toBe(contact - 2);

    // Les écritures répondent avec la même fiche (calcul d'autorité)
    const ecrit = (await o.ok(alice, 'PATCH', `/v1/characters/${thorin.id}`, {
      version: regle.version,
      nom: 'Thorin II',
    })) as Personnage;
    expect(valeur(ecrit, 'Contact')).toBe(contact - 2);

    // Fiche lue par dice pour les variables des jets (`1d20 + Contact`)
    const sheet = await t.app.inject({
      method: 'GET',
      url: `/internal/characters/${thorin.id}/sheet?userId=${alice.id}`,
      headers: interne,
    });
    expect(sheet.statusCode).toBe(200);
    const valeurs = (sheet.json() as { valeurs: Record<string, { valeur: unknown }> }).valeurs;
    expect(valeurs.Contact!.valeur).toBe(contact - 2);
    expect(valeurs.charge).toBeDefined();

    // Rééteinte : les valeurs d'origine reviennent, le poids est toujours là
    salles.regler(thorin.id, {});
    const eteinte = await lire(thorin);
    expect(valeur(eteinte, 'Contact')).toBe(contact);
    expect(valeur(eteinte, 'charge')).toBeUndefined();
    expect(eteinte.etat.possessions.find((p) => p.entree === 'objet-libre')?.champs.poids).toBe(
      500,
    );
  });

  it('action : le jet d’attaque lit le Contact de la campagne', async () => {
    const thorin = await surcharge();
    const gimli = await o.nainGuerrier(alice, 'Gimli');
    const attaque = async () => {
      t.des.imposer(10, 1);
      const res = await o.requete(alice, 'POST', `/v1/characters/${thorin.id}/actions/attaque`, {
        parametres: { score: 'Contact', arme: 'epee-longue' },
        cibleId: gimli.id,
      });
      expect(res.statusCode).toBe(200);
      return (res.json() as { resultat: { jet: { total: number } } }).resultat.jet.total;
    };
    const sans = await attaque();
    salles.regler(thorin.id, { encombrement: true });
    expect(await attaque()).toBe(sans - 2);
  });
});
