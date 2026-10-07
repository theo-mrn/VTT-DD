/** Crédits et licences, version française : la seule qui fait foi (docs/i18n.md § 7). */
import { LegalLink, LegalList, LegalPage, LegalSection } from '../legal-page';
import { PUBLISHER } from '@/lib/legal';

const SRD_URL = 'https://dnd.wizards.com/resources/systems-reference-document';
const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/legalcode';

export default function CreditsFr() {
  return (
    <LegalPage
      title="Crédits et licences"
      intro={<p>Yner s’appuie sur le travail d’autres créateurs. Merci à eux.</p>}
    >
      <LegalSection title="Système D&D classique">
        <p>
          Ce travail comprend du contenu issu du Document de référence du système 5.1 (« SRD 5.1 »)
          de Wizards of the Coast LLC, disponible à l’adresse{' '}
          <LegalLink href={SRD_URL}>{SRD_URL.replace('https://', '')}</LegalLink>. Le SRD 5.1 est
          mis à disposition selon les termes de la licence Creative Commons Attribution 4.0
          International, disponible à l’adresse{' '}
          <LegalLink href={CC_BY_URL}>{CC_BY_URL.replace('https://', '')}</LegalLink>.
        </p>
        <p lang="en" className="text-sm text-subtle">
          This work includes material taken from the System Reference Document 5.1 (“SRD 5.1”) by
          Wizards of the Coast LLC and available at {SRD_URL}. The SRD 5.1 is licensed under the
          Creative Commons Attribution 4.0 International License available at {CC_BY_URL}.
        </p>
        <p>
          Les données du bestiaire ont été obtenues grâce à l’
          <LegalLink href="https://www.dnd5eapi.co">API D&D 5e</LegalLink> du projet 5e-bits
          (licence MIT), puis traduites et adaptées.
        </p>
        <p>
          Dungeons & Dragons et D&D sont des marques de Wizards of the Coast LLC. Yner n’est ni
          affilié à Wizards of the Coast, ni approuvé par elle.
        </p>
      </LegalSection>

      <LegalSection title="Système Star Wars : Aux confins de l’Empire">
        <p>
          Star Wars est une marque de Lucasfilm Ltd. Le jeu de rôle Star Wars : Aux confins de
          l’Empire est publié par Fantasy Flight Games et, en français, par Edge Studio. Ce système
          est une adaptation de fans, <strong>non officielle</strong> : Yner n’est ni affilié à ces
          sociétés, ni approuvé par elles. Possédez les livres pour jouer.
        </p>
        <p>
          Ayant droit, vous souhaitez qu’un contenu soit retiré ? Écrivez à{' '}
          <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink> : il le sera.
        </p>
      </LegalSection>

      <LegalSection title="Illustrations">
        <LegalList>
          <li>
            Cartes, portraits, jetons et décors : illustrations acquises sous licence d’usage
            commercial auprès de créateurs indépendants, et illustrations générées pour Yner.
          </li>
          <li>Certaines illustrations du bestiaire proviennent de l’API D&D 5e (5e-bits).</li>
          <li>Ces images ne peuvent pas être réutilisées en dehors de Yner.</li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Polices">
        <p>
          Les polices de l’interface et des cartes (Geist, Cinzel, Lora, Orbitron, IM Fell English
          et les autres) sont des polices libres, distribuées sous licence SIL Open Font License 1.1
          ou Apache 2.0, pour la plupart via Google Fonts.
        </p>
        <p>
          Systèmes de jeu : Hobbiton Brush Hand, de Nancy Lorenz, et Aurebesh, polices gratuites.
        </p>
      </LegalSection>

      <LegalSection title="Logiciels libres">
        <p>
          Yner est construit avec des logiciels libres, dont Next.js, React, three.js, PixiJS,
          cannon-es, Tailwind CSS, Lucide, Fastify, PostgreSQL et NATS, chacun sous sa licence (MIT,
          ISC, Apache 2.0, PostgreSQL License…).
        </p>
      </LegalSection>
    </LegalPage>
  );
}
