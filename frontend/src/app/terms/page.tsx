import type { Metadata } from 'next';
import { LegalLink, LegalList, LegalPage, LegalSection } from '@/components/legal/legal-page';
import { LEGAL_PAGES, PUBLISHER } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Conditions d’utilisation',
  description: 'Les règles du jeu de Yner : compte, contenus, signalement, responsabilités.',
};

const mail = <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>;

export default function TermsPage() {
  return (
    <LegalPage
      title="Conditions d’utilisation"
      intro={
        <p>
          Yner est une table de jeu de rôle en ligne, gratuite, éditée par {PUBLISHER.name}. En
          créant un compte ou en utilisant Yner, vous acceptez ces conditions.
        </p>
      }
    >
      <LegalSection title="1. Le service">
        <p>
          Yner permet de mener des parties de jeu de rôle : cartes, personnages, dés, musique,
          notes, combat. Il est gratuit, sans publicité, et ne vend rien. Les dons éventuels sont
          facultatifs et ne donnent accès à aucune fonctionnalité.
        </p>
        <p>
          Yner est un projet personnel : il est fourni tel quel, sans garantie de disponibilité
          permanente. Ses fonctionnalités peuvent évoluer. S’il devait fermer, vous seriez prévenu
          au moins 30 jours à l’avance pour récupérer vos données.
        </p>
      </LegalSection>

      <LegalSection title="2. Votre compte">
        <LegalList>
          <li>
            Yner s’adresse aux personnes de <strong>15 ans et plus</strong> ; en dessous, l’accord
            d’un parent ou tuteur est nécessaire.
          </li>
          <li>Les informations de votre compte doivent être exactes, en particulier l’e-mail.</li>
          <li>
            Vous êtes responsable de ce qui est fait avec votre compte : gardez votre mot de passe
            et vos clés d’API pour vous. En cas de doute, déconnectez vos sessions depuis votre
            profil et prévenez-nous.
          </li>
          <li>
            Vous pouvez supprimer votre compte à tout moment (voir la{' '}
            <LegalLink href={LEGAL_PAGES.privacy}>politique de confidentialité</LegalLink>). Les
            campagnes dont vous êtes le maître du jeu sont alors supprimées avec lui, ainsi que vos
            personnages dans les campagnes des autres.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Vos contenus">
        <p>
          Les campagnes, personnages, notes, cartes et images que vous créez ou envoyez restent les
          vôtres. Vous accordez seulement à Yner le droit de les stocker, de les copier
          techniquement et de les afficher aux personnes avec qui vous les partagez, le temps
          nécessaire au service.
        </p>
        <p>
          Vous devez avoir le droit d’utiliser ce que vous envoyez : une image trouvée en ligne
          appartient souvent à quelqu’un.
        </p>
      </LegalSection>

      <LegalSection title="4. Ce qui est interdit">
        <LegalList>
          <li>
            les contenus illégaux : haine, apologie du terrorisme ou de crimes, pédopornographie,
            harcèlement, menaces, diffamation ;
          </li>
          <li>la contrefaçon : images, textes ou musiques utilisés sans en avoir le droit ;</li>
          <li>la diffusion de données personnelles d’autrui sans son accord ;</li>
          <li>
            les atteintes au service : contourner les droits d’accès, surcharger les serveurs,
            automatiser des comptes, tenter d’accéder aux données d’autres joueurs ;
          </li>
          <li>l’usage de Yner pour du spam ou une activité commerciale non autorisée.</li>
        </LegalList>
        <p>
          Le contenu d’une partie (violence, horreur, thèmes adultes) est libre tant qu’il reste
          légal et partagé entre personnes qui y consentent.
        </p>
      </LegalSection>

      <LegalSection id="signalement" title="5. Signaler un contenu">
        <p>Pour signaler un contenu que vous pensez illicite, écrivez à {mail} en indiquant :</p>
        <LegalList>
          <li>l’adresse de la page ou le nom de la campagne, et le contenu concerné ;</li>
          <li>pourquoi il vous semble illicite (et, si possible, la loi en cause) ;</li>
          <li>
            vos nom et adresse e-mail, sauf pour un contenu pédopornographique ou terroriste ;
          </li>
          <li>une déclaration que votre signalement est fait de bonne foi.</li>
        </LegalList>
        <p>
          Chaque signalement reçoit un accusé de réception et une réponse. Un contenu manifestement
          illicite est retiré rapidement. Signaler sciemment un contenu licite comme illicite pour
          le faire retirer est puni par la loi.
        </p>
      </LegalSection>

      <LegalSection title="6. Modération">
        <p>
          En cas de manquement à ces conditions, un contenu peut être retiré et un compte suspendu,
          puis supprimé en cas de manquement grave ou répété. La décision vous est expliquée par
          e-mail, avec ses motifs, sauf si la loi l’interdit. Vous pouvez la contester en répondant
          à cet e-mail ; elle est alors réexaminée.
        </p>
      </LegalSection>

      <LegalSection title="7. Contenus de jeu de tiers">
        <p>
          Certains systèmes de jeu et ressources proposés reprennent des contenus de tiers, sous
          leur licence ou à titre non officiel. Ils restent la propriété de leurs auteurs ; Yner
          n’est ni affilié ni approuvé par eux. Le détail figure sur la page{' '}
          <LegalLink href={LEGAL_PAGES.credits}>crédits et licences</LegalLink>. Sur demande d’un
          ayant droit, un contenu peut être retiré.
        </p>
      </LegalSection>

      <LegalSection title="8. Services liés">
        <p>
          La connexion avec Google, Discord ou X, le bot Discord et la musique YouTube passent par
          ces services : leurs propres conditions s’appliquent aussi.
        </p>
      </LegalSection>

      <LegalSection title="9. Responsabilité">
        <p>
          Yner est gratuit et fourni sans garantie. Son éditeur ne peut être tenu responsable d’une
          interruption, d’une perte de données ou des contenus publiés par les joueurs, sauf faute
          de sa part ou disposition légale contraire. Faites une copie de ce qui compte pour vous.
        </p>
      </LegalSection>

      <LegalSection title="10. Modifications">
        <p>
          Ces conditions peuvent évoluer. En cas de changement important, vous en êtes informé par
          e-mail ou dans l’application au moins 15 jours avant ; continuer à utiliser Yner ensuite
          vaut acceptation. Sinon, vous pouvez supprimer votre compte.
        </p>
      </LegalSection>

      <LegalSection title="11. Droit applicable">
        <p>
          Ces conditions sont soumises au droit français. En cas de désaccord, écrivez d’abord à{' '}
          {mail} pour trouver une solution amiable ; à défaut, les tribunaux français sont
          compétents, sans préjudice des règles protégeant les consommateurs.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
