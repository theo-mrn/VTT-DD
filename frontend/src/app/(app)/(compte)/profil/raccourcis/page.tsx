'use client';

import { useTranslations } from 'next-intl';
import { TitrePage } from '@/components/compte/elements';
import { ShortcutsEditor } from '@/components/shortcuts/editor';

/** Profil › Raccourcis : les touches de tout le site, et ses raccourcis (docs/raccourcis.md). */
export default function PageRaccourcis() {
  const t = useTranslations('shell.nav');
  return (
    <div className="space-y-6">
      <TitrePage>{t('shortcuts')}</TitrePage>
      <ShortcutsEditor />
    </div>
  );
}
