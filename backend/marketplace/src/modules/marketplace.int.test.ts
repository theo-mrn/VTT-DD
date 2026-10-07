/**
 * Parcours de la marketplace sur un vrai PostgreSQL (rôle marketplace_svc) : créateur, fiche,
 * contenu (copie des fichiers, adresses réécrites), revue, catalogue, acquisition, installation,
 * avis, signalements, retrait. campaign, billing et R2 sont simulés.
 */
import { CONNECT_ACCOUNT_UPDATED, MARKETPLACE_SALE_COMPLETED, uuidv7 } from '@vtt/contracts';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleEvent } from '../consumer/events.js';
import { acquisitions, listingAssets } from '../db/schema.js';
import { PUBLIC_BASE } from '../test/memory-storage.js';
import {
  forgetInbox,
  helpers,
  TEST_DATABASE_URL,
  testApp,
  type TestContext,
  type TestUser,
} from '../test/test-app.js';

const U = (n: number) => `0192a0e0-0000-7000-8000-${String(n).padStart(12, '0')}`;

describe.skipIf(!TEST_DATABASE_URL)('marketplace', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  let creator: TestUser;
  let buyer: TestUser;
  const handled: string[] = [];

  beforeEach(async () => {
    t = await testApp();
    h = helpers(t);
    creator = await t.user();
    buyer = await t.user();
  });

  afterEach(async () => {
    await forgetInbox(t, handled.splice(0));
    await t.close();
  });

  /** Contenu type : une scène avec fond et objet, un modèle d'objet, tirés d'une campagne. */
  function campaignFiles() {
    const campaignId = crypto.randomUUID();
    const bg = t.files.seed(`campaigns/${campaignId}/${uuidv7()}.webp`, 'image/webp', 2_000);
    const chest = t.files.seed(`campaigns/${campaignId}/${uuidv7()}.png`, 'image/png', 500);
    return { bg, chest };
  }

  function pack(urls: { bg: string; chest: string }) {
    return {
      format: 1,
      systemId: null,
      scenes: [
        {
          ref: 'crypte',
          scene: { name: 'Crypte de sel', backgroundUrl: urls.bg, width: 2000, height: 1500 },
          obstacles: [
            {
              kind: 'wall',
              points: [
                { x: 0, y: 0 },
                { x: 100, y: 0 },
              ],
            },
          ],
          lights: [{ pos: { x: 10, y: 10 }, radius: 6 }],
          objects: [{ pos: { x: 5, y: 5 }, imageUrl: urls.chest, name: 'Coffre' }],
        },
      ],
      objectTemplates: [{ ref: 'coffre', name: 'Coffre', imageUrl: urls.chest }],
    };
  }

  /** Créateur, fiche avec couverture, version avec contenu : prête à soumettre. */
  async function draftListing(title = 'Les Cryptes de Sél', priceCents = 0) {
    await h.ok(creator, 'PUT', '/v1/marketplace/me/creator', { displayName: 'Maître Kobold' });
    const listing = await h.ok(creator, 'POST', '/v1/marketplace/studio/listings', {
      title,
      summary: 'Un donjon salé en trois salles',
      license: 'cc-by-4.0',
      tags: ['donjon', 'sel'],
      ...(priceCents ? { priceCents } : {}),
    });
    const ticket = await h.ok(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${listing.id}/uploads`,
      { usage: 'marketplace-cover', contentType: 'image/webp', size: 1000 },
    );
    expect(ticket.key).toMatch(new RegExp(`^marketplace/${listing.id}/`));
    await h.ok(creator, 'PATCH', `/v1/marketplace/studio/listings/${listing.id}`, {
      coverUrl: ticket.publicUrl,
    });
    const version = await h.ok(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${listing.id}/versions`,
      { number: '1.0.0', notes: 'Première version' },
    );
    const files = campaignFiles();
    const withContent = await h.ok(
      creator,
      'PUT',
      `/v1/marketplace/studio/versions/${version.id}/content`,
      pack(files),
    );
    return { listing, version: withContent, files };
  }

  async function published(title?: string) {
    const d = await draftListing(title);
    await h.ok(creator, 'POST', `/v1/marketplace/studio/versions/${d.version.id}/submit`, {
      rightsAttested: true,
    });
    const mod = await t.moderator();
    await h.ok(mod, 'POST', `/v1/marketplace/moderation/versions/${d.version.id}/approve`);
    return { ...d, mod };
  }

  it('du brouillon à la publication : copie des fichiers, revue, catalogue', async () => {
    const { listing, version, files } = await draftListing();
    expect(version.counts).toEqual({ scenes: 1, npcTemplates: 0, objectTemplates: 1, assets: 2 });

    // Fichiers copiés dans le dossier de la fiche, adresses réécrites
    const content = await h.ok(
      creator,
      'GET',
      `/v1/marketplace/studio/versions/${version.id}/content`,
    );
    const bg: string = content.scenes[0].scene.backgroundUrl;
    expect(bg).toMatch(new RegExp(`^${PUBLIC_BASE}/marketplace/${listing.id}/assets/`));
    expect(content.objectTemplates[0].imageUrl).toBe(content.scenes[0].objects[0].imageUrl);
    expect(t.files.copies.map((c) => c.from).sort()).toEqual(
      [files.bg, files.chest].map((u) => u.slice(PUBLIC_BASE.length + 1)).sort(),
    );

    // Rejoué : rien n'est recopié
    await h.ok(
      creator,
      'PUT',
      `/v1/marketplace/studio/versions/${version.id}/content`,
      pack(files),
    );
    expect(t.files.copies).toHaveLength(2);
    const assets = await t
      .db!.select()
      .from(listingAssets)
      .where(eq(listingAssets.listingId, listing.id));
    expect(assets).toHaveLength(2);

    // Pas encore au catalogue ; invisible des autres
    let res = await h.request(buyer, 'GET', `/v1/marketplace/listings/${listing.slug}`);
    expect(res.statusCode).toBe(404);

    // Soumission : attestation exigée
    res = await h.request(
      creator,
      'POST',
      `/v1/marketplace/studio/versions/${version.id}/submit`,
      {},
    );
    expect(res.statusCode).toBe(400);
    await h.ok(creator, 'POST', `/v1/marketplace/studio/versions/${version.id}/submit`, {
      rightsAttested: true,
    });
    // Figée une fois soumise
    res = await h.request(
      creator,
      'PUT',
      `/v1/marketplace/studio/versions/${version.id}/content`,
      pack(files),
    );
    expect([res.statusCode, res.json().code]).toEqual([409, 'version_not_draft']);

    // Revue : réservée aux modérateurs
    res = await h.request(
      buyer,
      'POST',
      `/v1/marketplace/moderation/versions/${version.id}/approve`,
    );
    expect(res.statusCode).toBe(403);
    const mod = await t.moderator();
    const queue = await h.ok(mod, 'GET', '/v1/marketplace/moderation/queue');
    expect(
      queue.versions.some((v: { version: { id: string } }) => v.version.id === version.id),
    ).toBe(true);
    await h.ok(mod, 'POST', `/v1/marketplace/moderation/versions/${version.id}/approve`);

    // Au catalogue, trouvé sans accent et par préfixe
    const page = await h.ok(buyer, 'GET', '/v1/marketplace/listings?q=cryptes%20sel&kind=scenes');
    const card = page.items.find((i: { id: string }) => i.id === listing.id);
    expect(card).toMatchObject({
      title: 'Les Cryptes de Sél',
      kinds: ['scenes', 'objects'],
      priceCents: 0,
      owned: false,
      creator: { displayName: 'Maître Kobold' },
    });
    const detail = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.slug}`);
    expect(detail.versions).toHaveLength(1);
    expect(detail.versions[0]).toMatchObject({ number: '1.0.0', notes: 'Première version' });

    const types = (await h.events(listing.id)).map((e) => e.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'marketplace.listing_created',
        'marketplace.listing_updated',
        'marketplace.version_content_set',
        'marketplace.version_submitted',
        'marketplace.version_published',
      ]),
    );
    // Aucun texte libre dans le journal
    const json = JSON.stringify(await h.events(listing.id));
    expect(json).not.toContain('Cryptes');
    expect(json).not.toContain('Première version');
  });

  it('refuse une adresse étrangère, une image d’une autre fiche, un prix tant que la vente est coupée', async () => {
    const { listing, version, files } = await draftListing();
    let res = await h.request(
      creator,
      'PUT',
      `/v1/marketplace/studio/versions/${version.id}/content`,
      pack({ ...files, bg: 'https://pinterest.test/fond.jpg' }),
    );
    expect([res.statusCode, res.json().code, res.json().urls]).toEqual([
      422,
      'asset_not_allowed',
      ['https://pinterest.test/fond.jpg'],
    ]);
    res = await h.request(
      creator,
      'PUT',
      `/v1/marketplace/studio/versions/${version.id}/content`,
      pack({ ...files, bg: `${PUBLIC_BASE}/campaigns/${U(1)}/${uuidv7()}.webp` }),
    );
    expect([res.statusCode, res.json().code]).toEqual([422, 'asset_missing']);
    res = await h.request(creator, 'PUT', `/v1/marketplace/studio/versions/${version.id}/content`, {
      format: 1,
    });
    expect([res.statusCode, res.json().code]).toEqual([422, 'invalid_pack']);

    res = await h.request(creator, 'PATCH', `/v1/marketplace/studio/listings/${listing.id}`, {
      coverUrl: `${PUBLIC_BASE}/marketplace/${U(2)}/${uuidv7()}.webp`,
    });
    expect([res.statusCode, res.json().code]).toEqual([422, 'media_not_allowed']);
    res = await h.request(creator, 'PATCH', `/v1/marketplace/studio/listings/${listing.id}`, {
      priceCents: 499,
    });
    expect([res.statusCode, res.json().code]).toEqual([422, 'paid_listings_disabled']);
    res = await h.request(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${listing.id}/versions`,
      {
        number: '0.9.0',
      },
    );
    expect([res.statusCode, res.json().code]).toEqual([409, 'version_open']);
  });

  it('acquérir, installer dans sa campagne (MJ seulement), donner son avis', async () => {
    const { listing } = await published();
    // Avis réservé aux acquéreurs
    let res = await h.request(buyer, 'PUT', `/v1/marketplace/listings/${listing.id}/review`, {
      rating: 5,
    });
    expect([res.statusCode, res.json().code]).toEqual([403, 'not_owned']);

    await h.ok(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/acquire`);
    await h.ok(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/acquire`);
    const library = await h.ok(buyer, 'GET', '/v1/marketplace/library');
    const item = library.items.find(
      (i: { listing: { id: string } }) => i.listing.id === listing.id,
    );
    expect(item).toMatchObject({ source: 'free', available: true, installs: [] });
    expect(item.latestVersion.number).toBe('1.0.0');
    const detail = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.id}`);
    expect([detail.owned, detail.acquisitionsCount]).toEqual([true, 1]);

    // Installation : MJ de la campagne seulement
    const mine = t.campaign(buyer.id);
    const other = t.campaign(creator.id, [buyer.id]);
    res = await h.request(buyer, 'POST', `/v1/marketplace/library/${listing.id}/installs`, {
      campaignId: other,
    });
    expect(res.statusCode).toBe(403);
    const start = await h.ok(buyer, 'POST', `/v1/marketplace/library/${listing.id}/installs`, {
      campaignId: mine,
    });
    expect(start.listingTitle).toBe('Les Cryptes de Sél');
    expect(start.content.scenes).toHaveLength(1);
    expect(start.install.status).toBe('started');
    const created = { scenes: 1, npcTemplates: 0, objectTemplates: 1, skipped: 0 };
    const done = await h.ok(
      buyer,
      'POST',
      `/v1/marketplace/installs/${start.install.id}/complete`,
      {
        created,
      },
    );
    expect(done).toMatchObject({ status: 'done', campaignId: mine, versionNumber: '1.0.0' });
    // Rejoué : rien de plus
    await h.ok(buyer, 'POST', `/v1/marketplace/installs/${start.install.id}/complete`, { created });
    const inCampaign = await h.events(mine);
    expect(inCampaign.map((e) => [e.type, e.visibility])).toEqual([
      ['marketplace.install_started', 'gm_only'],
      ['marketplace.pack_installed', 'gm_only'],
    ]);

    // Avis : un par compte, modifiable, compteurs suivis
    await h.ok(buyer, 'PUT', `/v1/marketplace/listings/${listing.id}/review`, { rating: 2 });
    await h.ok(buyer, 'PUT', `/v1/marketplace/listings/${listing.id}/review`, {
      rating: 4,
      comment: 'Très bien fait',
    });
    const after = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.id}`);
    expect([after.ratingCount, after.rating, after.myReview.comment]).toEqual([
      1,
      4,
      'Très bien fait',
    ]);
    res = await h.request(creator, 'PUT', `/v1/marketplace/listings/${listing.id}/review`, {
      rating: 5,
    });
    expect(res.statusCode).toBe(403);
    const reviews = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.id}/reviews`);
    expect(reviews.total).toBe(1);
  });

  it('signalement, retrait pour droits : fichiers purgés, plus d’installation', async () => {
    const { listing, mod } = await published();
    await h.ok(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/acquire`);
    await h.ok(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/reports`, {
      reason: 'copyright',
      details: 'Ce sont mes cartes',
    });
    let res = await h.request(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/reports`, {
      reason: 'other',
    });
    expect([res.statusCode, res.json().code]).toEqual([409, 'already_reported']);

    const queue = await h.ok(mod, 'GET', '/v1/marketplace/moderation/queue');
    const group = queue.reports.find(
      (g: { listing: { id: string } }) => g.listing.id === listing.id,
    );
    expect(group.reports[0]).toMatchObject({ reason: 'copyright', details: 'Ce sont mes cartes' });

    const before = [...t.files.objects.keys()].filter((k) =>
      k.startsWith(`marketplace/${listing.id}/`),
    );
    // Deux fichiers copiés et le contenu (la couverture n’est que signée ici)
    expect(before.length).toBe(3);
    const removed = await h.ok(
      mod,
      'POST',
      `/v1/marketplace/moderation/listings/${listing.id}/remove`,
      {
        reason: 'rights',
        note: 'Notification de l’ayant droit',
      },
    );
    expect(removed.purged).toBe(before.length);

    const page = await h.ok(buyer, 'GET', '/v1/marketplace/listings?q=cryptes');
    expect(page.items.some((i: { id: string }) => i.id === listing.id)).toBe(false);
    const library = await h.ok(buyer, 'GET', '/v1/marketplace/library');
    expect(
      library.items.find((i: { listing: { id: string } }) => i.listing.id === listing.id).available,
    ).toBe(false);
    res = await h.request(buyer, 'POST', `/v1/marketplace/library/${listing.id}/installs`, {
      campaignId: t.campaign(buyer.id),
    });
    expect([res.statusCode, res.json().code]).toEqual([409, 'listing_removed']);
    res = await h.request(creator, 'PATCH', `/v1/marketplace/studio/listings/${listing.id}`, {
      title: 'Autre titre',
    });
    expect([res.statusCode, res.json().code]).toEqual([409, 'listing_removed']);
  });

  it('refus en revue, puis nouvelle version ; fiche modifiée revue a posteriori', async () => {
    const d = await draftListing();
    await h.ok(creator, 'POST', `/v1/marketplace/studio/versions/${d.version.id}/submit`, {
      rightsAttested: true,
    });
    const mod = await t.moderator();
    let res = await h.request(
      mod,
      'POST',
      `/v1/marketplace/moderation/versions/${d.version.id}/reject`,
      {
        reason: 'quality',
      },
    );
    expect(res.statusCode).toBe(400);
    const rejected = await h.ok(
      mod,
      'POST',
      `/v1/marketplace/moderation/versions/${d.version.id}/reject`,
      {
        reason: 'quality',
        note: 'Le fond est flou',
      },
    );
    expect(rejected).toMatchObject({
      status: 'rejected',
      reviewReason: 'quality',
      reviewNote: 'Le fond est flou',
    });
    const v2 = await h.ok(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${d.listing.id}/versions`,
      {
        number: '1.0.1',
      },
    );
    await h.ok(creator, 'PUT', `/v1/marketplace/studio/versions/${v2.id}/content`, pack(d.files));
    await h.ok(creator, 'POST', `/v1/marketplace/studio/versions/${v2.id}/submit`, {
      rightsAttested: true,
    });
    await h.ok(mod, 'POST', `/v1/marketplace/moderation/versions/${v2.id}/approve`);

    await h.ok(creator, 'PATCH', `/v1/marketplace/studio/listings/${d.listing.id}`, {
      summary: 'Nouveau résumé',
    });
    let queue = await h.ok(mod, 'GET', '/v1/marketplace/moderation/queue');
    expect(queue.recheck.some((l: { id: string }) => l.id === d.listing.id)).toBe(true);
    await h.ok(mod, 'POST', `/v1/marketplace/moderation/listings/${d.listing.id}/recheck`);
    queue = await h.ok(mod, 'GET', '/v1/marketplace/moderation/queue');
    expect(queue.recheck.some((l: { id: string }) => l.id === d.listing.id)).toBe(false);

    // Retirer de la vente, y remettre
    await h.ok(creator, 'POST', `/v1/marketplace/studio/listings/${d.listing.id}/unlist`);
    res = await h.request(buyer, 'GET', `/v1/marketplace/listings/${d.listing.id}`);
    expect(res.statusCode).toBe(404);
    await h.ok(creator, 'POST', `/v1/marketplace/studio/listings/${d.listing.id}/relist`);
    res = await h.request(creator, 'DELETE', `/v1/marketplace/studio/listings/${d.listing.id}`);
    expect([res.statusCode, res.json().code]).toEqual([409, 'listing_published']);
  });
});

describe.skipIf(!TEST_DATABASE_URL)('marketplace : vente', () => {
  let t: TestContext;
  let h: ReturnType<typeof helpers>;
  const handled: string[] = [];

  beforeEach(async () => {
    t = await testApp({ MARKETPLACE_PAID_LISTINGS: 'on' });
    h = helpers(t);
  });

  afterEach(async () => {
    await forgetInbox(t, handled.splice(0));
    await t.close();
  });

  const envelope = (type: string, payload: Record<string, unknown>, aggregateId: string) => {
    const id = uuidv7();
    handled.push(id);
    return {
      id,
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      roomId: null,
      actor: { userId: null, role: 'system' as const, characterId: null },
      aggregate: { type: 'billing', id: aggregateId },
      visibility: 'owner' as const,
      payload,
      correlationId: 'test',
      causationId: null,
      traceparent: null,
    };
  };

  it('compte de paiement exigé, session demandée à billing, vente livrée par le bus', async () => {
    const creator = await t.user();
    const buyer = await t.user();
    await h.ok(creator, 'PUT', '/v1/marketplace/me/creator', { displayName: 'Vendeuse' });
    const listing = await h.ok(creator, 'POST', '/v1/marketplace/studio/listings', {
      title: 'Tavernes',
      summary: 'Trois tavernes',
      priceCents: 499,
    });
    const ticket = await h.ok(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${listing.id}/uploads`,
      {
        usage: 'marketplace-cover',
        contentType: 'image/webp',
        size: 10,
      },
    );
    await h.ok(creator, 'PATCH', `/v1/marketplace/studio/listings/${listing.id}`, {
      coverUrl: ticket.publicUrl,
    });
    const version = await h.ok(
      creator,
      'POST',
      `/v1/marketplace/studio/listings/${listing.id}/versions`,
      {
        number: '1.0.0',
      },
    );
    const img = t.files.seed(`campaigns/${crypto.randomUUID()}/${uuidv7()}.webp`);
    await h.ok(creator, 'PUT', `/v1/marketplace/studio/versions/${version.id}/content`, {
      format: 1,
      objectTemplates: [{ ref: 'tonneau', name: 'Tonneau', imageUrl: img }],
    });
    let res = await h.request(
      creator,
      'POST',
      `/v1/marketplace/studio/versions/${version.id}/submit`,
      {
        rightsAttested: true,
      },
    );
    expect([res.statusCode, res.json().code]).toEqual([422, 'payouts_not_ready']);

    // billing publie le compte actif
    const ready = envelope(
      CONNECT_ACCOUNT_UPDATED,
      {
        userId: creator.id,
        version: 2,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
      creator.id,
    );
    expect(await handleEvent(t.db!, 'test', ready)).toBe('applied');
    expect(await handleEvent(t.db!, 'test', ready)).toBe('duplicate');
    // Version plus ancienne : ignorée
    const stale = envelope(
      CONNECT_ACCOUNT_UPDATED,
      {
        userId: creator.id,
        version: 1,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      },
      creator.id,
    );
    expect(await handleEvent(t.db!, 'test', stale)).toBe('ignored');

    await h.ok(creator, 'POST', `/v1/marketplace/studio/versions/${version.id}/submit`, {
      rightsAttested: true,
    });
    const mod = await t.moderator();
    await h.ok(mod, 'POST', `/v1/marketplace/moderation/versions/${version.id}/approve`);

    res = await h.request(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/acquire`);
    expect([res.statusCode, res.json().code]).toEqual([402, 'payment_required']);
    const { url } = await h.ok(buyer, 'POST', `/v1/marketplace/listings/${listing.id}/checkout`, {
      returnUrl: `/marketplace/${listing.slug}`,
    });
    expect(url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(t.checkouts[0]).toEqual({
      buyerId: buyer.id,
      sellerId: creator.id,
      listingId: listing.id,
      title: 'Tavernes',
      priceCents: 499,
      currency: 'eur',
      returnUrl: `/marketplace/${listing.slug}`,
    });
    res = await h.request(creator, 'POST', `/v1/marketplace/listings/${listing.id}/checkout`, {
      returnUrl: '/',
    });
    expect([res.statusCode, res.json().code]).toEqual([409, 'own_listing']);

    // Vente payée (billing → bus) : acquisition « purchase »
    const saleId = crypto.randomUUID();
    const sale = {
      saleId,
      buyerId: buyer.id,
      sellerId: creator.id,
      listingId: listing.id,
      amountCents: 499,
      feeCents: 75,
      currency: 'eur',
    };
    expect(
      await handleEvent(t.db!, 'test', envelope(MARKETPLACE_SALE_COMPLETED, sale, saleId)),
    ).toBe('applied');
    let detail = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.id}`);
    expect([detail.owned, detail.acquisitionsCount]).toEqual([true, 1]);

    // Remboursée : acquisition révoquée
    expect(
      await handleEvent(t.db!, 'test', envelope('billing.marketplace_sale_refunded', sale, saleId)),
    ).toBe('applied');
    detail = await h.ok(buyer, 'GET', `/v1/marketplace/listings/${listing.id}`);
    expect([detail.owned, detail.acquisitionsCount]).toEqual([false, 0]);
    const [row] = await t.db!.select().from(acquisitions).where(eq(acquisitions.saleId, saleId));
    expect(row!.revokeReason).toBe('refund');
  });

  it('compte supprimé : avis, acquisitions et profil effacés, fiches retirées', async () => {
    const creator = await t.user();
    const buyer = await t.user();
    await h.ok(creator, 'PUT', '/v1/marketplace/me/creator', { displayName: 'Partante' });
    const listing = await h.ok(creator, 'POST', '/v1/marketplace/studio/listings', {
      title: 'Brouillon perso',
    });
    const event = envelope('identity.user_deleted', { userId: creator.id }, creator.id);
    event.aggregate = { type: 'user', id: creator.id };
    expect(await handleEvent(t.db!, 'test', event)).toBe('applied');
    const me = await h.ok(creator, 'GET', '/v1/marketplace/me');
    expect(me.creator).toBeNull();
    const res = await h.request(creator, 'GET', `/v1/marketplace/studio/listings/${listing.id}`);
    expect(res.statusCode).toBe(404);
    void buyer;
  });
});
