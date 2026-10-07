/** Credits and licenses, English translation. */
import { LegalLink, LegalList, LegalPage, LegalSection } from '../legal-page';
import { PUBLISHER } from '@/lib/legal';

const SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

export default function CreditsEn() {
  return (
    <LegalPage
      title="Credits and licenses"
      intro={<p>Yner builds on the work of other creators. Thank you to them.</p>}
    >
      <LegalSection title="Classic D&D system">
        <p>
          This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by
          Wizards of the Coast LLC and available at{' '}
          <LegalLink href={SRD_URL}>{SRD_URL.replace('https://', '')}</LegalLink>. The SRD 5.1 is
          licensed under the Creative Commons Attribution 4.0 International License available at{' '}
          <LegalLink href={CC_BY_URL}>{CC_BY_URL.replace('https://', '')}</LegalLink>.
        </p>
        <p>
          The bestiary data was obtained from the{' '}
          <LegalLink href="https://www.dnd5eapi.co">D&D 5e API</LegalLink> by the 5e-bits project
          (MIT license), then translated and adapted.
        </p>
        <p>
          Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. Yner is neither
          affiliated with nor endorsed by Wizards of the Coast.
        </p>
      </LegalSection>

      <LegalSection title="Star Wars: Edge of the Empire system">
        <p>
          Star Wars is a trademark of Lucasfilm Ltd. The Star Wars: Edge of the Empire roleplaying
          game is published by Fantasy Flight Games and, in French, by Edge Studio. This system is
          an <strong>unofficial</strong> fan adaptation: Yner is neither affiliated with nor
          endorsed by these companies. Own the books to play.
        </p>
        <p>
          Are you a rights holder and want some content removed? Write to{' '}
          <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>: it will be.
        </p>
      </LegalSection>

      <LegalSection title="Artwork">
        <LegalList>
          <li>
            Maps, portraits, tokens and scenery: artwork licensed for commercial use from
            independent creators, and artwork generated for Yner.
          </li>
          <li>Some bestiary artwork comes from the D&D 5e API (5e-bits).</li>
          <li>These images may not be reused outside of Yner.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Fonts">
        <p>
          The interface and map fonts (Geist, Cinzel, Lora, Orbitron, IM Fell English and others)
          are free fonts, distributed under the SIL Open Font License 1.1 or Apache 2.0, mostly
          through Google Fonts.
        </p>
        <p>Game systems: Hobbiton Brush Hand, by Nancy Lorenz, and Aurebesh, free fonts.</p>
      </LegalSection>

      <LegalSection title="Open-source software">
        <p>
          Yner is built with open-source software, including Next.js, React, three.js, PixiJS,
          cannon-es, Tailwind CSS, Lucide, Fastify, PostgreSQL and NATS, each under its own license
          (MIT, ISC, Apache 2.0, PostgreSQL License…).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
