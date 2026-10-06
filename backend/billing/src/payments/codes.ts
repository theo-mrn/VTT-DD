/**
 * Codes à échanger contre un droit (docs/paiement.md, « Codes ») : premium
 * pendant N jours, ou un skin de dés ou un cadre à vie. Créés par la commande
 * codes:create, échangés par POST /v1/billing/codes/redeem.
 *
 * Un code sert au plus `maxUses` fois, une fois par compte, jusqu'à
 * `validUntil`. Il n'est consommé que si le droit est accordé : un compte
 * déjà premium ou qui possède déjà l'article le garde intact.
 *
 * Le premium d'un code porte une date de fin (`expiresAt`) ; la tâche horaire
 * (expireEntitlements) le retire et republie les droits.
 */
import { randomInt } from 'node:crypto';
import { uuidv7, type Actor } from '@vtt/contracts';
import { HttpError } from '@vtt/platform';
import { and, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { itemOf } from '../catalog/catalog.js';
import type { Db } from '../db/client.js';
import { appendEvent, type EventContext } from '../db/outbox.js';
import { codeRedemptions, codes, entitlements, type CodeRow } from '../db/schema.js';
import { customerAggregate, SYSTEM } from './common.js';
import { hasPremium, owns, publishRights } from './entitlements.js';

/** Sans 0/O ni 1/I/L : un code se recopie sans ambiguïté. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const DAY_MS = 86_400_000;

/** Forme enregistrée : majuscules, sans espace ni tiret (« yner-ab12 cd » → « YNERAB12CD »). */
export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Code aléatoire lisible, par groupes de quatre : YNER-XXXX-XXXX. */
export function generateCode(): string {
  const group = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `YNER-${group()}-${group()}`;
}

export type CodeReward =
  | { kind: 'premium'; days: number }
  | { kind: 'dice_skin'; itemId: string }
  | { kind: 'token_frame'; itemId: string };

export interface NewCode {
  reward: CodeReward;
  /** Code choisi (ex. DISCORD2026) ; sinon généré. */
  code?: string;
  maxUses?: number;
  validUntil?: Date | null;
  note?: string | null;
}

/** Crée un code ; renvoie sa forme lisible (celle saisie ou générée). */
export async function createCode(db: Db, c: NewCode): Promise<string> {
  const { reward } = c;
  if (reward.kind === 'premium') {
    if (!Number.isInteger(reward.days) || reward.days <= 0)
      throw new Error('Durée du premium invalide (jours entiers, au moins 1)');
  } else {
    const item = itemOf(reward.kind === 'dice_skin' ? 'dice' : 'token', reward.itemId);
    if (!item) throw new Error(`Article inconnu du catalogue : ${reward.itemId}`);
    if (item.price <= 0) throw new Error(`Article gratuit, déjà ouvert à tous : ${reward.itemId}`);
  }
  const maxUses = c.maxUses ?? 1;
  if (!Number.isInteger(maxUses) || maxUses <= 0) throw new Error("Nombre d'utilisations invalide");

  const display = c.code ?? generateCode();
  const code = normalizeCode(display);
  if (code.length < 6) throw new Error('Code trop court (6 caractères au moins)');
  const rows = await db
    .insert(codes)
    .values({
      code,
      kind: reward.kind,
      itemId: reward.kind === 'premium' ? '' : reward.itemId,
      durationDays: reward.kind === 'premium' ? reward.days : null,
      maxUses,
      validUntil: c.validUntil ?? null,
      note: c.note ?? null,
    })
    .onConflictDoNothing()
    .returning({ code: codes.code });
  if (!rows.length) throw new Error(`Ce code existe déjà : ${display}`);
  return display;
}

export interface Redeemed {
  kind: CodeRow['kind'];
  itemId: string | null;
  /** Fin du premium offert ; null pour un article (à vie). */
  expiresAt: string | null;
}

/**
 * Échange un code pour `userId` : vérifie le code (sous verrou de ligne, deux
 * échanges simultanés ne dépassent jamais `maxUses`), accorde le droit,
 * compte l'utilisation et publie les droits, dans une seule transaction.
 */
export async function redeemCode(
  db: Db,
  ctx: EventContext,
  actor: Actor,
  userId: string,
  raw: string,
  now = new Date(),
): Promise<Redeemed> {
  const code = normalizeCode(raw);
  return db.transaction(async (tx) => {
    const [c] = code ? await tx.select().from(codes).where(eq(codes.code, code)).for('update') : [];
    if (!c) throw new HttpError(404, 'Code invalide', 'code_invalid');
    if (c.validUntil && c.validUntil <= now)
      throw HttpError.conflict('Ce code a expiré', 'code_expired');
    const [used] = await tx
      .select({ code: codeRedemptions.code })
      .from(codeRedemptions)
      .where(and(eq(codeRedemptions.code, code), eq(codeRedemptions.userId, userId)));
    if (used) throw HttpError.conflict('Vous avez déjà utilisé ce code', 'code_already_redeemed');
    if (c.uses >= c.maxUses) throw HttpError.conflict('Ce code a déjà servi', 'code_exhausted');

    if (c.kind === 'premium') {
      if (await hasPremium(tx, userId))
        throw HttpError.conflict('Vous êtes déjà premium', 'already_premium');
    } else if (await owns(tx, userId, c.kind, c.itemId)) {
      throw HttpError.conflict('Vous possédez déjà cet article', 'already_owned');
    }

    const expiresAt = c.durationDays ? new Date(now.getTime() + c.durationDays * DAY_MS) : null;
    const entitlementId = uuidv7();
    await tx.insert(entitlements).values({
      id: entitlementId,
      userId,
      kind: c.kind,
      itemId: c.itemId,
      source: 'code',
      sourceId: code,
      expiresAt,
    });
    await tx.insert(codeRedemptions).values({ code, userId, entitlementId });
    await tx
      .update(codes)
      .set({ uses: sql`${codes.uses} + 1` })
      .where(eq(codes.code, code));
    await publishRights(tx, ctx, actor, userId);

    const emit = (type: string, payload: Record<string, unknown>) =>
      appendEvent(tx, ctx, {
        type,
        actor,
        aggregate: customerAggregate(userId),
        payload: { userId, ...payload },
      });
    await emit('billing.code_redeemed', {
      code,
      kind: c.kind,
      itemId: c.itemId || null,
      expiresAt: expiresAt?.toISOString() ?? null,
    });
    if (c.kind === 'premium') await emit('billing.premium_activated', { source: 'code' });

    return { kind: c.kind, itemId: c.itemId || null, expiresAt: expiresAt?.toISOString() ?? null };
  });
}

/**
 * Retire les droits arrivés à expiration (premium d'un code) et republie les
 * droits de chaque compte touché. Sûr avec plusieurs réplicas : chaque droit
 * n'est retiré qu'une fois (UPDATE … WHERE revoked_at IS NULL).
 */
export async function expireEntitlements(db: Db, now = new Date()): Promise<number> {
  const due = await db
    .select({ id: entitlements.id, userId: entitlements.userId, kind: entitlements.kind })
    .from(entitlements)
    .where(
      and(
        isNull(entitlements.revokedAt),
        isNotNull(entitlements.expiresAt),
        lte(entitlements.expiresAt, now),
      ),
    );
  const ctx = { correlationId: uuidv7() };
  let expired = 0;
  for (const e of due) {
    const done = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(entitlements)
        .set({ revokedAt: sql`now()`, revokeReason: 'expired' })
        .where(and(eq(entitlements.id, e.id), isNull(entitlements.revokedAt)))
        .returning({ id: entitlements.id });
      if (!row) return false;
      await publishRights(tx, ctx, SYSTEM, e.userId);
      if (e.kind === 'premium' && !(await hasPremium(tx, e.userId)))
        await appendEvent(tx, ctx, {
          type: 'billing.premium_deactivated',
          actor: SYSTEM,
          aggregate: customerAggregate(e.userId),
          payload: { userId: e.userId, status: 'expired' },
        });
      return true;
    });
    if (done) expired++;
  }
  return expired;
}
