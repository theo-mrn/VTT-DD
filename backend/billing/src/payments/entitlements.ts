/**
 * Droits d'un utilisateur (table entitlements) : source de vérité de ce qu'il
 * possède. Un droit est accordé par une source (abonnement, achat, ancienne
 * app, cadeau) et révoqué par elle, jamais supprimé.
 *
 * Application dans les autres services : `pushRights` envoie l'état complet
 * (premium, skins) à dice et identity par leurs routes internes idempotentes.
 * Elle est appelée après chaque transaction, même sans changement : un envoi
 * qui a échoué est refait à la relivraison de l'événement Stripe. Le lot 2
 * (docs/paiement.md) la remplace par un événement billing.entitlements_changed.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Effects } from '../clients/effects.js';
import type { Db } from '../db/client.js';
import type { Tx } from '../db/outbox.js';
import { entitlements, type EntitlementKind, type EntitlementSource } from '../db/schema.js';

export interface EntitlementRef {
  userId: string;
  kind: EntitlementKind;
  /** Skin ou cadre ; vide pour premium. */
  itemId?: string;
  source: EntitlementSource;
  sourceId?: string;
}

/** Accorde un droit ; false s'il était déjà actif pour cette source. */
export async function grant(tx: Db | Tx, ref: EntitlementRef): Promise<boolean> {
  const rows = await tx
    .insert(entitlements)
    .values({
      id: uuidv7(),
      userId: ref.userId,
      kind: ref.kind,
      itemId: ref.itemId ?? '',
      source: ref.source,
      sourceId: ref.sourceId ?? '',
    })
    .onConflictDoNothing()
    .returning({ id: entitlements.id });
  return rows.length > 0;
}

/** Révoque le droit actif de cette source ; false s'il n'y en avait pas. */
export async function revoke(tx: Db | Tx, ref: EntitlementRef, reason: string): Promise<boolean> {
  const rows = await tx
    .update(entitlements)
    .set({ revokedAt: sql`now()`, revokeReason: reason })
    .where(
      and(
        eq(entitlements.userId, ref.userId),
        eq(entitlements.kind, ref.kind),
        eq(entitlements.itemId, ref.itemId ?? ''),
        eq(entitlements.source, ref.source),
        eq(entitlements.sourceId, ref.sourceId ?? ''),
        isNull(entitlements.revokedAt),
      ),
    )
    .returning({ id: entitlements.id });
  return rows.length > 0;
}

/** Tous les droits actifs d'une sorte, toutes sources confondues. */
export async function activeOf(tx: Db | Tx, userId: string, kind: EntitlementKind) {
  return tx
    .select()
    .from(entitlements)
    .where(
      and(
        eq(entitlements.userId, userId),
        eq(entitlements.kind, kind),
        isNull(entitlements.revokedAt),
      ),
    );
}

export async function hasPremium(tx: Db | Tx, userId: string): Promise<boolean> {
  return (await activeOf(tx, userId, 'premium')).length > 0;
}

/** Possède cet article (achat, cadeau ou ancienne app). */
export async function owns(
  tx: Db | Tx,
  userId: string,
  kind: 'dice_skin' | 'token_frame',
  itemId: string,
): Promise<boolean> {
  return (await activeOf(tx, userId, kind)).some((e) => e.itemId === itemId);
}

export interface Rights {
  premium: boolean;
  diceSkins: string[];
  tokenFrames: string[];
}

/** État complet des droits d'un utilisateur. */
export async function rightsOf(db: Db | Tx, userId: string): Promise<Rights> {
  const rows = await db
    .select({ kind: entitlements.kind, itemId: entitlements.itemId })
    .from(entitlements)
    .where(and(eq(entitlements.userId, userId), isNull(entitlements.revokedAt)));
  const items = (kind: EntitlementKind) =>
    [...new Set(rows.filter((r) => r.kind === kind).map((r) => r.itemId))].sort();
  return {
    premium: rows.some((r) => r.kind === 'premium'),
    diceSkins: items('dice_skin'),
    tokenFrames: items('token_frame'),
  };
}

/**
 * Applique l'état des droits dans dice et identity (routes idempotentes).
 * Lève EffectFailed si un service ne répond pas : l'appelant laisse Stripe
 * relivrer. Un skin révoqué (remboursement) reste dans dice jusqu'au lot 2.
 */
export async function pushRights(deps: { db: Db; effects: Effects }, userId: string) {
  const rights = await rightsOf(deps.db, userId);
  await deps.effects.setAllSkins(userId, rights.premium);
  await deps.effects.setPremium(userId, rights.premium);
  for (const skin of rights.diceSkins) await deps.effects.grantSkin(userId, skin);
}
