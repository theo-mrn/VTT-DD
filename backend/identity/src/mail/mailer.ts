/**
 * Envoi des e-mails transactionnels (réinitialisation, vérification…).
 * SMTP_URL présent : envoi SMTP (Mailpit en dev, Resend en prod).
 * Absent : le message est journalisé, sans son contenu (liens à usage unique).
 */
import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  envoyer(mail: Mail): Promise<void>;
}

export function createMailer(opts: {
  smtpUrl: string | undefined;
  from: string;
  log: { info(obj: object, msg: string): void };
}): Mailer {
  if (!opts.smtpUrl) {
    return {
      async envoyer(mail) {
        opts.log.info(
          { to: mail.to, subject: mail.subject },
          'e-mail non envoyé (SMTP_URL absent)',
        );
      },
    };
  }
  const transport = nodemailer.createTransport(opts.smtpUrl);
  return {
    async envoyer(mail) {
      await transport.sendMail({ from: opts.from, ...mail });
    },
  };
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
