/**
 * Inventaire par HTTP : dons d'objets entre personnages d'une même campagne (droits de
 * campagne simulés), objets cachés aux autres joueurs, dossiers d'inventaire, formules
 * propres d'un exemplaire vérifiées par le service.
 */
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outbox } from '../../db/schema.js';
import { appDeTest, droitsSimules, TEST_DATABASE_URL } from '../../test/app-de-test.js';
import { outils, type PersonnageApi, type Utilisateur } from '../../test/outils.js';

type Contexte = Awaited<ReturnType<typeof appDeTest>>;

interface Possession {
  entree: string;
  exemplaire?: string;
  quantite?: number;
  actif: boolean;
  hidden?: boolean;
  folder?: string;
  champs: Record<string, unknown>;
}
type Personnage = PersonnageApi & {
  etat: { possessions: Possession[]; folders: { id: string; name: string }[] };
  fiche: { possessions: { entree: string }[] };
};

const CAMPAGNE = '0199a000-0000-7000-8000-000000000001';

describe.skipIf(!TEST_DATABASE_URL)('inventaire : dons, objets cachés, dossiers, formules', () => {
  let t: Contexte;
  let o: ReturnType<typeof outils>;
  let salles: ReturnType<typeof droitsSimules>;
  let alice: Utilisateur;
  let bob: Utilisateur;
  let mj: Utilisateur;
  let etranger: Utilisateur;

  beforeEach(async () => {
    salles = droitsSimules();
    t = await appDeTest({}, { droits: salles.droits });
    o = outils(t);
    [alice, bob, mj, etranger] = await Promise.all([
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
      t.utilisateur(),
    ]);
  });

  afterEach(async () => {
    await t.fermer();
  });

  const url = (p: { id: string }, suite = '') => `/v1/characters/${p.id}${suite}`;
  const lire = (u: Utilisateur, p: { id: string }) => o.ok(u, 'GET', url(p)) as Promise<Personnage>;
  const poser = (u: Utilisateur, p: { id: string; version: number }, corps: object) =>
    o.ok(u, 'POST', url(p, '/possessions'), {
      version: p.version,
      ...corps,
    }) as Promise<Personnage>;
  const de = (p: Personnage, entree: string) =>
    p.etat.possessions.filter((x) => x.entree === entree);

  /** Deux héros engagés dans la même campagne, incarnés par leurs propriétaires ; le MJ écrit sur les deux. */
  async function table() {
    const thorin = (await o.nainGuerrier(alice, 'Thorin')) as Personnage;
    const grok = (await o.nainGuerrier(bob, 'Grok')) as Personnage;
    const membres = [alice, bob, mj];
    for (const p of [thorin, grok])
      for (const u of membres) {
        const incarne = u.id === p.ownerId;
        salles.accorder(p.id, u.id, {
          lecture: true,
          ecriture: incarne || u === mj,
          engage: true,
          incarne,
          autreIncarnateur: !incarne,
          campagnes: [CAMPAGNE],
          incarnateurs: { [CAMPAGNE]: p.ownerId },
          ...(u === mj ? { campagnesMj: [CAMPAGNE] } : {}),
        });
      }
    return { thorin, grok };
  }

  const evenements = async (id: string) =>
    (
      await t
        .db!.select()
        .from(outbox)
        .where(sql`${outbox.envelope}->'aggregate'->>'id' = ${id}`)
    )
      .map(
        (l) =>
          l.envelope as {
            type: string;
            visibility: string;
            roomId: string | null;
            payload: Record<string, unknown>;
          },
      )
      .filter((e) => e.type === 'character.updated');

  it('donne une partie des unités, puis le reste, dans une transaction et deux événements', async () => {
    const { thorin, grok } = await table();
    const avec = await poser(alice, thorin, { entree: 'petite-potion-de-vie', quantite: 5 });

    const apres = (await o.ok(alice, 'POST', url(thorin, '/possessions/give'), {
      version: avec.version,
      to: grok.id,
      entree: 'petite-potion-de-vie',
      quantity: 2,
    })) as Personnage;
    expect(apres.version).toBe(avec.version + 1);
    expect(de(apres, 'petite-potion-de-vie')).toMatchObject([{ quantite: 3 }]);
    const recu = await lire(bob, grok);
    expect(recu.version).toBe(grok.version + 1);
    expect(de(recu, 'petite-potion-de-vie')).toMatchObject([{ quantite: 2 }]);

    // Le reste : l'exemplaire quitte le donneur, les unités s'ajoutent chez le receveur
    const vide = (await o.ok(alice, 'POST', url(thorin, '/possessions/give'), {
      version: apres.version,
      to: grok.id,
      entree: 'petite-potion-de-vie',
    })) as Personnage;
    expect(de(vide, 'petite-potion-de-vie')).toEqual([]);
    expect(de(await lire(bob, grok), 'petite-potion-de-vie')).toMatchObject([{ quantite: 5 }]);

    // Un événement par personnage ; celui du receveur dans la campagne, pour qui l'incarne
    const recus = await evenements(grok.id);
    const recue = recus.filter((e) => e.payload.operation === 'possession.recue');
    expect(recue).toHaveLength(2);
    recue.sort((a, b) => Number(a.payload.version) - Number(b.payload.version));
    expect(recue[0]).toMatchObject({
      roomId: CAMPAGNE,
      visibility: 'gm_only',
      payload: { visibleToUsers: [bob.id], don: { quantity: 2, from: thorin.id, to: grok.id } },
    });
    const dons = (await evenements(thorin.id)).filter(
      (e) => e.payload.operation === 'possession.don',
    );
    expect(dons).toHaveLength(2);
  });

  it('donne une arme : un nouvel exemplaire rangé, avec ses valeurs propres', async () => {
    const { thorin, grok } = await table();
    const nommee = await poser(alice, thorin, {
      entree: 'epee-longue',
      champs: { nom: 'Orcrist', degats: '1d10-CON+4' },
    });
    await o.ok(alice, 'POST', url(thorin, '/possessions/give'), {
      version: nommee.version,
      to: grok.id,
      entree: 'epee-longue',
    });
    const epees = de(await lire(bob, grok), 'epee-longue');
    expect(epees).toHaveLength(2);
    expect(epees[1]).toMatchObject({
      exemplaire: '2',
      actif: false,
      champs: { nom: 'Orcrist', degats: '1d10-CON+4' },
    });
  });

  it('refuse un don hors campagne commune, sans droit, en trop ou avec une version périmée', async () => {
    const { thorin, grok } = await table();
    const donner = (u: Utilisateur, corps: object) =>
      o.requete(u, 'POST', url(thorin, '/possessions/give'), {
        version: thorin.version,
        to: grok.id,
        entree: 'epee-longue',
        ...corps,
      });
    // Bob lit Thorin mais n'écrit pas dessus
    expect((await donner(bob, {})).statusCode).toBe(403);
    // Trop d'unités, version périmée, à soi-même
    expect((await donner(alice, { quantity: 3 })).statusCode).toBe(422);
    expect((await donner(alice, { version: thorin.version - 1 })).statusCode).toBe(409);
    expect((await donner(alice, { to: thorin.id })).statusCode).toBe(400);
    // Personnage d'un étranger, hors de toute campagne commune
    const solo = await o.nainGuerrier(etranger, 'Solo');
    salles.accorder(solo.id, alice.id, { lecture: true, ecriture: false, campagnes: ['autre'] });
    const hors = await donner(alice, { to: solo.id });
    expect([hors.statusCode, hors.json().code]).toEqual([403, 'hors_campagne']);
    // Rien n'a bougé
    expect(de(await lire(alice, thorin), 'epee-longue')).toHaveLength(1);
    expect(de(await lire(bob, grok), 'epee-longue')).toHaveLength(1);
  });

  it('le MJ donne un objet d’un personnage à un autre', async () => {
    const { thorin, grok } = await table();
    const r = await o.requete(mj, 'POST', url(thorin, '/possessions/give'), {
      version: thorin.version,
      to: grok.id,
      entree: 'epee-longue',
    });
    expect(r.statusCode).toBe(200);
    // Même épée que la sienne : les unités s'ajoutent
    expect(de(await lire(bob, grok), 'epee-longue')).toMatchObject([{ quantite: 2 }]);
    expect(de(await lire(alice, thorin), 'epee-longue')).toEqual([]);
  });

  it('un objet caché : invisible pour les autres joueurs, visible du propriétaire et du MJ', async () => {
    const { thorin } = await table();
    const cache = await poser(alice, thorin, {
      entree: 'petite-potion-de-vie',
      hidden: true,
      quantite: 2,
    });
    expect(de(cache, 'petite-potion-de-vie')).toMatchObject([{ hidden: true }]);

    const vuParBob = await lire(bob, thorin);
    expect(de(vuParBob, 'petite-potion-de-vie')).toEqual([]);
    expect(vuParBob.fiche.possessions.some((p) => p.entree === 'petite-potion-de-vie')).toBe(false);
    expect(vuParBob.version).toBe(cache.version);
    expect(de(await lire(mj, thorin), 'petite-potion-de-vie')).toHaveLength(1);
    expect(de(await lire(alice, thorin), 'petite-potion-de-vie')).toHaveLength(1);
    expect((await o.requete(bob, 'GET', url(thorin, '/achats'))).statusCode).toBe(200);

    // Rendu visible
    const visible = await poser(alice, cache, { entree: 'petite-potion-de-vie', hidden: false });
    expect(de(visible, 'petite-potion-de-vie')[0]!.hidden).toBeUndefined();
    expect(de(await lire(bob, thorin), 'petite-potion-de-vie')).toHaveLength(1);
  });

  it('dossiers : créer, ranger un objet, renommer, supprimer (l’objet revient à la racine)', async () => {
    const { thorin } = await table();
    const dossiers = (await o.ok(alice, 'PUT', url(thorin, '/folders'), {
      version: thorin.version,
      folders: [{ name: 'Sac à dos' }, { name: 'Coffre' }],
    })) as Personnage;
    expect(dossiers.etat.folders).toEqual([
      { id: 'dossier-1', name: 'Sac à dos' },
      { id: 'dossier-2', name: 'Coffre' },
    ]);
    const range = await poser(alice, dossiers, { entree: 'epee-longue', folder: 'dossier-2' });
    expect(de(range, 'epee-longue')[0]!.folder).toBe('dossier-2');
    const inconnu = await o.requete(alice, 'POST', url(thorin, '/possessions'), {
      version: range.version,
      entree: 'epee-longue',
      folder: 'nulle-part',
    });
    expect([inconnu.statusCode, inconnu.json().code]).toEqual([422, 'dossier_inconnu']);

    // Coffre supprimé, sac renommé et placé en second
    const suite = (await o.ok(alice, 'PUT', url(thorin, '/folders'), {
      version: range.version,
      folders: [{ name: 'Bourse' }, { id: 'dossier-1', name: 'Besace' }],
    })) as Personnage;
    expect(suite.etat.folders).toEqual([
      { id: 'dossier-3', name: 'Bourse' },
      { id: 'dossier-1', name: 'Besace' },
    ]);
    // Le nouvel identifiant ne reprend jamais celui d'un dossier encore présent
    expect(de(suite, 'epee-longue')[0]!.folder).toBeUndefined();
    // Un joueur de la table ne range pas l'inventaire des autres
    const refuse = await o.requete(bob, 'PUT', url(thorin, '/folders'), {
      version: suite.version,
      folders: [],
    });
    expect(refuse.statusCode).toBe(403);
  });

  it('formule propre d’un exemplaire : en clés nues, gardée telle que saisie, refusée si invalide', async () => {
    const { thorin } = await table();
    const ok = await poser(alice, thorin, {
      entree: 'epee-longue',
      champs: { degats: '1d6-CON+8' },
    });
    expect(de(ok, 'epee-longue')[0]!.champs.degats).toBe('1d6-CON+8');
    for (const [champs, attendu] of [
      [{ degats: '1d6-CONS+8' }, /« CONS » n’est pas un attribut du personnage/],
      [{ degats: '1d6 + @INCONNU' }, /Attribut inconnu/],
      [{ bonusDegats: '1d4' }, /dés ne sont pas permis/],
      [{ degats: `1${' + 1'.repeat(200)}` }, /500 caractères/],
      [{ nbDes: 'deux' }, /nombre attendu/],
      [{ inconnu: 1 }, /Champ inconnu/],
    ] as const) {
      const r = await o.requete(alice, 'POST', url(thorin, '/possessions'), {
        version: ok.version,
        entree: 'epee-longue',
        champs,
      });
      expect([r.statusCode, r.json().code], JSON.stringify(champs)).toEqual([
        422,
        'champs_invalides',
      ]);
      expect(r.json().detail).toMatch(attendu);
    }
  });

  it('ajout configuré : un nouvel exemplaire complet en une requête et un seul événement', async () => {
    const { thorin } = await table();
    const rangee = (await o.ok(alice, 'PUT', url(thorin, '/folders'), {
      version: thorin.version,
      folders: [{ name: 'Râtelier' }],
    })) as Personnage;
    const avant = (await evenements(thorin.id)).length;
    const bonus = { sur: 'attribut', attribut: 'Defense', operation: 'ajouter', valeur: '1' };
    const r = await poser(alice, rangee, {
      entree: 'epee-longue',
      nouveau: true,
      champs: { nom: 'Dard', degats: '1d8+DEX' },
      effets: [bonus],
      actif: false,
      hidden: true,
      folder: rangee.etat.folders[0]!.id,
    });
    expect(de(r, 'epee-longue').at(-1)).toMatchObject({
      actif: false,
      hidden: true,
      folder: rangee.etat.folders[0]!.id,
      champs: { nom: 'Dard', degats: '1d8+DEX' },
    });
    expect(await evenements(thorin.id)).toHaveLength(avant + 1);
  });
});
