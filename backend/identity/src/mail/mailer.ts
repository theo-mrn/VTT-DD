/**
 * Envoi des e-mails transactionnels (réinitialisation, vérification…) par Kourrier,
 * le service d'envoi du cluster (https://github.com/theo-mrn/kourrier).
 *
 * identity ne construit pas le contenu : il désigne un template et ses données.
 * Les templates vivent dans infra/mails/templates/ (publiés sur R2, lus par
 * Kourrier) : un texte se modifie sans redéployer identity.
 *
 * KOURRIER_URL présent : envoi à Kourrier, qui répond 202 et livre en arrière-plan
 * (Mailpit en dev, AWS SES en cluster). Absent : le message est journalisé, sans
 * son contenu (les liens sont à usage unique).
 */
import { createHash } from 'node:crypto';

/** Templates disponibles côté Kourrier, dans yner/<modele>/<locale>/. */
export type ModeleMail = 'reinitialisation' | 'verification';

export interface Mail {
  to: string;
  modele: ModeleMail;
  /** Données du template. Le lien est à usage unique : jamais dans les logs. */
  donnees: { lien: string };
}

export interface Mailer {
  envoyer(mail: Mail): Promise<void>;
}

/** Refus définitif de Kourrier (requête invalide, clé refusée, expéditeur non autorisé). */
export class ErreurKourrier extends Error {
  constructor(
    readonly statut: number,
    /** Code journalisable, sans donnée personnelle (ex. kourrier_422). */
    readonly code: string,
  ) {
    super(`Kourrier a refusé l'e-mail (HTTP ${statut})`);
  }
}

interface Journal {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const TENTATIVES = 3;
const DELAI_INITIAL_MS = 200;
const TIMEOUT_MS = 5_000;

export function createMailer(opts: {
  kourrierUrl: string | undefined;
  kourrierApiKey: string | undefined;
  /** Expéditeur, ex. `YNER <contact@yner.fr>` : doit être autorisé pour la clé. */
  from: string;
  log: Journal;
  /** Injectés par les tests. */
  fetch?: typeof fetch;
  attendre?: (ms: number) => Promise<void>;
}): Mailer {
  if (!opts.kourrierUrl) {
    return {
      async envoyer(mail) {
        // Jamais l'adresse du destinataire ni le lien dans les journaux
        opts.log.info({ modele: mail.modele }, 'e-mail non envoyé (KOURRIER_URL absent)');
      },
    };
  }
  if (!opts.kourrierApiKey) {
    throw new Error('KOURRIER_API_KEY est requis quand KOURRIER_URL est défini');
  }

  const url = new URL('/v1/emails', opts.kourrierUrl).toString();
  const cle = opts.kourrierApiKey;
  const from = adresse(opts.from);
  const appeler = opts.fetch ?? fetch;
  const attendre = opts.attendre ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  return {
    async envoyer(mail) {
      const corps = JSON.stringify({
        from,
        to: [{ email: mail.to }],
        template: { name: mail.modele, locale: 'fr', data: mail.donnees },
        tags: { service: 'identity', modele: mail.modele },
      });
      // Même clé à chaque tentative : si Kourrier a accepté un envoi dont la réponse
      // s'est perdue, la tentative suivante ne crée pas de doublon.
      const idempotence = createHash('sha256')
        .update(`${mail.modele}\n${mail.donnees.lien}`)
        .digest('hex');

      let derniere: unknown;
      for (let tentative = 1; tentative <= TENTATIVES; tentative++) {
        try {
          const res = await appeler(url, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${cle}`,
              'content-type': 'application/json',
              'idempotency-key': idempotence,
            },
            body: corps,
            signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (res.status === 202) return;
          // 4xx (hors 429) : la requête est fausse, la renvoyer ne changera rien
          if (res.status < 500 && res.status !== 429) {
            throw new ErreurKourrier(res.status, `kourrier_${res.status}`);
          }
          derniere = new ErreurKourrier(res.status, `kourrier_${res.status}`);
        } catch (err) {
          if (err instanceof ErreurKourrier) throw err;
          derniere = err; // réseau, timeout : Kourrier injoignable
        }
        if (tentative < TENTATIVES) {
          opts.log.warn({ modele: mail.modele, tentative }, 'Kourrier indisponible, nouvel essai');
          await attendre(DELAI_INITIAL_MS * 2 ** (tentative - 1));
        }
      }
      throw derniere;
    },
  };
}

/** `YNER <contact@yner.fr>` → `{ name: 'YNER', email: 'contact@yner.fr' }`. */
export function adresse(brut: string): { email: string; name?: string } {
  const m = /^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/.exec(brut);
  if (!m) return { email: brut.trim() };
  const nom = m[1]!.replace(/^"|"$/g, '');
  return nom ? { email: m[2]!, name: nom } : { email: m[2]! };
}

/** Boîte aux lettres en mémoire pour les tests. */
export function mailerDeTest(): Mailer & { envoyes: Mail[] } {
  const envoyes: Mail[] = [];
  return {
    envoyes,
    async envoyer(mail) {
      envoyes.push(mail);
    },
  };
}
