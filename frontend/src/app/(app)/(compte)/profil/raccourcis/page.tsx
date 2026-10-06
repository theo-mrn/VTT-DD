'use client';

import { TitrePage } from '@/components/compte/elements';
import { ShortcutsEditor } from '@/components/shortcuts/editor';

/** Profil › Raccourcis : les touches de tout le site, et ses raccourcis (docs/raccourcis.md). */
export default function PageRaccourcis() {
  return (
    <div className="space-y-6">
      <TitrePage>Raccourcis</TitrePage>
      <ShortcutsEditor />
    </div>
  );
}
