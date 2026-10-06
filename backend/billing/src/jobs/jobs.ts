/**
 * Tâches planifiées de billing (docs/paiement.md, « Tâches planifiées ») :
 *
 *  - réconciliation : chaque jour, les abonnements en cours sont relus chez
 *    Stripe ; un webhook perdu est ainsi rattrapé (droits, événements, e-mails) ;
 *  - rappel de reconduction (loi Chatel) : un abonnement annuel est prévenu
 *    entre 45 et 30 jours avant son renouvellement, une fois par échéance ;
 *  - expiration : à chaque passage (toutes les heures), les droits à durée
 *    limitée arrivés à terme (premium d'un code) sont retirés et republiés.
 *
 * Une tâche quotidienne ne tourne qu'une fois par jour (heure de Paris), même
 * avec plusieurs réplicas : chacun tente de la « réserver » dans job_runs, un
 * seul y parvient.
 */
import { uuidv7 } from '@vtt/contracts';
import { and, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { PLANS } from '../catalog/catalog.js';
import type { Db } from '../db/client.js';
import { appendEvent } from '../db/outbox.js';
import { jobRuns, renewalReminders, subscriptions } from '../db/schema.js';
import { expireEntitlements } from '../payments/codes.js';
import { customerAggregate, SYSTEM, type PaymentDeps } from '../payments/common.js';
import { LIVE_STATUSES, syncSubscription } from '../payments/subscriptions.js';

interface Log {
  info(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/** Fenêtre du rappel : au plus 45 jours avant l'échéance (au moins un mois, au plus trois). */
export const REMINDER_WINDOW_DAYS = 45;

/** Réserve la tâche pour aujourd'hui (heure de Paris) ; false si un autre l'a déjà faite. */
export async function claimDaily(db: Db, name: string): Promise<boolean> {
  const today = sql`date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris'`;
  const rows = await db
    .insert(jobRuns)
    .values({ name, lastRunAt: sql`now()` })
    .onConflictDoUpdate({
      target: jobRuns.name,
      set: { lastRunAt: sql`now()` },
      setWhere: sql`${jobRuns.lastRunAt} < ${today}`,
    })
    .returning({ name: jobRuns.name });
  return rows.length > 0;
}

/** Relit chez Stripe chaque abonnement en cours ; renvoie le nombre relu et les échecs. */
export async function reconcile(deps: PaymentDeps, log?: Log) {
  const live = await deps.db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(inArray(subscriptions.status, [...LIVE_STATUSES]));
  const ctx = { correlationId: uuidv7() };
  let failed = 0;
  for (const { id } of live) {
    try {
      await syncSubscription(deps, ctx, SYSTEM, id);
    } catch (e) {
      failed++;
      log?.error({ subscriptionId: id, error: (e as Error).message }, 'réconciliation en échec');
    }
  }
  return { checked: live.length, failed };
}

/**
 * Rappels de reconduction : abonnements annuels en cours, non résiliés, qui se
 * renouvellent dans la fenêtre. Un événement billing.renewal_reminder_due par
 * échéance (l'e-mail part par le consommateur billing-mails).
 */
export async function remindRenewals(db: Db, now = new Date()): Promise<number> {
  const until = new Date(now.getTime() + REMINDER_WINDOW_DAYS * 86_400_000);
  const due = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.plan, 'annual'),
        inArray(subscriptions.status, [...LIVE_STATUSES]),
        isNull(subscriptions.cancelAt),
        gt(subscriptions.currentPeriodEnd, now),
        lte(subscriptions.currentPeriodEnd, until),
      ),
    );
  const ctx = { correlationId: uuidv7() };
  let sent = 0;
  for (const sub of due) {
    const periodEnd = sub.currentPeriodEnd!;
    const fresh = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(renewalReminders)
        .values({ subscriptionId: sub.id, periodEnd })
        .onConflictDoNothing()
        .returning({ id: renewalReminders.subscriptionId });
      if (!row) return false;
      await appendEvent(tx, ctx, {
        type: 'billing.renewal_reminder_due',
        actor: SYSTEM,
        aggregate: customerAggregate(sub.userId),
        payload: {
          userId: sub.userId,
          subscriptionId: sub.id,
          renewalDate: periodEnd.toISOString(),
          amountCents: PLANS.annual.amount,
        },
      });
      return true;
    });
    if (fresh) sent++;
  }
  return sent;
}

const HOUR_MS = 60 * 60_000;

/**
 * Lance les tâches : une première fois une minute après le démarrage, puis
 * toutes les heures (chaque tâche ne s'exécute qu'une fois par jour). Renvoie
 * la fonction d'arrêt.
 */
export function startJobs(deps: PaymentDeps, log: Log, everyMs = HOUR_MS): () => Promise<void> {
  let running: Promise<void> = Promise.resolve();
  const tick = () => {
    running = (async () => {
      try {
        const expired = await expireEntitlements(deps.db);
        if (expired) log.info({ expired }, 'droits expirés retirés');
        if (await claimDaily(deps.db, 'reconcile')) {
          const r = await reconcile(deps, log);
          log.info(r, 'réconciliation des abonnements avec Stripe');
        }
        if (await claimDaily(deps.db, 'renewal-reminders')) {
          const sent = await remindRenewals(deps.db);
          log.info({ sent }, 'rappels de reconduction');
        }
      } catch (e) {
        log.error({ error: (e as Error).message }, 'tâches planifiées en échec');
      }
    })();
  };
  const first = setTimeout(tick, Math.min(60_000, everyMs));
  const timer = setInterval(tick, everyMs);
  first.unref();
  timer.unref();
  return async () => {
    clearTimeout(first);
    clearInterval(timer);
    await running;
  };
}
