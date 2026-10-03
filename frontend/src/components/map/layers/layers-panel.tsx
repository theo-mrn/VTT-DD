'use client';

/**
 * Panneau « Calques » du MJ (docs/carte.md § 5, Calques ; touche K). La pile du haut vers le
 * bas, comme un logiciel de dessin :
 * - glisser pour réordonner (ou Monter / Descendre), double clic pour renommer, nombre
 *   d'éléments ;
 * - calque actif : ce qui est posé y va ;
 * - « Masqué aux joueurs » (enregistré : son contenu ne leur est jamais envoyé), cadenas,
 *   opacité ;
 * - œil local et « Isoler » (sur mon écran seulement) ;
 * - « Sélectionner le contenu », supprimer (le contenu descend, après confirmation).
 * Tout ce qui est enregistré passe par des commandes annulables.
 */
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Layers,
  Lock,
  LockOpen,
  Ellipsis,
  Pencil,
  Plus,
  ScanEye,
  SquareDashedMousePointer,
  Trash2,
  UserRoundX,
} from 'lucide-react';
import { useMemo, useState, type DragEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { EditableValue } from '@/components/ui/editable-value';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import {
  createLayer,
  deleteLayer,
  renameLayer,
  reorderLayers,
  selectLayerContent,
  updateLayer,
} from '@/lib/map/engine/layer-operations';
import { sortLayers, type LayerLike } from '@/lib/map/engine/layers';
import { STACKED_COLLECTIONS } from '@/lib/map/store/collections';
import { cn } from '@/lib/utils';
import { useMapEngine, useMapState, useMapUi } from '../engine-context';
import { MapPanel } from '../map-panel';

export function LayersPanel() {
  const engine = useMapEngine();
  const open = useMapUi((s) => s.layersPanel);
  const activeId = useMapUi((s) => s.activeLayerId);
  const hidden = useMapUi((s) => s.hiddenLayers);
  const isolated = useMapUi((s) => s.isolatedLayer);
  const collections = useMapState((s) => s.collections);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const layersMap = collections.layers;
  const layers = useMemo(
    () => sortLayers([...(layersMap?.values() ?? [])] as unknown as LayerLike[]).reverse(),
    [layersMap],
  );
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const key of STACKED_COLLECTIONS)
      for (const item of collections[key]?.values() ?? []) {
        const id = item.layerId;
        if (typeof id === 'string') out.set(id, (out.get(id) ?? 0) + 1);
      }
    return out;
  }, [collections]);

  if (!open || engine.viewer.role !== 'gm') return null;

  const topDown = layers.map((l) => l.id);
  const move = (id: string, to: number) => {
    const order = topDown.filter((x) => x !== id);
    order.splice(Math.max(0, Math.min(order.length, to)), 0, id);
    if (order.join() !== topDown.join()) void reorderLayers(engine, id, order);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragging && over !== null) {
      const from = topDown.indexOf(dragging);
      move(dragging, over > from ? over - 1 : over);
    }
    setDragging(null);
    setOver(null);
  };

  return (
    <MapPanel
      id="layers"
      label="Calques"
      icon={Layers}
      title="Calques"
      shortcut="K"
      closeLabel="Fermer les calques"
      onClose={() => engine.toggleLayersPanel(false)}
      className="w-72"
    >
      {layers.length ? (
        <ol
          aria-label="Pile des calques, du haut vers le bas"
          className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain p-2"
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
        >
          {layers.map((layer, index) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              index={index}
              total={layers.length}
              count={counts.get(layer.id) ?? 0}
              active={layer.id === activeId}
              hiddenLocally={hidden.has(layer.id)}
              isolated={isolated === layer.id}
              dimmed={!!isolated && isolated !== layer.id}
              dropBefore={dragging !== null && over === index}
              dropAfter={dragging !== null && over === layers.length && index === layers.length - 1}
              renaming={renaming === layer.id}
              onRename={(v) => setRenaming(v ? layer.id : null)}
              onMove={(to) => move(layer.id, to)}
              onDragStart={() => setDragging(layer.id)}
              onDragOverRow={(after) => setOver(after ? index + 1 : index)}
              onDragEnd={() => {
                setDragging(null);
                setOver(null);
              }}
            />
          ))}
        </ol>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          Cette carte n’a pas encore de calques.
        </p>
      )}

      <footer className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start"
          onClick={() => void createLayer(engine, `Calque ${layers.length + 1}`)}
        >
          <Plus />
          Nouveau calque
        </Button>
      </footer>
    </MapPanel>
  );
}

/** Cacher ou montrer le calque sur mon écran seulement. */
function LocalVisibilityButton({
  layer,
  hiddenLocally,
}: Readonly<{ layer: LayerLike; hiddenLocally: boolean }>) {
  const engine = useMapEngine();
  return (
    <Info texte={hiddenLocally ? 'Montrer sur mon écran' : 'Cacher sur mon écran'}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={
          hiddenLocally
            ? `Montrer ${layer.name} sur mon écran`
            : `Cacher ${layer.name} sur mon écran`
        }
        aria-pressed={hiddenLocally}
        onClick={() => engine.setLayerHiddenLocally(layer.id, !hiddenLocally)}
      >
        {hiddenLocally ? <EyeOff /> : <Eye />}
      </Button>
    </Info>
  );
}

/** Verrouiller le calque : on clique à travers ses éléments. */
function LockButton({ layer }: Readonly<{ layer: LayerLike }>) {
  const engine = useMapEngine();
  return (
    <Info texte={layer.locked ? 'Déverrouiller' : 'Verrouiller : on clique à travers'}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={layer.locked ? `Déverrouiller ${layer.name}` : `Verrouiller ${layer.name}`}
        aria-pressed={layer.locked}
        onClick={() =>
          void updateLayer(
            engine,
            layer.id,
            { locked: !layer.locked },
            layer.locked ? 'Déverrouiller le calque' : 'Verrouiller le calque',
          )
        }
        className={cn(layer.locked && 'text-primary')}
      >
        {layer.locked ? <Lock /> : <LockOpen />}
      </Button>
    </Info>
  );
}

function LayerRow({
  layer,
  index,
  total,
  count,
  active,
  hiddenLocally,
  isolated,
  dimmed,
  dropBefore,
  dropAfter,
  renaming,
  onRename,
  onMove,
  onDragStart,
  onDragOverRow,
  onDragEnd,
}: Readonly<{
  layer: LayerLike;
  index: number;
  total: number;
  count: number;
  active: boolean;
  hiddenLocally: boolean;
  isolated: boolean;
  dimmed: boolean;
  dropBefore: boolean;
  dropAfter: boolean;
  renaming: boolean;
  onRename(on: boolean): void;
  onMove(to: number): void;
  onDragStart(): void;
  onDragOverRow(after: boolean): void;
  onDragEnd(): void;
}>) {
  const engine = useMapEngine();
  const [opacity, setOpacity] = useState<number | null>(null);

  const commitName = (value: string) => {
    onRename(false);
    if (value.trim() && value.trim() !== layer.name) void renameLayer(engine, layer.id, value);
  };
  const onNameKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commitName(e.currentTarget.value);
    if (e.key === 'Escape') {
      e.stopPropagation();
      onRename(false);
    }
  };

  return (
    <li
      draggable={!renaming}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', layer.id);
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        const box = e.currentTarget.getBoundingClientRect();
        onDragOverRow(e.clientY > box.top + box.height / 2);
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group relative flex items-center gap-1.5 rounded-xl border px-1.5 py-1.5 transition-colors',
        active
          ? 'border-primary/50 bg-primary/10'
          : 'border-transparent hover:border-border hover:bg-surface-2',
        dimmed && 'opacity-60',
        dropBefore &&
          'before:absolute before:inset-x-2 before:-top-1 before:h-0.5 before:rounded-full before:bg-primary',
        dropAfter &&
          'after:absolute after:inset-x-2 after:-bottom-1 after:h-0.5 after:rounded-full after:bg-primary',
      )}
    >
      <GripVertical
        className="size-4 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100"
        aria-hidden
      />

      {renaming ? (
        <Input
          autoFocus
          defaultValue={layer.name}
          aria-label="Nom du calque"
          className="h-8 flex-1 px-2"
          onBlur={(e) => commitName(e.currentTarget.value)}
          onKeyDown={onNameKey}
        />
      ) : (
        <button
          type="button"
          aria-pressed={active}
          title="Calque actif : ce qui est posé y va. Double clic : renommer."
          onClick={() => engine.setActiveLayer(active ? null : layer.id)}
          onDoubleClick={() => onRename(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px] font-medium',
              active && 'text-primary-strong',
              hiddenLocally && 'text-muted-foreground line-through',
            )}
          >
            {layer.name}
          </span>
          {!layer.visibleToPlayers && (
            <UserRoundX
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-label="Masqué aux joueurs"
            />
          )}
          <span className="shrink-0 rounded-md bg-surface-3 px-1.5 text-[11px] tabular-nums text-muted-foreground">
            {count}
          </span>
        </button>
      )}

      <LocalVisibilityButton layer={layer} hiddenLocally={hiddenLocally} />
      <LockButton layer={layer} />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Options de ${layer.name}`}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{layer.name}</DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={!layer.visibleToPlayers}
            onSelect={() =>
              void updateLayer(
                engine,
                layer.id,
                { visibleToPlayers: !layer.visibleToPlayers },
                layer.visibleToPlayers
                  ? 'Masquer le calque aux joueurs'
                  : 'Montrer le calque aux joueurs',
              )
            }
          >
            Masqué aux joueurs
          </DropdownMenuCheckboxItem>
          <div className="px-2.5 py-2" onKeyDown={(e) => e.stopPropagation()}>
            <p className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              Opacité
              <EditableValue
                label={`Opacité de ${layer.name}`}
                value={opacity ?? layer.opacity}
                format={(v) => `${Math.round(v * 100)} %`}
                min={0}
                max={1}
                scale={100}
                onCommit={(v) =>
                  void updateLayer(engine, layer.id, { opacity: v }, 'Opacité du calque')
                }
                className="tabular-nums"
              />
            </p>
            <Slider
              aria-label={`Opacité de ${layer.name}`}
              min={0}
              max={100}
              step={5}
              value={[Math.round((opacity ?? layer.opacity) * 100)]}
              onValueChange={([v]) => setOpacity((v ?? 100) / 100)}
              onValueCommit={([v]) => {
                setOpacity(null);
                void updateLayer(
                  engine,
                  layer.id,
                  { opacity: (v ?? 100) / 100 },
                  'Opacité du calque',
                );
              }}
            />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => engine.setIsolatedLayer(isolated ? null : layer.id)}>
            {isolated ? <Check /> : <ScanEye />}
            {isolated ? 'Ne plus isoler' : 'Isoler (estomper les autres)'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => selectLayerContent(engine, layer.id)} disabled={!count}>
            <SquareDashedMousePointer />
            Sélectionner le contenu
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onRename(true)}>
            <Pencil />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(index - 1)} disabled={index === 0}>
            <ArrowUp />
            Monter
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onMove(index + 1)} disabled={index === total - 1}>
            <ArrowDown />
            Descendre
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void deleteLayer(engine, layer.id)}
            disabled={total <= 1}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive"
          >
            <Trash2 />
            Supprimer le calque
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
