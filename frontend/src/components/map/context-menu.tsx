'use client';

/**
 * Menu contextuel commun de la carte (docs/carte.md § 6) : clic droit ou appui long. Menu Radix
 * ancré au point de l'écran ; ses entrées viennent du moteur (actions communes générées par les
 * capacités, actions de la sorte, entrées des modules, menu du vide).
 */
import { useMemo, type RefObject } from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MenuItem } from '@/lib/map/engine/entities/entity-kind';
import { cn } from '@/lib/utils';
import { useMapEngine, useMapUi } from './engine-context';

function Items({ items }: { items: readonly MenuItem[] }) {
  return (
    <>
      {items.map((item) => {
        if (item.id.startsWith('sep:')) return <DropdownMenuSeparator key={item.id} />;
        const Icon = item.icon;
        if (item.children?.length)
          return (
            <DropdownMenuSub key={item.id}>
              <DropdownMenuSubTrigger disabled={item.disabled} className="text-[13px]">
                {Icon && <Icon />}
                {item.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 w-56 overflow-y-auto">
                <Items items={item.children} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        if (item.checked !== undefined)
          return (
            <DropdownMenuCheckboxItem
              key={item.id}
              checked={item.checked}
              disabled={item.disabled}
              onSelect={() => item.run?.()}
            >
              {item.label}
              {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
            </DropdownMenuCheckboxItem>
          );
        return (
          <DropdownMenuItem
            key={item.id}
            disabled={item.disabled}
            onSelect={() => item.run?.()}
            className={cn(
              item.danger &&
                'text-destructive focus:bg-destructive/10 focus:text-destructive [&>svg]:text-destructive',
            )}
          >
            {Icon && <Icon />}
            {item.label}
            {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function MapContextMenu({ hostRef }: { hostRef: RefObject<HTMLElement | null> }) {
  const engine = useMapEngine();
  const menu = useMapUi((s) => s.menu);
  const items = useMemo(() => (menu ? engine.menuItems(menu.ids, menu.world) : []), [engine, menu]);
  if (!menu) return null;

  return (
    <DropdownMenu
      // Un nouveau clic droit ailleurs : un nouveau menu, bien placé
      key={`${menu.screen.x}:${menu.screen.y}`}
      open
      onOpenChange={(open) => {
        if (!open) engine.closeMenu();
      }}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          className="pointer-events-none absolute size-px"
          style={{ left: menu.screen.x, top: menu.screen.y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        collisionPadding={12}
        className="w-60"
        onCloseAutoFocus={(e) => {
          // Le focus revient à la carte (ses raccourcis restent actifs)
          e.preventDefault();
          hostRef.current?.focus({ preventScroll: true });
        }}
      >
        {items.length ? (
          <Items items={items} />
        ) : (
          <DropdownMenuLabel>Aucune action ici</DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
