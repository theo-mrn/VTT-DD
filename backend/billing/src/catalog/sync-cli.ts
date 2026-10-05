/**
 * Pousse le catalogue du dépôt dans Stripe (voir sync.ts).
 *
 *   pnpm --filter @vtt/billing catalog:sync            simulation (rien n'est écrit)
 *   pnpm --filter @vtt/billing catalog:sync --apply    écrit dans Stripe
 *
 * Clé : STRIPE_SECRET_KEY (mode test pour le staging, live pour la prod).
 */
import { parseArgs } from 'node:util';
import type Stripe from 'stripe';
import { stripeClient } from '../stripe/client.js';
import { CURRENCY } from './catalog.js';
import { desiredCatalog, priceMatches, productDiffers } from './sync.js';

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } });
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY manquante');
  const stripe = stripeClient(key);
  const apply = values.apply;
  const mode = key.includes('_live_') ? 'LIVE' : 'test';
  console.log(`Stripe en mode ${mode}${apply ? '' : ' — simulation, rien ne sera écrit'}`);

  const { products, prices } = desiredCatalog();
  const counts = { created: 0, updated: 0, unchanged: 0 };

  for (const spec of products) {
    let existing: Stripe.Product | null = null;
    try {
      existing = await stripe.products.retrieve(spec.id);
    } catch (e) {
      if ((e as { code?: string }).code !== 'resource_missing') throw e;
    }
    const fields = {
      name: spec.name,
      description: spec.description ?? '',
      images: spec.images ?? [],
      active: true,
    };
    if (!existing) {
      console.log(`+ produit ${spec.id} (${spec.name})`);
      if (apply)
        await stripe.products.create({ id: spec.id, ...fields, tax_code: 'txcd_10000000' });
      counts.created++;
    } else if (productDiffers(existing, spec)) {
      console.log(`~ produit ${spec.id}`);
      if (apply) await stripe.products.update(spec.id, fields);
      counts.updated++;
    } else counts.unchanged++;
  }

  // Prix existants, par paquets de 10 lookup_keys (limite de l'API)
  const current = new Map<string, Stripe.Price>();
  for (let i = 0; i < prices.length; i += 10) {
    const keys = prices.slice(i, i + 10).map((p) => p.lookupKey);
    const page = await stripe.prices.list({ lookup_keys: keys, limit: 100 });
    for (const p of page.data) if (p.lookup_key) current.set(p.lookup_key, p);
  }

  for (const spec of prices) {
    const existing = current.get(spec.lookupKey);
    if (existing && priceMatches(existing, spec)) {
      counts.unchanged++;
      continue;
    }
    const euros = (spec.amount / 100).toFixed(2);
    console.log(
      `${existing ? '~' : '+'} prix ${spec.lookupKey} : ${euros} €${spec.interval ? ` / ${spec.interval}` : ''}`,
    );
    if (apply) {
      await stripe.prices.create({
        product: spec.productId,
        currency: CURRENCY,
        unit_amount: spec.amount,
        tax_behavior: 'inclusive',
        lookup_key: spec.lookupKey,
        transfer_lookup_key: true,
        nickname: spec.nickname,
        ...(spec.interval ? { recurring: { interval: spec.interval } } : {}),
      });
      if (existing) await stripe.prices.update(existing.id, { active: false });
    }
    if (existing) counts.updated++;
    else counts.created++;
  }

  console.log(
    `${apply ? 'Fait' : 'À faire'} : ${counts.created} création(s), ${counts.updated} ` +
      `mise(s) à jour, ${counts.unchanged} inchangé(s).`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
