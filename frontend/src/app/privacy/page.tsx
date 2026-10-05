import type { Metadata } from 'next';
import {
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalTable,
} from '@/components/legal/legal-page';
import { HOST, LEGAL_PAGES, PUBLISHER, RETENTION } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Les données que Yner traite, pourquoi, combien de temps, et vos droits.',
};

const mail = <LegalLink href={`mailto:${PUBLISHER.email}`}>{PUBLISHER.email}</LegalLink>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      intro={
        <p>
          Yner ne collecte que ce qui sert à faire tourner vos parties. Pas de publicité, pas de
          mesure d’audience, pas de revente, pas de profilage.
        </p>
      }
    >
      <LegalSection title="Responsable du traitement">
        <p>
          <strong>{PUBLISHER.name}</strong>, éditeur de Yner ({PUBLISHER.status}). Pour toute
          question ou demande sur vos données : {mail}.
        </p>
      </LegalSection>

      <LegalSection title="Données traitées et pourquoi">
        <LegalTable
          head={['Données', 'Utilisation', 'Base légale']}
          rows={[
            [
              'Adresse e-mail, nom d’utilisateur, mot de passe (stocké haché, jamais en clair), photo et bannière de profil, préférences',
              'Créer et faire fonctionner votre compte',
              'Exécution des conditions d’utilisation',
            ],
            [
              'Identifiant, e-mail et nom fournis par Google, Discord ou X, si vous vous connectez avec eux',
              'Connexion sans mot de passe, liaison de comptes',
              'Exécution des conditions d’utilisation',
            ],
            [
              'Campagnes, cartes, personnages, notes, documents, historique des jets, dés, réglages audio, fichiers envoyés',
              'Le jeu lui-même : les partager avec votre groupe et les retrouver',
              'Exécution des conditions d’utilisation',
            ],
            [
              'Amis et demandes d’ami, clés d’API, liaison avec le bot Discord',
              'Fonctionnalités que vous activez',
              'Exécution des conditions d’utilisation',
            ],
            [
              'Sessions de connexion : adresse IP, navigateur, dates',
              'Vous montrer vos appareils connectés, détecter un vol de session, limiter les abus',
              'Intérêt légitime (sécurité)',
            ],
            [
              'Journaux techniques : adresse IP, page ou action demandée, erreurs',
              'Diagnostiquer les pannes, protéger le service',
              'Intérêt légitime (sécurité et fonctionnement)',
            ],
            [
              'Adresse e-mail',
              'E-mails de service : vérification de l’adresse, mot de passe oublié, notifications (désactivables dans votre profil)',
              'Exécution des conditions d’utilisation',
            ],
          ]}
        />
        <p>
          Yner n’envoie aucun e-mail publicitaire et ne prend aucune décision automatisée vous
          concernant.
        </p>
      </LegalSection>

      <LegalSection title="Combien de temps">
        <LegalList>
          <li>
            <strong>Compte et contenus de jeu</strong> : tant que votre compte existe. Supprimé à
            votre demande, il est effacé {RETENTION.deletionGraceDays} jours plus tard (une
            reconnexion d’ici là annule), avec vos campagnes de maître du jeu, vos personnages et
            vos notes ; puis il disparaît des sauvegardes au bout de {RETENTION.backupsDays} jours.
            Vos jets dans les campagnes des autres y restent, sous « Joueur supprimé ».
          </li>
          <li>
            <strong>Compte inactif</strong> : sans connexion pendant {RETENTION.inactiveYears} ans,
            un e-mail vous prévient ; sans retour sous {RETENTION.inactivityNoticeDays} jours, le
            compte est supprimé de la même façon.
          </li>
          <li>
            <strong>Sessions</strong> (IP, navigateur) : jusqu’à la déconnexion ou l’expiration de
            la session, puis {RETENTION.sessionsDays} jours.
          </li>
          <li>
            <strong>Journaux techniques</strong> : {RETENTION.logsDays} jours ; traces de diagnostic
            : {RETENTION.tracesDays} jours.
          </li>
          <li>
            <strong>Liens envoyés par e-mail</strong> (vérification, mot de passe) : 24 heures après
            leur utilisation ou leur expiration.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection title="Qui y a accès">
        <p>
          Les membres de vos campagnes voient ce que vous y partagez, selon les droits fixés par le
          maître du jeu. Sinon, seuls l’éditeur et les prestataires techniques suivants
          interviennent, chacun pour sa mission :
        </p>
        <LegalTable
          head={['Prestataire', 'Rôle', 'Lieu']}
          rows={[
            [HOST.name, 'Hébergement des serveurs et de la base de données', HOST.location],
            [
              'Cloudflare, Inc.',
              'Stockage et diffusion des fichiers, protection et accélération du site',
              'Union européenne et États-Unis',
            ],
            [
              'Amazon Web Services EMEA SARL',
              'Envoi des e-mails de service (Amazon SES)',
              'Paris, France',
            ],
            [
              'Google, Discord, X',
              'Connexion avec ces comptes, si vous la choisissez ; bot Discord si vous l’utilisez',
              'Union européenne et États-Unis',
            ],
            [
              'YouTube (Google Ireland Ltd)',
              'Lecture des musiques YouTube choisies par le maître du jeu, si vous l’acceptez',
              'Union européenne et États-Unis',
            ],
          ]}
        />
        <p>
          Les transferts vers les États-Unis reposent sur le cadre de protection des données
          UE–États-Unis (Data Privacy Framework), auquel ces sociétés adhèrent, et sur les clauses
          contractuelles types de la Commission européenne.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookies et stockage du navigateur">
        <p>
          Yner n’utilise que ce qui est indispensable au service : aucun bandeau n’est donc
          nécessaire, sauf pour YouTube.
        </p>
        <LegalTable
          head={['Nom', 'Rôle', 'Durée']}
          rows={[
            ['vtt_refresh', 'Garder votre session ouverte', 'Celle de la session'],
            [
              'vtt_oauth',
              'Sécuriser une connexion Google, Discord ou X en cours',
              'Quelques minutes',
            ],
            [
              'Préférences (stockage local)',
              'Volume, panneaux ouverts, réglages d’affichage',
              'Jusqu’à ce que vous les effaciez',
            ],
            ['Cookies Cloudflare', 'Protéger le site contre les robots', 'Au plus 30 minutes'],
          ]}
        />
        <p>
          <strong>YouTube</strong> : quand un maître du jeu diffuse une musique YouTube, le lecteur
          de YouTube peut déposer ses propres traceurs. Il ne se charge qu’avec votre accord,
          demandé la première fois ; vous pouvez le retirer depuis votre profil.
        </p>
      </LegalSection>

      <LegalSection title="Sécurité">
        <p>
          Connexions chiffrées (HTTPS), mots de passe hachés avec argon2id, sessions révocables
          depuis votre profil, accès aux serveurs restreint, sauvegardes chiffrées. En cas de fuite
          de données présentant un risque, la CNIL est prévenue sous 72 heures, et vous aussi si le
          risque est élevé.
        </p>
      </LegalSection>

      <LegalSection title="Âge minimum">
        <p>
          Yner s’adresse aux personnes de 15 ans et plus. En dessous, l’accord d’un parent ou tuteur
          est nécessaire.
        </p>
      </LegalSection>

      <LegalSection title="Vos droits">
        <p>
          Vous pouvez accéder à vos données, les corriger, les effacer, en recevoir une copie dans
          un format lisible par une machine (portabilité), vous opposer à un traitement fondé sur
          l’intérêt légitime ou en demander la limitation.
        </p>
        <LegalList>
          <li>
            Depuis votre profil, onglet Sécurité : télécharger une copie de vos données (JSON),
            supprimer votre compte, voir et déconnecter vos appareils. Nom, photo, bannière et
            notifications se règlent dans le profil.
          </li>
          <li>
            Pour changer d’adresse e-mail ou toute autre demande, écrivez à {mail}. Une réponse vous
            est apportée sous un mois.
          </li>
        </LegalList>
        <p>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir la{' '}
          <LegalLink href="https://www.cnil.fr/fr/plaintes">CNIL</LegalLink> (3 place de Fontenoy,
          TSA 80715, 75334 Paris Cedex 07).
        </p>
      </LegalSection>

      <LegalSection title="Modifications">
        <p>
          Cette politique peut évoluer avec le service. En cas de changement important, vous en
          serez informé par e-mail ou dans l’application. Voir aussi les{' '}
          <LegalLink href={LEGAL_PAGES.terms}>conditions d’utilisation</LegalLink>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
