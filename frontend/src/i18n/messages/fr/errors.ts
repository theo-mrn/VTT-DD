/**
 * Erreurs (docs/i18n.md § 8). En français, le `detail` du service passe d'abord ; ces textes
 * servent quand il manque, et dans les autres langues.
 */
export default {
  unreachable: 'Serveur injoignable, réessayez dans un instant.',
  generic: 'Une erreur est survenue.',
  /** Par code de problème des services (`code` de la réponse). */
  api: {
    version_conflict: 'Modifié entre-temps : rechargez puis réessayez.',
    voice_unconfigured: 'La voix n’est pas encore disponible sur ce serveur.',
    voice_upstream: 'Le service de voix ne répond pas, réessayez dans un instant.',
    voice_not_joined: 'Vous n’êtes plus dans la voix.',
    campaign_not_found: 'Campagne introuvable.',
    character_not_found: 'Personnage introuvable.',
    note_not_found: 'Note introuvable.',
    not_found: 'Introuvable.',
    storage_quota_exceeded: 'Espace de stockage plein.',
    storage_unavailable: 'L’envoi de fichiers n’est pas disponible pour le moment.',
    too_many_rolls: 'Trop de jets en peu de temps : patientez un instant.',
    too_many_messages: 'Trop de messages en peu de temps : patientez un instant.',
    email_taken: 'Un compte existe déjà avec cet e-mail.',
    invalid_password: 'Mot de passe incorrect.',
    invalid_notation: 'Formule de dés invalide.',
    banned: 'Vous avez été banni de cette campagne.',
    user_banned: 'Ce joueur est banni de cette campagne.',
    not_their_turn: 'Ce n’est pas son tour.',
    invalid_image: 'Image refusée.',
    invalid_image_url: 'Image refusée.',
    validation_failed: 'Données invalides.',
  },
  /** Fichier refusé avant l'envoi. */
  upload: {
    unsupportedType: 'Format non accepté ({formats})',
    tooLarge: 'Fichier trop lourd : {max, number} Mo au plus',
    storageUnavailable:
      'L’envoi d’images n’est pas encore disponible : le stockage n’est pas configuré sur ce serveur.',
  },
  /** Par statut HTTP, quand le code n'a pas de texte. */
  status: {
    badRequest: 'Requête invalide.',
    unauthorized: 'Session expirée : reconnectez-vous.',
    forbidden: 'Accès refusé.',
    notFound: 'Introuvable.',
    conflict: 'Conflit : rechargez puis réessayez.',
    tooLarge: 'Fichier trop volumineux.',
    tooMany: 'Trop de requêtes : patientez un instant.',
    server: 'Erreur du serveur, réessayez dans un instant.',
  },
} as const;
