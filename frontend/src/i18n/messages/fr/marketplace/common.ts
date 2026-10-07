/**
 * Marketplace, commun (`lib/marketplace/format.ts`, `components/marketplace/elements.tsx`) :
 * prix, contenu, statuts, licences, avertissements, motifs, onglets, notes. Partagé par la
 * boutique et le studio.
 */
export default {
  /** Onglets de navigation de la marketplace. */
  tabs: {
    label: 'Marketplace',
    catalog: 'Catalogue',
    library: 'Bibliothèque',
    studio: 'Studio',
    moderation: 'Modération',
  },
  price: {
    free: 'Gratuit',
  },
  /** Numéro de version affiché : « v1.2.0 ». */
  version: 'v{number}',
  /** Types de contenu d'un pack (badges, filtre du catalogue). */
  kinds: {
    scenes: 'Scènes',
    npcs: 'PNJ',
    objects: 'Objets',
  },
  /** Contenu d'une version : « 3 scènes · 12 PNJ · 40 objets », chaque partie à part. */
  counts: {
    scenes: '{count, plural, one {# scène} other {# scènes}}',
    npcs: '{count, plural, one {# PNJ} other {# PNJ}}',
    objects: '{count, plural, one {# objet} other {# objets}}',
  },
  /** Statut d'une fiche. */
  listingStatus: {
    draft: 'Brouillon',
    published: 'En vente',
    unlisted: 'Retiré',
    removed: 'Retiré par la modération',
  },
  /** Statut d'une version (féminin en français : « une version »). */
  versionStatus: {
    draft: 'Brouillon',
    inReview: 'En revue',
    published: 'Publiée',
    rejected: 'Refusée',
  },
  /** Licences : noms propres, sauf l'usage personnel et le domaine public. */
  licenses: {
    personal: 'Usage personnel',
    ccBy: 'CC BY 4.0',
    ccBySa: 'CC BY-SA 4.0',
    ccByNc: 'CC BY-NC 4.0',
    cc0: 'CC0 (domaine public)',
    ogl: 'OGL 1.0a',
    orc: 'ORC',
  },
  contentWarnings: {
    violence: 'Violence',
    horror: 'Horreur',
    gore: 'Gore',
    drugs: 'Drogues',
    phobias: 'Phobies',
  },
  /** Motif d'un signalement par un membre. */
  reportReasons: {
    copyright: 'Droit d’auteur',
    adult: 'Contenu pour adultes',
    hateful: 'Contenu haineux',
    broken: 'Ne fonctionne pas',
    misleading: 'Trompeur',
    other: 'Autre',
  },
  /** Motif d'un refus en revue ou d'un retrait par la modération. */
  moderationReasons: {
    rights: 'Droits non établis',
    adult: 'Contenu pour adultes',
    hateful: 'Contenu haineux',
    quality: 'Qualité insuffisante',
    broken: 'Contenu inutilisable',
    misleading: 'Fiche trompeuse',
    other: 'Autre',
  },
  rating: {
    /** Choix d'une note (groupe d'étoiles). */
    label: 'Note',
    /** Une note sur cinq étoiles : « 4 sur 5 ». */
    outOfFive: '{value, number} sur 5',
    /** Nombre d'avis (info-bulle de la note moyenne). */
    count: '{count, plural, one {# avis} other {# avis}}',
    /** Lu après la note moyenne par un lecteur d'écran : « 4,3 sur 5, 12 avis ». */
    summary: 'sur 5, {count, plural, one {# avis} other {# avis}}',
  },
} as const;
