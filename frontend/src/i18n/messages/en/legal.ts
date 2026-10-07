import type fr from '../fr/legal';
import type { Translation } from '../../types';

export default {
  updatedAt: 'Last updated: {date}',
  translationNotice:
    'This translation is provided for your convenience; only the French version is legally binding.',
} satisfies Translation<typeof fr>;
