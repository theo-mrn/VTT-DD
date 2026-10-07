'use client';

/**
 * Choix entre éléments superposés (docs/carte.md § 6) : un clic tombe sur plusieurs éléments
 * presque confondus, ce menu demande lequel prendre. Survoler une ligne surligne l'élément sur
 * la carte ; le choisir le sélectionne, et les autres s'estompent et ne se touchent plus tant
 * qu'il reste sélectionné (`engine.chooseAmong`).
 */
import { translate } from '@/i18n/runtime';
import { Layers2 } from 'lucide-react';
import { useMemo, type RefObject } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MapEntity } from '@/lib/map/engine/entities/entity';
import { useMapEngine, useMapUi } from './engine-context';

export function EntityPicker({ hostRef }: Readonly<{ hostRef: RefObject<HTMLElement | null> }>) {
  const engine = useMapEngine();
  const picker = useMapUi((s) => s.picker);
  const entities = useMemo(
    () =>
      (picker?.ids ?? []).flatMap((id) => {
        const e = engine.entity(id);
        return e ? [e] : [];
      }),
    [engine, picker],
  );
  if (!picker || entities.length < 2) return null;

  const close = () => {
    engine.closePicker();
    engine.setHovered(null);
  };

  return (
    <DropdownMenu
      // Un nouveau choix ailleurs : un nouveau menu, bien placé
      key={`${picker.screen.x}:${picker.screen.y}`}
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none absolute size-px"
          style={{ left: picker.screen.x, top: picker.screen.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={12}
        className="w-64"
        onCloseAutoFocus={(e) => {
          // Le focus revient à la carte (ses raccourcis restent actifs)
          e.preventDefault();
          hostRef.current?.focus({ preventScroll: true });
        }}
      >
        <DropdownMenuLabel className="flex items-center gap-2">
          <Layers2 className="size-4 text-muted-foreground" aria-hidden />
          Lequel voulez-vous prendre ?
        </DropdownMenuLabel>
        <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">
          {translate('map.ui.othersFade')}
        </p>
        {entities.map((e) => (
          <PickerItem
            key={e.id}
            entity={e}
            onHover={() => engine.setHovered(e.id)}
            onChoose={() => {
              engine.setHovered(null);
              engine.chooseAmong(e.id, picker.ids);
            }}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PickerItem({
  entity,
  onHover,
  onChoose,
}: Readonly<{
  entity: MapEntity;
  onHover: () => void;
  onChoose: () => void;
}>) {
  const engine = useMapEngine();
  const name = entity.kind.name?.(entity.data, engine.kindContext()) ?? entity.kind.label;
  const thumbnail = entity.kind.thumbnail?.(entity.data) ?? null;
  return (
    <DropdownMenuItem
      onSelect={onChoose}
      onPointerEnter={onHover}
      onFocus={onHover}
      className="gap-2.5 py-1.5"
    >
      <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-border">
        {thumbnail ? (
          <img src={thumbnail} alt="" draggable={false} className="size-full object-contain" />
        ) : (
          <span className="text-xs font-semibold text-muted-foreground" aria-hidden>
            {name.charAt(0).toUpperCase()}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {entity.kind.label}
          {entity.state.locked ? ` · ${translate('map.ui.locked')}` : ''}
        </span>
      </span>
    </DropdownMenuItem>
  );
}
