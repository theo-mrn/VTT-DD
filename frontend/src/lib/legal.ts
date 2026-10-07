/**
 * Informations légales communes aux pages /legal, /privacy, /terms et /credits
 * (docs/legal.md). Une seule source : une adresse qui change se corrige ici.
 */

/** Date calendaire (`AAAA-MM-JJ`), affichée dans la langue de la page. */
export const LEGAL_UPDATED_AT = '2026-10-05';

export const PUBLISHER = {
  name: 'Théo MORIN',
  status: 'particulier, à titre non professionnel',
  email: 'contact@yner.fr',
} as const;

export const HOST = {
  name: 'Hostinger International Ltd',
  /** Pays écrit par chaque version de la page (Chypre, Cyprus). */
  address: '61 Lordou Vironos Street, 6023 Larnaca',
  contact: 'https://www.hostinger.fr/contact',
  /** Lieu des serveurs du cluster (données de la base comprises). */
  location: 'Paris, France',
} as const;

export const LEGAL_PAGES = {
  notice: '/legal',
  privacy: '/privacy',
  terms: '/terms',
  credits: '/credits',
} as const;

/** Durées de conservation annoncées dans /privacy : à tenir alignées avec le code et l'infra. */
export const RETENTION = {
  /** Sessions (IP, navigateur) après expiration ou déconnexion : purge d'identity. */
  sessionsDays: 30,
  /** Journaux techniques (Loki). */
  logsDays: 30,
  /** Traces (Tempo). */
  tracesDays: 3,
  /** Sauvegardes de la base (CloudNativePG vers R2). */
  backupsDays: 7,
  /** Suppression demandée → effacement définitif (identity, DELETION_GRACE_DAYS). */
  deletionGraceDays: 7,
  /** Sans connexion → e-mail de prévenance (identity, INACTIVE_AFTER_DAYS). */
  inactiveYears: 3,
  /** Prévenance → mise en suppression (identity, INACTIVITY_NOTICE_DAYS). */
  inactivityNoticeDays: 30,
} as const;
