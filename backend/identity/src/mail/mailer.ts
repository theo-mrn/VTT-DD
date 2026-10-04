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

/** Échec d'un envoi à Kourrier. */
export class ErreurKourrier extends Error {
  /** Code journalisable, sans donnée personnelle : kourrier_503, kourrier_injoignable… */
  readonly code: string;

  /** @param statut statut HTTP de la réponse, null si Kourrier n'a pas répondu */
  constructor(readonly statut: number | null) {
    super(statut === null ? 'Kourrier injoignable' : `Kourrier a refusé l'e-mail (HTTP ${statut})`);
    this.code = statut === null ? 'kourrier_injoignable' : `kourrier_${statut}`;
  }

  /** Réessayer a un sens : Kourrier injoignable, surchargé (429) ou en erreur (5xx). */
  get transitoire(): boolean {
    return this.statut === null || this.statut === 429 || this.statut >= 500;
  }
}

interface Journal {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const TENTATIVES = 3;
const DELAI_INITIAL_MS = 200;
const TIMEOUT_MS = 5_000;

const attendre = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export function createMailer(opts: {
  kourrierUrl: string | undefined;
  kourrierApiKey: string | undefined;
  /** Expéditeur, ex. `YNER <contact@yner.fr>` : doit être autorisé pour la clé. */
  from: string;
  log: Journal;
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

  /** Une tentative d'envoi : null si Kourrier a accepté l'e-mail, l'échec sinon. */
  async function tenter(corps: string, idempotence: string): Promise<ErreurKourrier | null> {
    try {
      const reponse = await fetch(url, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${cle}`,
          'content-type': 'application/json',
          'idempotency-key': idempotence,
        },
        body: corps,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      return reponse.status === 202 ? null : new ErreurKourrier(reponse.status);
    } catch {
      // Réseau coupé, DNS ou timeout : Kourrier n'a pas répondu
      return new ErreurKourrier(null);
    }
  }

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

      let tentative = 1;
      let echec = await tenter(corps, idempotence);
      while (echec) {
        // Une requête refusée (4xx) le sera encore : inutile de la renvoyer
        if (!echec.transitoire || tentative === TENTATIVES) throw echec;
        opts.log.warn(
          { modele: mail.modele, tentative, code: echec.code },
          'Kourrier indisponible, nouvel essai',
        );
        await attendre(DELAI_INITIAL_MS * 2 ** (tentative - 1));
        tentative++;
        echec = await tenter(corps, idempotence);
      }
    },
  };
}

/** `YNER <contact@yner.fr>` → `{ email: 'contact@yner.fr', name: 'YNER' }`. */
export function adresse(brut: string): { email: string; name?: string } {
  const texte = brut.trim();
  const debut = texte.lastIndexOf('<');
  if (debut === -1 || !texte.endsWith('>')) return { email: texte };

  const email = texte.slice(debut + 1, -1).trim();
  let nom = texte.slice(0, debut).trim();
  if (nom.length >= 2 && nom.startsWith('"') && nom.endsWith('"')) nom = nom.slice(1, -1);
  return nom ? { email, name: nom } : { email };
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
