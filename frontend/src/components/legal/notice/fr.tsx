/** Mentions légales, version française : la seule qui fait foi (docs/i18n.md § 7). */
import { LegalLink, LegalList, LegalPage, LegalSection } from '../legal-page';
import { HOST, LEGAL_PAGES, PUBLISHER } from '@/lib/legal';

export default function NoticeFr() {
  return (
    <LegalPage title="Mentions légales">
      <LegalSection title="Éditeur">
        <p>
          Le site <strong>yner.fr</strong> et l’application Yner sont édités par{' '}
          <strong>{PUBLISHER.name}</strong>, {PUBLISHER.status}.
        </p>
        <LegalList>
          <li>
            Directeur de la publication : <strong>{PUBLISHER.name}</strong>
          </li>
          <li>
            Contact : <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>
          </li>
        </LegalList>
        <p>
          Yner est gratuit, ne vend rien et n’affiche aucune publicité. Les dons éventuels sont
          facultatifs et ne donnent accès à aucune fonctionnalité.
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p>
          <strong>{HOST.name}</strong>
          <br />
          {HOST.address}, Chypre
          <br />
          <LegalLink href={HOST.contact}>{HOST.contact.replace('https://', '')}</LegalLink>
        </p>
        <p>Les serveurs de l’application et la base de données sont situés à {HOST.location}.</p>
        <p>
          Les fichiers (images, cartes, portraits) sont stockés et diffusés par{' '}
          <strong>Cloudflare, Inc.</strong>, 101 Townsend Street, San Francisco, CA 94107,
          États-Unis (<LegalLink href="https://www.cloudflare.com">cloudflare.com</LegalLink>
          ), qui assure aussi la protection et l’accélération du site.
        </p>
      </LegalSection>

      <LegalSection title="Signaler un contenu">
        <p>
          Les joueurs peuvent envoyer des images et des textes. Pour signaler un contenu illicite,
          écrivez à <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink> en
          suivant la procédure décrite dans les{' '}
          <LegalLink href={`${LEGAL_PAGES.terms}#signalement`}>conditions d’utilisation</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p>
          Le code, le nom, le logo et l’interface de Yner appartiennent à leur éditeur. Les contenus
          de jeu et les ressources de tiers restent la propriété de leurs auteurs : la liste et
          leurs licences figurent sur la page{' '}
          <LegalLink href={LEGAL_PAGES.credits}>crédits et licences</LegalLink>.
        </p>
        <p>
          Les contenus créés par les joueurs (campagnes, personnages, notes, images envoyées)
          restent les leurs.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <p>
          Le traitement de vos données est décrit dans la{' '}
          <LegalLink href={LEGAL_PAGES.privacy}>politique de confidentialité</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
