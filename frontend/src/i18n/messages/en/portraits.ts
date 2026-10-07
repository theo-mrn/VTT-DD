import type fr from '../fr/portraits';
import type { Translation } from '../../types';

export default {
  token: 'Token',
  fixedImage: 'Pick a still image (PNG, JPEG, WebP, AVIF).',
  preparing: 'Preparing…',
  uploadingOriginal: 'Uploading the original image…',
  uploadingBoth: 'Uploading the portrait and the token…',
  saved: 'Portrait and token saved',
  saveFailed: 'The portrait could not be saved',
  title: 'Portrait studio',
  portrait: 'Portrait',
  drop: 'Drop or paste an image',
  rounding: 'Rounding',
  margin: 'Margin',
  recenter: 'Back to centered framing',
  zoom: 'Zoom',
  follows: 'The portrait reuses the token’s framing',
  follow: 'Reuse the token’s framing',
  followsShort: 'Follows the token',
  separate: 'Set separately',
  frame: 'Frame',
  noFrame: 'No frame',
  premium: 'Premium',
  circle: 'Circle',
  square: 'Square',
} satisfies Translation<typeof fr>;
