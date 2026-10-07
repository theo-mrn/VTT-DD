/** Terms of use, English translation (the French version is the binding one). */
import { LegalLink, LegalList, LegalPage, LegalSection } from '../legal-page';
import { LEGAL_PAGES, PUBLISHER } from '@/lib/legal';

const mail = <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>;

export default function TermsEn() {
  return (
    <LegalPage
      title="Terms of use"
      intro={
        <p>
          Yner is a free online tabletop for roleplaying games, published by {PUBLISHER.name}. By
          creating an account or using Yner, you accept these terms.
        </p>
      }
    >
      <LegalSection title="1. The service">
        <p>
          Yner lets you run roleplaying games: maps, characters, dice, music, notes, combat. It is
          free, has no advertising, and sells nothing. Donations, if any, are optional and do not
          unlock any feature.
        </p>
        <p>
          Yner is a personal project: it is provided as is, with no guarantee of permanent
          availability. Its features may change. Should it close, you would be notified at least 30
          days in advance so you can retrieve your data.
        </p>
      </LegalSection>

      <LegalSection title="2. Your account">
        <LegalList>
          <li>
            Yner is intended for people aged <strong>15 and over</strong>; below that age, the
            consent of a parent or guardian is required.
          </li>
          <li>Your account information must be accurate, especially your email.</li>
          <li>
            You are responsible for what is done with your account: keep your password and your API
            keys to yourself. If in doubt, sign out your sessions from your profile and let us know.
          </li>
          <li>
            You can delete your account at any time from your profile: it is deleted 7 days later,
            unless you sign in again in the meantime (see the{' '}
            <LegalLink href={LEGAL_PAGES.privacy}>privacy policy</LegalLink>). The campaigns you run
            as game master are then deleted with it, for all their players, as are your characters
            in other people’s campaigns.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="3. Your content">
        <p>
          The campaigns, characters, notes, maps and images you create or upload remain yours. You
          only grant Yner the right to store them, copy them technically and show them to the people
          you share them with, for as long as the service requires.
        </p>
        <p>
          You must have the right to use what you upload: an image found online often belongs to
          someone.
        </p>
      </LegalSection>

      <LegalSection title="4. What is forbidden">
        <LegalList>
          <li>
            unlawful content: hate, glorification of terrorism or crimes, child sexual abuse
            material, harassment, threats, defamation;
          </li>
          <li>infringement: images, text or music used without the right to do so;</li>
          <li>sharing other people’s personal data without their consent;</li>
          <li>
            attacks on the service: bypassing access rights, overloading the servers, automating
            accounts, trying to access other players’ data;
          </li>
          <li>using Yner for spam or unauthorized commercial activity.</li>
        </LegalList>
        <p>
          The content of a game (violence, horror, adult themes) is free as long as it stays lawful
          and is shared between people who consent to it.
        </p>
      </LegalSection>

      <LegalSection id="signalement" title="5. Reporting content">
        <p>To report content you believe is unlawful, write to {mail} stating:</p>
        <LegalList>
          <li>the address of the page or the name of the campaign, and the content concerned;</li>
          <li>why it seems unlawful to you (and, if possible, the law involved);</li>
          <li>your name and email address, except for child sexual abuse or terrorist content;</li>
          <li>a statement that your report is made in good faith.</li>
        </LegalList>
        <p>
          Every report is acknowledged and answered. Manifestly unlawful content is removed
          promptly. Knowingly reporting lawful content as unlawful to have it removed is punishable
          by law.
        </p>
      </LegalSection>

      <LegalSection title="6. Moderation">
        <p>
          If these terms are breached, content may be removed and an account suspended, then deleted
          in case of a serious or repeated breach. The decision is explained to you by email, with
          its reasons, unless the law forbids it. You can contest it by replying to that email; it
          is then reviewed.
        </p>
      </LegalSection>

      <LegalSection title="7. Third-party game content">
        <p>
          Some of the game systems and resources offered reuse third-party content, under their
          license or on an unofficial basis. They remain the property of their authors; Yner is
          neither affiliated with nor endorsed by them. Details are on the{' '}
          <LegalLink href={LEGAL_PAGES.credits}>credits and licenses</LegalLink> page. Content may
          be removed at the request of a rights holder.
        </p>
      </LegalSection>

      <LegalSection title="8. Linked services">
        <p>
          Signing in with Google, Discord or X, the Discord bot and YouTube music go through these
          services: their own terms also apply.
        </p>
      </LegalSection>

      <LegalSection title="9. Liability">
        <p>
          Yner is free and provided without warranty. Its publisher cannot be held liable for an
          interruption, a loss of data or content published by players, except in case of fault on
          its part or a contrary legal provision. Keep a copy of what matters to you.
        </p>
      </LegalSection>

      <LegalSection title="10. Changes">
        <p>
          These terms may change. In case of a significant change, you are informed by email or in
          the application at least 15 days in advance; continuing to use Yner afterwards means you
          accept them. Otherwise, you can delete your account.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These terms are governed by French law. In case of disagreement, first write to {mail} to
          find an amicable solution; failing that, the French courts have jurisdiction, without
          prejudice to the rules protecting consumers.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
