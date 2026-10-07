import type fr from '../fr/uploads';
import type { Translation } from '../../types';

export default {
  notHere: 'Can’t upload here',
  failed: 'Upload failed',
  badFormat: 'Format not accepted ({formats})',
  dropLabel: '{name}: drag an image, paste, or choose a file',
  imageAddress: 'Image address',
  cropHint: 'Drag to frame, zoom with the wheel or the slider.',
  converting: 'Converting…',
  pasteAddress: 'Paste an address',
} satisfies Translation<typeof fr>;
