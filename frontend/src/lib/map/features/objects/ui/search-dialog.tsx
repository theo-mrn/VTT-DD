'use client';

/**
 * Fenêtre de fouille d'un joueur (docs/carte.md § 10) : le contenu rendu par `…/search`, le
 * personnage qui fouille (celui qu'il incarne par défaut, un autre à portée au choix), et
 * « Prendre » (une partie ou tout) qui range l'objet dans l'inventaire du personnage.
 */
import type { MapObjectItem } from '@vtt/contracts';
import { AlertTriangle, Minus, Package, PackageOpen, Plus, RefreshCw } from 'lucide-react';
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
import { SelectField } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { reachOf } from '../engine/object-kind';
import type { SearchController } from '../engine/search';
import { OBJECTS_COLLECTION, type ObjectData } from '../engine/types';
import { useMapState } from '@/components/map/engine-context';
import { useCatalogueEntries } from './catalogue-picker';

export function SearchDialog({
  engine,
  controller,
}: Readonly<{
  engine: MapEngine;
  controller: SearchController;
}>) {
  const s = useStore(controller.state);
  const object = useMapState((st) =>
    s.objectId
      ? (st.collections[OBJECTS_COLLECTION]?.get(s.objectId) as ObjectData | undefined)
      : undefined,
  );
  const tokens = useMapState((st) => st.collections.tokens);
  const reach = useMemo(
    () => (object ? reachOf(engine, object) : []),
    // La portée suit les tokens
    [engine, object, tokens],
  );
  const inRange = reach.filter((r) => r.inRange);
  const name = s.result?.name || object?.name || 'l’objet';
  const stale = !!s.result && !!object && object.version > s.result.version;
  const gone = s.objectId !== null && !object;

  return (
    <Dialog
      open={s.objectId !== null}
      onOpenChange={(open) => {
        if (!open) controller.close();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onCloseAutoFocus={(e) => {
          // Le focus revient à la carte (ses raccourcis restent actifs)
          e.preventDefault();
          engine.canvas?.parentElement?.focus({ preventScroll: true });
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageOpen className="size-5 text-primary" aria-hidden />
            Fouiller « {name} »
          </DialogTitle>
          <DialogDescription>
            Ce que vous prenez rejoint l’inventaire de{' '}
            <span className="font-medium text-foreground">
              {controller.characterName(s.characterId)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        {inRange.length > 1 && s.characterId && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Personnage</p>
            <SelectField
              aria-label="Personnage qui fouille"
              value={s.characterId}
              onValueChange={(id) => controller.setCharacter(id)}
              options={inRange.map((r) => ({
                valeur: r.characterId,
                nom: controller.characterName(r.characterId),
              }))}
            />
          </div>
        )}

        {s.error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="flex-1">{s.error}</span>
            {s.status === 'error' && (
              <Button variant="secondary" size="xs" onClick={() => void controller.search()}>
                Réessayer
              </Button>
            )}
          </div>
        )}

        {gone && (
          <p className="text-[13px] text-muted-foreground">
            L’objet n’est plus visible : le contenu affiché peut être périmé.
          </p>
        )}
        {stale && !gone && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px] text-muted-foreground">
            Le contenu a changé depuis votre fouille.
            <Button variant="secondary" size="xs" onClick={() => void controller.search()}>
              <RefreshCw />
              Actualiser
            </Button>
          </div>
        )}

        {s.status === 'loading' && !s.result && (
          <div className="space-y-2" aria-label="Fouille en cours">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}
        {s.result && s.result.items.length > 0 && (
          <ul className="max-h-[55dvh] space-y-2 overflow-y-auto overscroll-contain pr-1">
            {s.result.items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                busy={s.taking === item.id}
                disabled={s.taking !== null || gone}
                onTake={(q) => void controller.take(item.id, q)}
              />
            ))}
          </ul>
        )}
        {s.result?.items.length === 0 && (
          <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-[13px] text-muted-foreground">
            Il n’y a rien (ou plus rien) à prendre.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemRow({
  item,
  busy,
  disabled,
  onTake,
}: Readonly<{
  item: MapObjectItem;
  busy: boolean;
  disabled: boolean;
  onTake(quantity: number): void;
}>) {
  const entries = useCatalogueEntries();
  const [quantity, setQuantity] = useState(1);
  const q = Math.min(quantity, item.quantity);
  const description = item.description ?? (item.ref ? entries?.get(item.ref)?.description : null);

  return (
    <li className="flex items-start gap-3 rounded-xl border border-border bg-surface-2/40 p-2.5">
      <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="size-full object-contain" />
        ) : (
          <Package className="size-5 text-subtle" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="text-sm font-medium text-foreground">
          {item.name}
          {item.quantity > 1 && (
            <span className="ml-1.5 text-xs font-normal tabular-nums text-muted-foreground">
              × {item.quantity}
            </span>
          )}
        </p>
        {description && (
          <p className="line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
            {description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {item.quantity > 1 && (
            <span className="flex items-center gap-0.5 rounded-lg border border-border px-0.5">
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Un de moins"
                disabled={q <= 1 || disabled}
                onClick={() => setQuantity(q - 1)}
              >
                <Minus />
              </Button>
              <span className="w-7 text-center text-xs tabular-nums" aria-live="polite">
                {q}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Un de plus"
                disabled={q >= item.quantity || disabled}
                onClick={() => setQuantity(q + 1)}
              >
                <Plus />
              </Button>
            </span>
          )}
          <Button size="xs" loading={busy} disabled={disabled} onClick={() => onTake(q)}>
            {item.quantity > 1 ? `Prendre ${q}` : 'Prendre'}
          </Button>
          {item.quantity > 1 && q < item.quantity && (
            <Button
              variant="ghost"
              size="xs"
              disabled={disabled}
              onClick={() => onTake(item.quantity)}
            >
              Tout prendre
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}
