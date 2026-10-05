/**
 * Envoi des e-mails de paiement par Kourrier, le service d'envoi du cluster
 * (infra/mails/README.md). billing ne construit pas le contenu : il désigne un
 * template (infra/mails/templates/yner/<template>/fr) et ses données.
 *
 * Une seule tentative par appel : c'est le consommateur du bus qui réessaie
 * (message relivré). La clé d'idempotence (id de l'événement) garantit qu'un
 * e-mail accepté par Kourrier n'est jamais envoyé deux fois.
 */

export type MailTemplate =
  | 'achat-confirme'
  | 'premium-active'
  | 'facture'
  | 'paiement-echoue'
  | 'resiliation-programmee'
  | 'premium-termine'
  | 'remboursement'
  | 'rappel-reconduction';

export interface Mail {
  to: string;
  template: MailTemplate;
  data: Record<string, string>;
  /** Clé d'idempotence chez Kourrier : l'id de l'événement qui déclenche l'e-mail. */
  idempotencyKey: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** Refus de Kourrier. `retryable` : injoignable, surchargé (429) ou en erreur (5xx). */
export class MailFailed extends Error {
  readonly retryable: boolean;
  constructor(readonly status: number | null) {
    super(status === null ? 'Kourrier injoignable' : `Kourrier a refusé l'e-mail (HTTP ${status})`);
    this.name = 'MailFailed';
    this.retryable = status === null || status === 429 || status >= 500;
  }
}

interface Log {
  info(obj: object, msg: string): void;
}

const TIMEOUT_MS = 5_000;

export function kourrierMailer(opts: {
  url: string | undefined;
  apiKey: string | undefined;
  /** Expéditeur, ex. `YNER <contact@yner.fr>` : doit être autorisé pour la clé. */
  from: string;
  log: Log;
  fetch?: typeof globalThis.fetch;
}): Mailer {
  if (!opts.url) {
    return {
      async send(mail) {
        // Jamais l'adresse du destinataire dans les journaux
        opts.log.info({ template: mail.template }, 'e-mail non envoyé (KOURRIER_URL absent)');
      },
    };
  }
  if (!opts.apiKey) throw new Error('KOURRIER_API_KEY est requis quand KOURRIER_URL est défini');
  const endpoint = new URL('/v1/emails', opts.url).toString();
  const apiKey = opts.apiKey;
  const from = address(opts.from);
  const doFetch = opts.fetch ?? globalThis.fetch;

  return {
    async send(mail) {
      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            'idempotency-key': mail.idempotencyKey,
          },
          body: JSON.stringify({
            from,
            to: [{ email: mail.to }],
            template: { name: mail.template, locale: 'fr', data: mail.data },
            tags: { service: 'billing', modele: mail.template },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        throw new MailFailed(null);
      }
      if (res.status !== 202) throw new MailFailed(res.status);
    },
  };
}

/** `YNER <contact@yner.fr>` → `{ email: 'contact@yner.fr', name: 'YNER' }`. */
export function address(raw: string): { email: string; name?: string } {
  const text = raw.trim();
  const start = text.lastIndexOf('<');
  if (start === -1 || !text.endsWith('>')) return { email: text };
  const email = text.slice(start + 1, -1).trim();
  let name = text.slice(0, start).trim();
  if (name.length >= 2 && name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
  return name ? { email, name } : { email };
}

/** Boîte aux lettres en mémoire pour les tests. */
export function testMailer(): Mailer & { sent: Mail[]; fail: (status: number | null) => void } {
  const sent: Mail[] = [];
  let failure: number | null | undefined;
  return {
    sent,
    fail(status) {
      failure = status;
    },
    async send(mail) {
      if (failure !== undefined) {
        const status = failure;
        failure = undefined;
        throw new MailFailed(status);
      }
      sent.push(mail);
    },
  };
}
