/** Legal notice, English translation (the French version is the binding one). */
import { LegalLink, LegalList, LegalPage, LegalSection } from '../legal-page';
import { HOST, LEGAL_PAGES, PUBLISHER } from '@/lib/legal';

export default function NoticeEn() {
  return (
    <LegalPage title="Legal notice">
      <LegalSection title="Publisher">
        <p>
          The <strong>yner.fr</strong> website and the Yner application are published by{' '}
          <strong>{PUBLISHER.name}</strong>, an individual acting on a non-professional basis.
        </p>
        <LegalList>
          <li>
            Director of publication: <strong>{PUBLISHER.name}</strong>
          </li>
          <li>
            Contact: <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>
          </li>
        </LegalList>
        <p>
          Yner is free, sells nothing and shows no advertising. Donations, if any, are optional and
          do not unlock any feature.
        </p>
      </LegalSection>

      <LegalSection title="Hosting">
        <p>
          <strong>{HOST.name}</strong>
          <br />
          {HOST.address}, Cyprus
          <br />
          <LegalLink href={HOST.contact}>{HOST.contact.replace('https://', '')}</LegalLink>
        </p>
        <p>The application servers and the database are located in {HOST.location}.</p>
        <p>
          Files (images, maps, portraits) are stored and delivered by{' '}
          <strong>Cloudflare, Inc.</strong>, 101 Townsend Street, San Francisco, CA 94107, United
          States (<LegalLink href="https://www.cloudflare.com">cloudflare.com</LegalLink>), which
          also protects and speeds up the website.
        </p>
      </LegalSection>

      <LegalSection title="Reporting content">
        <p>
          Players can upload images and text. To report unlawful content, write to{' '}
          <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink> following the
          procedure described in the{' '}
          <LegalLink href={`${LEGAL_PAGES.terms}#signalement`}>terms of use</LegalLink>.
        </p>
      </LegalSection>

      <LegalSection title="Intellectual property">
        <p>
          Yner’s code, name, logo and interface belong to its publisher. Game content and
          third-party resources remain the property of their authors: the list and their licenses
          are on the <LegalLink href={LEGAL_PAGES.credits}>credits and licenses</LegalLink> page.
        </p>
        <p>
          Content created by players (campaigns, characters, notes, uploaded images) remains theirs.
        </p>
      </LegalSection>

      <LegalSection title="Personal data">
        <p>
          How your data is processed is described in the{' '}
          <LegalLink href={LEGAL_PAGES.privacy}>privacy policy</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
