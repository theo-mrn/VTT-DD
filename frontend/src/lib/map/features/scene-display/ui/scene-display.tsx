'use client';

/** Fond et « Affichage » de la scène (MJ), dans la barre d'outils. */
import { translate } from '@/i18n/runtime';
import { ImageIcon } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { DISPLAY_TOGGLES, displayOf, isDisplayed } from '@/lib/map/engine/planes';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useMapState } from '@/components/map/engine-context';
import { ToolbarButton } from '@/components/map/toolbar/kit';
import { BackgroundPicker } from '@/components/map/scenes/background-picker';

/** Fond de la scène affichée : bibliothèque ou import, une commande annulable. */
export function BackgroundButton({ engine }: Readonly<{ engine: MapEngine }>) {
  const [open, setOpen] = useState(false);
  const scene = useMapState((s) => s.scene);
  const campaignId = useMapState((s) => s.campaignId);
  if (!scene || !campaignId) return null;
  return (
    <>
      <ToolbarButton
        label={translate('map.display.background')}
        active={open}
        onClick={() => setOpen(true)}
      >
        <ImageIcon />
      </ToolbarButton>
      <BackgroundPicker
        open={open}
        onOpenChange={setOpen}
        campaignId={campaignId}
        current={(scene.backgroundUrl as string | null | undefined) ?? null}
        onPick={(url) =>
          void engine.updateScene(translate('map.display.changeBackground'), { backgroundUrl: url })
        }
      />
    </>
  );
}

/** « Affichage » : familles entières affichées ou masquées pour toute la table. */
export function DisplayMenu({ engine }: Readonly<{ engine: MapEngine }>) {
  const scene = useMapState((s) => s.scene);
  const display = displayOf(scene);
  return (
    <>
      <p className="mb-1 text-sm font-semibold">{translate('map.display.display')}</p>
      <p className="mb-3 text-xs text-muted-foreground">{translate('map.display.displayLead')}</p>
      <ul className="space-y-2">
        {DISPLAY_TOGGLES.map((key) => {
          const shown = isDisplayed(display, key);
          return (
            <li key={key} className="flex items-center justify-between gap-3">
              <label htmlFor={`display-${key}`} className="text-[13px]">
                {translate(`map.display.families.${key}`)}
              </label>
              <Switch
                id={`display-${key}`}
                checked={shown}
                onCheckedChange={(on) =>
                  void engine.updateScene(translate('map.display.display'), {
                    display: { ...display, [key]: on },
                  })
                }
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
