import type fr from '../../fr/map/snap';
import type { Translation } from '../../../types';

export default {
  steps: {
    off: {
      label: 'Free',
      hint: 'Placed exactly under the pointer',
    },
    cell: {
      label: 'Grid: one square',
      hint: 'Centered in the square',
    },
    half: {
      label: 'Grid: half square',
      hint: 'Two steps per square',
    },
    quarter: {
      label: 'Grid: quarter square',
      hint: 'Four steps per square',
    },
  },
  title: 'Snapping',
  altHint: 'Alt during the gesture inverts the setting. Wall ends always snap.',
  current: 'Snapping: {label}',
} satisfies Translation<typeof fr>;
