'use client';

/**
 * Cadre de la carte, repris de l'ancien `app/[roomid]/map/layout.tsx` et de
 * `app/[roomid]/layout.tsx` : les fournisseurs de contexte dont la carte a
 * besoin (jeu, réglages, raccourcis, dialogues, contrôle de la carte,
 * annuler/refaire), le rechargement de la carte (`MapReloadContext`) et le
 * panneau Historique du MJ.
 *
 * Le reste de l'ancien layout (barre latérale, notes, chat, PNJ, musique…) est
 * pris en charge par la page de jeu ou n'est pas encore porté ; le panneau de
 * dés et le lanceur 3D sont ceux de la page de jeu. L'Historique s'ouvre par
 * son raccourci (comme depuis l'ancienne barre latérale) ou par son bouton.
 */
import { History } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Historique from '@/components/(historique)/Historique';
import { Toaster } from '@/components/ui/toast';
import { DialogVisibilityProvider } from '@/contexts/DialogVisibilityContext';
import { GameProvider, useGame } from '@/contexts/GameContext';
import { MapControlProvider } from '@/contexts/MapControlContext';
import { MapReloadContext } from '@/contexts/MapReloadContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { SHORTCUT_ACTIONS, ShortcutsProvider, useShortcuts } from '@/contexts/ShortcutsContext';
import { UndoRedoProvider } from '@/contexts/UndoRedoContext';
import { getMapStore } from '@/hooks/map/map-store';

export function MapLayout({
  campaignId,
  userId,
  isMJ,
  isOwner,
  persoId,
  children,
}: {
  campaignId: string;
  userId: string;
  isMJ: boolean;
  isOwner?: boolean;
  persoId: string | null;
  children: ReactNode;
}) {
  const [mapReloadKey, setMapReloadKey] = useState(0);
  // « Recharger la carte » : relit aussi les données (l'ancienne app remontait les écouteurs)
  const reloadMap = useCallback(() => {
    const store = getMapStore(campaignId);
    void store.loadCampaign().then(() => store.reloadMap());
    setMapReloadKey((k) => k + 1);
  }, [campaignId]);

  return (
    <GameProvider
      campaignId={campaignId}
      userId={userId}
      isMJ={isMJ}
      isOwner={isOwner}
      persoId={persoId}
    >
      <SettingsProvider>
        <UndoRedoProvider>
          <ShortcutsProvider>
            <DialogVisibilityProvider>
              <MapControlProvider>
                <div className="relative flex h-full w-full bg-[var(--bg-dark)] text-[var(--text-primary)]">
                  <main className="relative flex h-full flex-1 items-center justify-center">
                    <MapReloadContext.Provider value={reloadMap}>
                      <div key={mapReloadKey} className="h-full w-full">
                        {children}
                      </div>
                    </MapReloadContext.Provider>
                  </main>
                  <HistoryPanel roomId={campaignId} />
                </div>
                <Toaster />
              </MapControlProvider>
            </DialogVisibilityProvider>
          </ShortcutsProvider>
        </UndoRedoProvider>
      </SettingsProvider>
    </GameProvider>
  );
}

/**
 * Historique (MJ) : panneau persistant de l'ancien layout, monté à la
 * première ouverture puis gardé (masqué) pour ne pas relire l'historique.
 */
function HistoryPanel({ roomId }: { roomId: string }) {
  const { isMJ } = useGame();
  const { isShortcutPressed, onActionTriggered } = useShortcuts();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const toggle = useCallback(() => {
    setMounted(true);
    setOpen((o) => !o);
  }, []);

  useEffect(() => {
    if (!isMJ) return;
    const onKey = (e: KeyboardEvent) => {
      if (isShortcutPressed(e, SHORTCUT_ACTIONS.TAB_HISTORIQUE)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', onKey);
    const off = onActionTriggered(SHORTCUT_ACTIONS.TAB_HISTORIQUE, toggle);
    return () => {
      window.removeEventListener('keydown', onKey);
      off?.();
    };
  }, [isMJ, isShortcutPressed, onActionTriggered, toggle]);

  if (!isMJ) return null;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        title="Historique"
        className="absolute bottom-4 left-4 z-30 inline-flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-card)] p-2.5 text-[var(--text-primary)] shadow-xl transition-colors hover:bg-[color-mix(in_srgb,var(--accent-brown)_20%,var(--bg-card))]"
      >
        <History className="h-5 w-5 text-[var(--accent-brown)]" />
      </button>
      {mounted && (
        <aside
          className={`absolute bottom-0 left-0 top-0 z-40 w-full overflow-hidden text-[var(--text-primary)] shadow-lg sm:w-[500px] md:w-[600px] lg:w-[400px] ${open ? '' : 'hidden'}`}
        >
          <div className="h-full">
            <Historique roomId={roomId} />
          </div>
        </aside>
      )}
    </>
  );
}
