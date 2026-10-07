import type { Locale } from '@vtt/contracts';
import type { formats } from './config';
import type { Messages } from './types';

// Clés, arguments et formats nommés vérifiés à la compilation (docs/i18n.md § 4)
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
    Formats: typeof formats;
  }
}
