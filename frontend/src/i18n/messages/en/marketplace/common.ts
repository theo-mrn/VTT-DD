import type fr from '../../fr/marketplace/common';
import type { Translation } from '../../../types';

export default {
  tabs: {
    label: 'Marketplace',
    catalog: 'Catalog',
    library: 'Library',
    studio: 'Studio',
    moderation: 'Moderation',
  },
  price: {
    free: 'Free',
  },
  version: 'v{number}',
  kinds: {
    scenes: 'Scenes',
    npcs: 'NPCs',
    objects: 'Objects',
  },
  counts: {
    scenes: '{count, plural, one {# scene} other {# scenes}}',
    npcs: '{count, plural, one {# NPC} other {# NPCs}}',
    objects: '{count, plural, one {# object} other {# objects}}',
  },
  listingStatus: {
    draft: 'Draft',
    published: 'On sale',
    unlisted: 'Unlisted',
    removed: 'Removed by moderation',
  },
  versionStatus: {
    draft: 'Draft',
    inReview: 'In review',
    published: 'Published',
    rejected: 'Rejected',
  },
  licenses: {
    personal: 'Personal use',
    ccBy: 'CC BY 4.0',
    ccBySa: 'CC BY-SA 4.0',
    ccByNc: 'CC BY-NC 4.0',
    cc0: 'CC0 (public domain)',
    ogl: 'OGL 1.0a',
    orc: 'ORC',
  },
  contentWarnings: {
    violence: 'Violence',
    horror: 'Horror',
    gore: 'Gore',
    drugs: 'Drugs',
    phobias: 'Phobias',
  },
  reportReasons: {
    copyright: 'Copyright',
    adult: 'Adult content',
    hateful: 'Hateful content',
    broken: 'Doesn’t work',
    misleading: 'Misleading',
    other: 'Other',
  },
  moderationReasons: {
    rights: 'Rights not established',
    adult: 'Adult content',
    hateful: 'Hateful content',
    quality: 'Insufficient quality',
    broken: 'Unusable content',
    misleading: 'Misleading listing',
    other: 'Other',
  },
  rating: {
    label: 'Rating',
    outOfFive: '{value, number} out of 5',
    count: '{count, plural, one {# review} other {# reviews}}',
    summary: 'out of 5, {count, plural, one {# review} other {# reviews}}',
  },
} satisfies Translation<typeof fr>;
