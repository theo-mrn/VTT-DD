'use client';

/** Fond et « Affichage » de la scène (MJ), dans la barre d'outils. */
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
      <ToolbarButton label="Fond de la scène" active={open} onClick={() => setOpen(true)}>
        <ImageIcon />
      </ToolbarButton>
      <BackgroundPicker
        open={open}
        onOpenChange={setOpen}
        campaignId={campaignId}
        current={(scene.backgroundUrl as string | null | undefined) ?? null}
        onPick={(url) => void engine.updateScene('Changer le fond', { backgroundUrl: url })}
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
      <p className="mb-1 text-sm font-semibold">Affichage</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Familles montrées à toute la table. Les calques se gèrent à part (K).
      </p>
      <ul className="space-y-2">
        {DISPLAY_TOGGLES.map((t) => {
          const shown = isDisplayed(display, t.key);
          return (
            <li key={t.key} className="flex items-center justify-between gap-3">
              <label htmlFor={`display-${t.key}`} className="text-[13px]">
                {t.label}
              </label>
              <Switch
                id={`display-${t.key}`}
                checked={shown}
                onCheckedChange={(on) =>
                  void engine.updateScene('Affichage', { display: { ...display, [t.key]: on } })
                }
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}
