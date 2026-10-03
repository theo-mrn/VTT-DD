'use client';

/**
 * Destination d'un portail vers une autre scène (MJ) : la liste des scènes de la campagne (sauf
 * celle-ci), puis l'arrivée, son point d'arrivée des joueurs par défaut ou un point choisi d'un
 * clic sur l'aperçu de son fond (coordonnées du monde = pixels du fond, comme la carte).
 */
import type { MapScene } from '@vtt/contracts';
import { EyeOff, Film, Flag, MapPin, Search } from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';
import { Segmented } from '@/components/audio/parts';
import { Illustration } from '@/components/commun/illustration';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { Point } from '@/lib/map/engine/geometry';
import { DEFAULT_WORLD } from '@/lib/map/engine/map-engine';
import { roundPoint } from '@/lib/map/modules/portals/model';
import { cn } from '@/lib/utils';
import { isVideoBackground } from '../scenes/use-scenes';

export interface SceneTarget {
  mapId: string | null;
  /** Point choisi ; null : le point d'arrivée des joueurs de la scène (sinon son centre). */
  target: Point | null;
}

export function SceneDestination({
  scenes,
  currentMapId,
  value,
  onChange,
}: Readonly<{
  scenes: readonly MapScene[];
  currentMapId: string;
  value: SceneTarget;
  onChange(v: SceneTarget): void;
}>) {
  const [query, setQuery] = useState('');
  const others = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('fr');
    return scenes
      .filter((s) => s.id !== currentMapId)
      .filter((s) => !q || s.name.toLocaleLowerCase('fr').includes(q));
  }, [scenes, currentMapId, query]);
  const chosen = scenes.find((s) => s.id === value.mapId) ?? null;

  return (
    <div className="space-y-3">
      {scenes.length > 6 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Chercher une scène"
            aria-label="Chercher une scène"
            className="pl-8"
          />
        </div>
      )}
      {others.length ? (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="Scènes">
          {others.map((s) => {
            const on = s.id === value.mapId;
            const video = isVideoBackground(s.backgroundUrl);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChange({ mapId: s.id, target: null })}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-1.5 pr-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    on
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-transparent hover:border-border hover:bg-surface-2',
                  )}
                >
                  <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-border">
                    {video ? (
                      <span className="grid size-full place-items-center bg-surface-3 text-muted-foreground">
                        <Film className="size-4" aria-hidden />
                      </span>
                    ) : (
                      <Illustration
                        src={s.backgroundUrl}
                        graine={s.name}
                        initiale={false}
                        className="size-full"
                      />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        'block truncate text-sm font-medium',
                        on && 'text-primary-strong',
                      )}
                    >
                      {s.name}
                    </span>
                    {!s.visibleToPlayers && (
                      <Badge className="mt-1">
                        <EyeOff />
                        Cachée
                      </Badge>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          {query ? 'Aucune scène à ce nom.' : 'Aucune autre scène : créez-en une dans Scènes (E).'}
        </p>
      )}

      {chosen && (
        <div className="space-y-2">
          <Segmented
            label="Arrivée"
            value={value.target ? 'point' : 'spawn'}
            onChange={(v) =>
              onChange({
                mapId: chosen.id,
                target:
                  v === 'point'
                    ? (value.target ??
                      chosen.spawn ?? {
                        x: (chosen.width ?? DEFAULT_WORLD) / 2,
                        y: (chosen.height ?? DEFAULT_WORLD) / 2,
                      })
                    : null,
              })
            }
            options={[
              { value: 'spawn', label: 'Arrivée des joueurs', icon: Flag },
              { value: 'point', label: 'Point choisi', icon: MapPin },
            ]}
          />
          {value.target ? (
            <ScenePointPicker
              scene={chosen}
              point={value.target}
              onPick={(p) => onChange({ mapId: chosen.id, target: p })}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {chosen.spawn
                ? 'Les voyageurs arrivent au point d’arrivée de la scène.'
                : 'La scène n’a pas de point d’arrivée : les voyageurs arrivent en son centre.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** Aperçu du fond d'une scène : un clic y choisit le point d'arrivée. */
function ScenePointPicker({
  scene,
  point,
  onPick,
}: Readonly<{
  scene: MapScene;
  point: Point;
  onPick(p: Point): void;
}>) {
  const width = scene.width ?? DEFAULT_WORLD;
  const height = scene.height ?? DEFAULT_WORLD;
  const video = isVideoBackground(scene.backgroundUrl);
  const pct = (p: Point) => ({ left: `${(p.x / width) * 100}%`, top: `${(p.y / height) * 100}%` });
  const pick = (e: MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (!r.width || !r.height) return;
    onPick(
      roundPoint({
        x: Math.min(width, Math.max(0, ((e.clientX - r.left) / r.width) * width)),
        y: Math.min(height, Math.max(0, ((e.clientY - r.top) / r.height) * height)),
      }),
    );
  };
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={pick}
        aria-label={`Choisir l’arrivée sur « ${scene.name} »`}
        className="relative block w-full cursor-crosshair overflow-hidden rounded-xl border border-border bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        style={{ aspectRatio: `${width} / ${height}`, maxHeight: '14rem' }}
      >
        {scene.backgroundUrl &&
          (video ? (
            <video
              src={scene.backgroundUrl}
              muted
              playsInline
              preload="metadata"
              className="pointer-events-none size-full object-fill"
            />
          ) : (
            <img
              src={scene.backgroundUrl}
              alt=""
              draggable={false}
              className="pointer-events-none size-full object-fill"
            />
          ))}
        {scene.spawn && (
          <span
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full text-primary drop-shadow"
            style={pct(scene.spawn)}
            aria-hidden
          >
            <Flag className="size-4" />
          </span>
        )}
        <span
          className="pointer-events-none absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-elevated"
          style={pct(point)}
          aria-hidden
        >
          <MapPin className="size-3" />
        </span>
      </button>
      <p className="text-[11px] text-muted-foreground">
        Cliquez l’aperçu pour placer l’arrivée ; le drapeau marque l’arrivée des joueurs.
      </p>
    </div>
  );
}
