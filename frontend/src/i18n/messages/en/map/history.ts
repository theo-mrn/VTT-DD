import type fr from '../../fr/map/history';
import type { Translation } from '../../../types';

export default {
  undo: 'Undo',
  redo: 'Redo',
  undoNamed: 'Undo “{name}”',
  redoNamed: 'Redo “{name}”',
} satisfies Translation<typeof fr>;
