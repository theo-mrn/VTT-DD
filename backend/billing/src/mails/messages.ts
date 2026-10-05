/**
 * E-mail à envoyer pour un événement de billing (docs/paiement.md, « E-mails »).
 * Les événements ne portent aucun lien de facture : les liens et montants sont
 * relus dans la base au moment de l'envoi.
 *
 *   billing.invoice_paid            création d'abonnement → premium-active
 *                                   renouvellement, changement de formule → facture
 *                                   achat à l'unité (facture manuelle) → achat-confirme
 *   billing.invoice_payment_failed  → paiement-echoue
 *   billing.subscription_cancellation_scheduled → resiliation-programmee
 *   billing.subscription_ended      → premium-termine
 *   billing.purchase_refunded       → remboursement
 */
import type { EventEnvelope } from '@vtt/contracts';
import { eq } from 'drizzle-orm';
import { itemOf, lineName } from '../catalog/catalog.js';
import type { Db } from '../db/client.js';
import { invoices, subscriptions, type InvoiceRow, type ItemKind } from '../db/schema.js';
import { customerOf } from '../payments/common.js';
import type { Mail, MailTemplate } from './kourrier.js';

/** Pages du front visées par les e-mails. */
export const MAIL_PAGES = { subscription: '/abonnement', collection: '/des' } as const;

const TIME_ZONE = 'Europe/Paris';

export function money(cents: number, currency = 'eur'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: currency.toUpperCase() })
    .format(cents / 100)
    .replace(/ | /g, ' ');
}

export function day(date: Date | string | null | undefined): string {
  if (!date) return '';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeZone: TIME_ZONE }).format(
    new Date(date),
  );
}

const PLAN_LABEL = { monthly: 'mensuel', annual: 'annuel', legacy: '' } as const;

interface Content {
  template: MailTemplate;
  data: Record<string, string>;
}

/** E-mail d'un événement ; null : rien à envoyer (autre événement, destinataire inconnu…). */
export async function mailFor(db: Db, appUrl: string, event: EventEnvelope): Promise<Mail | null> {
  const p = event.payload as Record<string, unknown>;
  const userId = typeof p.userId === 'string' ? p.userId : null;
  if (!userId || !event.type.startsWith('billing.')) return null;
  const content = await contentFor(db, appUrl, event.type, p);
  if (!content) return null;
  const email = (await customerOf(db, userId))?.email;
  if (!email) return null;
  return { to: email, ...content, idempotencyKey: event.id };
}

async function contentFor(
  db: Db,
  appUrl: string,
  type: string,
  p: Record<string, unknown>,
): Promise<Content | null> {
  const links = {
    lien_abonnement: `${appUrl}${MAIL_PAGES.subscription}`,
    lien_collection: `${appUrl}${MAIL_PAGES.collection}`,
  };
  switch (type) {
    case 'billing.invoice_paid': {
      const inv = await invoiceOf(db, p.invoiceId);
      if (!inv) return null;
      const invoice = invoiceData(inv);
      const amount = money(inv.amountPaid, inv.currency);
      const reason = p.billingReason;
      if (reason === 'manual' || !inv.subscriptionId)
        return {
          template: 'achat-confirme',
          data: {
            ...invoice,
            montant: amount,
            article: inv.description ?? 'votre article',
            lien_collection: links.lien_collection,
          },
        };
      const sub = await subscriptionOf(db, inv.subscriptionId);
      const nextDue = day(sub?.currentPeriodEnd ?? inv.periodEnd);
      if (reason === 'subscription_create')
        return {
          template: 'premium-active',
          data: {
            ...invoice,
            montant: amount,
            formule: sub ? PLAN_LABEL[sub.plan] : '',
            prochaine_echeance: nextDue,
            lien_abonnement: links.lien_abonnement,
          },
        };
      // Facture à 0 € (crédit d'un changement de formule) : rien à annoncer
      if (inv.amountPaid <= 0) return null;
      return {
        template: 'facture',
        data: {
          ...invoice,
          montant: amount,
          prochaine_echeance: nextDue,
          lien_abonnement: links.lien_abonnement,
        },
      };
    }

    case 'billing.invoice_payment_failed': {
      const inv = await invoiceOf(db, p.invoiceId);
      if (!inv) return null;
      return {
        template: 'paiement-echoue',
        data: {
          montant: money(inv.amountDue, inv.currency),
          lien_paiement: inv.hostedUrl ?? links.lien_abonnement,
          prochaine_tentative: day(p.nextAttemptAt as string | null),
          lien_abonnement: links.lien_abonnement,
        },
      };
    }

    case 'billing.subscription_cancellation_scheduled':
      return {
        template: 'resiliation-programmee',
        data: { date_fin: day(p.endDate as string), lien_abonnement: links.lien_abonnement },
      };

    case 'billing.subscription_ended':
      return { template: 'premium-termine', data: { lien_abonnement: links.lien_abonnement } };

    case 'billing.purchase_refunded': {
      const item = itemOf(p.kind as ItemKind, String(p.itemId));
      return {
        template: 'remboursement',
        data: {
          article: item ? lineName(item) : String(p.itemId),
          montant: money(Number(p.amountCents), String(p.currency ?? 'eur')),
        },
      };
    }

    default:
      return null;
  }
}

function invoiceData(inv: InvoiceRow) {
  return {
    numero: inv.number ?? '',
    lien_facture: inv.hostedUrl ?? '',
    lien_pdf: inv.pdfUrl ?? '',
  };
}

async function invoiceOf(db: Db, id: unknown): Promise<InvoiceRow | undefined> {
  if (typeof id !== 'string') return undefined;
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  return row;
}

async function subscriptionOf(db: Db, id: string) {
  const [row] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  return row;
}
