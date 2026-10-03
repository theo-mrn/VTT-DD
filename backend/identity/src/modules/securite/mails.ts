/**
 * Contenu des e-mails de sécurité, en français. Le lien est à usage unique :
 * il n'apparaît que dans le message, jamais dans les logs.
 */
import type { Mail } from '../../mail/mailer.js';

function echapper(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function html(titre: string, paragraphes: string[], lien: string, bouton: string): string {
  const corps = paragraphes.map((p) => `<p>${echapper(p)}</p>`).join('\n');
  const l = echapper(lien);
  return `<!doctype html>
<html lang="fr">
<body style="font-family: sans-serif; line-height: 1.5; color: #222;">
<h1 style="font-size: 20px;">${echapper(titre)}</h1>
${corps}
<p><a href="${l}" style="display: inline-block; padding: 10px 16px; background: #7a4b2a; color: #fff; text-decoration: none; border-radius: 6px;">${echapper(bouton)}</a></p>
<p style="font-size: 12px; color: #666;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>${l}</p>
</body>
</html>`;
}

export function mailReinitialisation(to: string, lien: string): Mail {
  const paragraphes = [
    'Vous avez demandé à réinitialiser le mot de passe de votre compte YNER.',
    'Ce lien est valable une heure et ne peut servir qu’une seule fois.',
    'Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.',
  ];
  return {
    to,
    subject: 'Réinitialisation de votre mot de passe',
    text: [
      'Bonjour,',
      '',
      paragraphes[0],
      '',
      `Choisissez un nouveau mot de passe : ${lien}`,
      '',
      paragraphes[1],
      paragraphes[2],
    ].join('\n'),
    html: html(
      'Réinitialisation de votre mot de passe',
      paragraphes,
      lien,
      'Choisir un nouveau mot de passe',
    ),
  };
}

export function mailVerification(to: string, lien: string): Mail {
  const paragraphes = [
    'Confirmez que cette adresse e-mail est bien la vôtre pour sécuriser votre compte YNER.',
    'Ce lien est valable 24 heures et ne peut servir qu’une seule fois.',
    'Si vous n’avez pas demandé cette vérification, ignorez cet e-mail.',
  ];
  return {
    to,
    subject: 'Vérifiez votre adresse e-mail',
    text: [
      'Bonjour,',
      '',
      paragraphes[0],
      '',
      `Confirmer mon adresse : ${lien}`,
      '',
      paragraphes[1],
      paragraphes[2],
    ].join('\n'),
    html: html('Vérifiez votre adresse e-mail', paragraphes, lien, 'Confirmer mon adresse'),
  };
}
