'use client';

/**
 * Raccourcis à l'échelle de l'app (docs/raccourcis.md § 5) : les préférences du compte chargées
 * une fois connecté, l'aide-mémoire (`?`) des touches actives là où l'on est (carte comprise),
 * et l'éditeur ouvert depuis lui, sans quitter la page ni la partie.
 */
import { useText } from '@/i18n/text';
import { useTranslations } from 'next-intl';
import { Keyboard } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';
import { activeMapStore } from '@/lib/map/active-map';
import { mapActionShortcut, mapToolShortcut } from '@/lib/map/shortcuts';
import { FIXED_SHORTCUTS, GENERAL_SHORTCUTS } from '@/lib/shortcuts/catalog';
import { bindingLabel } from '@/lib/shortcuts/chord';
import { shortcuts } from '@/lib/shortcuts/dispatcher';
import { useShortcut, useShortcutPrefs, useShortcutPrefsStore } from '@/lib/shortcuts/hooks';
import type { ShortcutDescriptor, ShortcutRole } from '@/lib/shortcuts/registry';
import { bindingOf } from '@/lib/shortcuts/store';
import { useSession } from '@/lib/session';
import { SECTIONS } from './catalog';
import { ShortcutsEditor } from './editor';

export function ShortcutsRoot() {
  const { profil } = useSession();
  const connecte = Boolean(profil);
  useShortcutPrefsStore(connecte);
  const [vue, setVue] = useState<'aide' | 'editeur' | null>(null);
  useShortcut(GENERAL_SHORTCUTS.cheatSheet, () => setVue((v) => (v ? null : 'aide')), {
    enabled: connecte,
  });
  if (!connecte) return null;
  return (
    <Dialog open={vue !== null} onOpenChange={(o) => !o && setVue(null)}>
      <DialogContent className={vue === 'editeur' ? 'max-w-2xl' : 'max-w-lg'}>
        {vue === 'editeur' ? <Editeur /> : <AideMemoire onEdit={() => setVue('editeur')} />}
      </DialogContent>
    </Dialog>
  );
}

/** Rôle à la table, lu sur la carte affichée (null hors de la table : tout). */
function useRoleTable(): ShortcutRole | null {
  const engine = useStore(activeMapStore, (s) => s.engine);
  return engine ? engine.viewer.role : null;
}

function Editeur() {
  const t = useTranslations('shortcuts.sheet');
  const role = useRoleTable();
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('editLead')}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[70vh] overflow-y-auto pr-1">
        <ShortcutsEditor role={role} />
      </div>
    </>
  );
}

/** Touches actives ici : commandes montées, carte affichée (outils, actions, gestes). */
function AideMemoire({ onEdit }: Readonly<{ onEdit(): void }>) {
  const t = useTranslations('shortcuts.sheet');
  const text = useText();
  const prefs = useShortcutPrefs();
  const engine = useStore(activeMapStore, (s) => s.engine);
  const actives = useMemo(() => {
    const list: ShortcutDescriptor[] = shortcuts.active();
    if (engine) {
      const viewer = engine.viewer;
      list.push(
        ...engine.tools
          .availableFor(viewer)
          .filter((t) => !t.hidden)
          .map(mapToolShortcut),
        ...engine
          .allActions()
          .filter((a) => !a.hint && (!a.available || a.available(viewer)))
          .map(mapActionShortcut),
        ...FIXED_SHORTCUTS.filter(
          (f) => f.scope === 'map' && (!f.roles || f.roles.includes(viewer.role)),
        ),
      );
    }
    const vus = new Set<string>();
    return list.filter((d) => !vus.has(d.id) && vus.add(d.id));
  }, [engine]);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Keyboard className="size-5 text-primary" />
          {t('title')}
        </DialogTitle>
        <DialogDescription className="sr-only">{t('activeLead')}</DialogDescription>
      </DialogHeader>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {SECTIONS.map(({ scope, title }) => {
          const rows = actives.flatMap((d) => {
            if (d.scope !== scope) return [];
            const touche = d.fixedLabel ? text(d.fixedLabel) : bindingLabel(bindingOf(prefs, d));
            return touche ? [{ d, touche }] : [];
          });
          if (!rows.length) return null;
          return (
            <section key={scope} aria-label={text(title)}>
              <h3 className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {text(title)}
              </h3>
              <ul className="space-y-1">
                {rows.map(({ d, touche }) => (
                  <li key={d.id} className="flex items-center gap-3 text-[13px]">
                    <span className="min-w-0 flex-1 truncate">{text(d.label)}</span>
                    <Kbd>{touche}</Kbd>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={onEdit}>
          {t('customize')}
        </Button>
      </div>
    </>
  );
}
