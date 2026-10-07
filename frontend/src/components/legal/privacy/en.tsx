/** Privacy policy, English translation (the French version is the binding one). */
import { LegalLink, LegalList, LegalPage, LegalSection, LegalTable } from '../legal-page';
import { HOST, LEGAL_PAGES, PUBLISHER, RETENTION } from '@/lib/legal';

const mail = <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>;

export default function PrivacyEn() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={
        <p>
          Yner only collects what it needs to run your games. No advertising, no audience
          measurement, no reselling, no profiling.
        </p>
      }
    >
      <LegalSection title="Data controller">
        <p>
          <strong>{PUBLISHER.name}</strong>, publisher of Yner (an individual acting on a
          non-professional basis). For any question or request about your data: {mail}.
        </p>
      </LegalSection>

      <LegalSection title="Data processed and why">
        <LegalTable
          head={['Data', 'Use', 'Legal basis']}
          rows={[
            [
              'Email address, username, password (stored hashed, never in plain text), profile picture and banner, preferences',
              'Create and run your account',
              'Performance of the terms of use',
            ],
            [
              'Identifier, email and name provided by Google, Discord or X, if you sign in with them',
              'Password-free sign-in, account linking',
              'Performance of the terms of use',
            ],
            [
              'Campaigns, maps, characters, notes, handouts, roll history, dice, audio settings, uploaded files',
              'The game itself: sharing them with your group and finding them again',
              'Performance of the terms of use',
            ],
            [
              'Friends and friend requests, API keys, link with the Discord bot',
              'Features you turn on',
              'Performance of the terms of use',
            ],
            [
              'Sign-in sessions: IP address, browser, dates',
              'Showing your signed-in devices, detecting session theft, limiting abuse',
              'Legitimate interest (security)',
            ],
            [
              'Technical logs: IP address, page or action requested, errors',
              'Diagnosing outages, protecting the service',
              'Legitimate interest (security and operation)',
            ],
            [
              'Email address',
              'Service emails: address verification, forgotten password, notifications (can be turned off in your profile)',
              'Performance of the terms of use',
            ],
          ]}
        />
        <p>Yner sends no promotional email and makes no automated decision about you.</p>
      </LegalSection>

      <LegalSection title="How long">
        <LegalList>
          <li>
            <strong>Account and game content</strong>: as long as your account exists. When you
            delete it, it is erased {RETENTION.deletionGraceDays} days later (signing in again in
            the meantime cancels the deletion), along with the campaigns you run as game master,
            your characters and your notes; it then disappears from backups after{' '}
            {RETENTION.backupsDays} days. Your rolls in other people’s campaigns stay there, under
            “Deleted player”.
          </li>
          <li>
            <strong>Inactive account</strong>: after {RETENTION.inactiveYears} years without signing
            in, an email warns you; without an answer within {RETENTION.inactivityNoticeDays} days,
            the account is deleted in the same way.
          </li>
          <li>
            <strong>Sessions</strong> (IP, browser): until you sign out or the session expires, then{' '}
            {RETENTION.sessionsDays} days.
          </li>
          <li>
            <strong>Technical logs</strong>: {RETENTION.logsDays} days; diagnostic traces:{' '}
            {RETENTION.tracesDays} days.
          </li>
          <li>
            <strong>Links sent by email</strong> (verification, password): 24 hours after they are
            used or expire.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Who can access it">
        <p>
          The members of your campaigns see what you share there, according to the permissions set
          by the game master. Otherwise, only the publisher and the following technical providers
          are involved, each for its own task:
        </p>
        <LegalTable
          head={['Provider', 'Role', 'Location']}
          rows={[
            [HOST.name, 'Hosting of the servers and the database', HOST.location],
            [
              'Cloudflare, Inc.',
              'Storing and delivering files, protecting and speeding up the website',
              'European Union and United States',
            ],
            [
              'Amazon Web Services EMEA SARL',
              'Sending service emails (Amazon SES)',
              'Paris, France',
            ],
            [
              'Google, Discord, X',
              'Signing in with these accounts, if you choose to; the Discord bot if you use it',
              'European Union and United States',
            ],
            [
              'YouTube (Google Ireland Ltd)',
              'Playing YouTube music chosen by the game master, if you agree',
              'European Union and United States',
            ],
          ]}
        />
        <p>
          Transfers to the United States rely on the EU–US Data Privacy Framework, to which these
          companies adhere, and on the European Commission’s standard contractual clauses.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies and browser storage">
        <p>
          Yner only uses what is strictly necessary for the service, so no consent banner is needed,
          except for YouTube.
        </p>
        <LegalTable
          head={['Name', 'Purpose', 'Duration']}
          rows={[
            ['vtt_refresh', 'Keep you signed in', 'The length of the session'],
            ['vtt_locale', 'Remember the language you chose', '1 year'],
            ['vtt_oauth', 'Secure a Google, Discord or X sign-in in progress', 'A few minutes'],
            [
              'Preferences (local storage)',
              'Volume, open panels, display settings',
              'Until you clear them',
            ],
            ['Cloudflare cookies', 'Protect the website against bots', 'At most 30 minutes'],
          ]}
        />
        <p>
          <strong>YouTube</strong>: when a game master plays YouTube music, the YouTube player may
          set its own trackers. It only loads with your consent, asked the first time; you can
          withdraw it from your profile.
        </p>
      </LegalSection>

      <LegalSection title="Security">
        <p>
          Encrypted connections (HTTPS), passwords hashed with argon2id, sessions you can revoke
          from your profile, restricted server access, encrypted backups. If a data breach poses a
          risk, the CNIL (the French data protection authority) is notified within 72 hours, and so
          are you if the risk is high.
        </p>
      </LegalSection>

      <LegalSection title="Minimum age">
        <p>
          Yner is intended for people aged 15 and over. Below that age, the consent of a parent or
          guardian is required.
        </p>
      </LegalSection>

      <LegalSection title="Your rights">
        <p>
          You can access your data, correct it, erase it, receive a copy in a machine-readable
          format (portability), object to processing based on legitimate interest, or ask for it to
          be restricted.
        </p>
        <LegalList>
          <li>
            From your profile, Security tab: download a copy of your data (JSON), delete your
            account, see and sign out your devices. Name, picture, banner and notifications are set
            in the profile.
          </li>
          <li>
            To change your email address or for any other request, write to {mail}. You will get an
            answer within one month.
          </li>
        </LegalList>
        <p>
          If you believe your rights are not respected, you can lodge a complaint with the{' '}
          <LegalLink href="https://www.cnil.fr/fr/plaintes">CNIL</LegalLink> (3 place de Fontenoy,
          TSA 80715, 75334 Paris Cedex 07, France).
        </p>
      </LegalSection>

      <LegalSection title="Changes">
        <p>
          This policy may change along with the service. In case of a significant change, you will
          be informed by email or in the application. See also the{' '}
          <LegalLink href={LEGAL_PAGES.terms}>terms of use</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
