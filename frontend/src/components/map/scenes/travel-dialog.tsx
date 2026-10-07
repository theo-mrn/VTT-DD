'use client';

/**
 * Faire venir des personnages sur une scène (MJ, ex-« déplacer tout le groupe ») : tout le
 * groupe (la scène devient celle du groupe) ou une sélection de personnages. Ils arrivent au
 * point d'apparition de la scène (sinon à leur dernière position connue).
 */
import { translate } from '@/i18n/runtime';
import type { MapScene } from '@vtt/contracts';
import { Check, Navigation, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Segmented } from '@/components/audio/parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ScenesActions } from './use-scenes';

export function TravelDialog({
  scene,
  characters,
  actions,
  onClose,
}: Readonly<{
  scene: MapScene | null;
  /** Personnages des joueurs. */
  characters: readonly { id: string; name: string }[];
  actions: ScenesActions;
  onClose(): void;
}>) {
  const [mode, setMode] = useState<'all' | 'some'>('all');
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (!scene) return;
    setMode('all');
    setPicked(new Set());
  }, [scene]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const go = async () => {
    if (!scene) return;
    try {
      await actions.travel.mutateAsync({
        mapId: scene.id,
        body: mode === 'all' ? {} : { characterIds: [...picked] },
      });
      onClose();
    } catch {
      // Toast déjà affiché
    }
  };

  return (
    <Dialog open={!!scene} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{translate('map.scenes.bringTo', { name: scene?.name ?? '' })}</DialogTitle>
          <DialogDescription>
            {scene?.spawn ? translate('map.scenes.arriveAtSpawn') : translate('map.scenes.noSpawn')}
          </DialogDescription>
        </DialogHeader>

        <Segmented
          label={translate('map.scenes.who')}
          value={mode}
          onChange={(v) => setMode(v as 'all' | 'some')}
          options={[
            { value: 'all', label: translate('map.scenes.wholeParty'), icon: Users },
            { value: 'some', label: translate('map.scenes.selection'), icon: Check },
          ]}
        />

        {mode === 'all' && (
          <p className="rounded-xl border border-border bg-surface-2/50 p-4 text-sm text-muted-foreground">
            {translate('map.scenes.wholePartyHint')}
          </p>
        )}
        {mode !== 'all' && characters.length > 0 && (
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            {characters.map((c) => {
              const on = picked.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-sm transition-colors',
                      on
                        ? 'border-primary/50 bg-primary/10 text-primary-strong'
                        : 'border-transparent hover:border-border hover:bg-surface-2',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 place-items-center rounded-md border',
                        on
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border-strong',
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3.5" />}
                    </span>
                    {c.name}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {mode !== 'all' && characters.length === 0 && (
          <p className="text-sm text-muted-foreground">{translate('map.scenes.noEngaged')}</p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {translate('common.actions.cancel')}
          </Button>
          <Button
            onClick={() => void go()}
            loading={actions.travel.isPending}
            disabled={mode === 'some' && !picked.size}
          >
            <Navigation />
            Faire venir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
