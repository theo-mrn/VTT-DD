'use client';

/**
 * Contenu d'un objet à fouiller (MJ ; docs/carte.md § 10) : la liste, la quantité de chaque
 * contenu, le retrait, l'ajout depuis le marché du système (référence `ref`) ou d'un objet
 * libre (nom, quantité, description). Chaque changement est une commande annulable.
 */
import type { MapObjectItem } from '@vtt/contracts';
import { Minus, PenLine, Plus, Store, Trash2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { Info } from '@/components/ui/tooltip';
import {
  addCatalogueItem,
  addFreeItem,
  freeItemError,
  ITEM_DESCRIPTION_MAX,
  ITEM_NAME_MAX,
  ITEMS_MAX,
  removeItem,
  setItemQuantity,
  totalUnits,
} from '../engine/contents';
import { CataloguePicker, useCatalogueEntries } from './catalogue-picker';
import { FieldLabel } from './fields';

export function ContentsEditor({
  items,
  onChange,
}: Readonly<{
  items: readonly MapObjectItem[];
  /** Nouvelle liste et libellé de la commande (« Ajouter un contenu »…). */
  onChange(items: MapObjectItem[], label: string): void;
}>) {
  const entries = useCatalogueEntries();
  const [freeOpen, setFreeOpen] = useState(false);
  const full = items.length >= ITEMS_MAX;
  const units = totalUnits(items);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel>Contenu</FieldLabel>
        {items.length > 0 && (
          <span className="text-[11px] text-subtle">
            {items.length} contenu{items.length > 1 ? 's' : ''} · {units} objet
            {units > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {items.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => {
            const description =
              item.description ?? (item.ref && entries?.get(item.ref)?.description);
            return (
              <li key={item.id} className="flex items-center gap-2 px-2 py-1.5">
                <Info texte={item.ref ? 'Objet du marché' : 'Objet libre'}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-surface-2 text-subtle">
                    {item.ref ? (
                      <Store className="size-3.5" aria-label="Objet du marché" />
                    ) : (
                      <PenLine className="size-3.5" aria-label="Objet libre" />
                    )}
                  </span>
                </Info>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-foreground">{item.name}</span>
                  {description && (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {description}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Un ${item.name} de moins`}
                    disabled={item.quantity <= 1}
                    onClick={() =>
                      onChange(setItemQuantity(items, item.id, item.quantity - 1), 'Quantité')
                    }
                  >
                    <Minus />
                  </Button>
                  <span
                    className="w-7 text-center text-[13px] tabular-nums"
                    aria-label={`Quantité : ${item.quantity}`}
                  >
                    {item.quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Un ${item.name} de plus`}
                    onClick={() =>
                      onChange(setItemQuantity(items, item.id, item.quantity + 1), 'Quantité')
                    }
                  >
                    <Plus />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Retirer ${item.name}`}
                    className="hover:text-destructive"
                    onClick={() => onChange(removeItem(items, item.id), 'Retirer un contenu')}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-3 text-center text-xs text-muted-foreground">
          Vide : ajoutez des objets du marché ou des objets libres.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="xs" disabled={full}>
              <Store />
              Depuis le marché
            </Button>
          </PopoverTrigger>
          <PopoverContent side="left" align="start" className="w-80 p-2">
            <CataloguePicker
              onPick={(entry) => onChange(addCatalogueItem(items, entry), 'Ajouter un contenu')}
            />
          </PopoverContent>
        </Popover>
        <Button
          variant="ghost"
          size="xs"
          disabled={full}
          aria-expanded={freeOpen}
          onClick={() => setFreeOpen((v) => !v)}
        >
          <PenLine />
          Objet libre
        </Button>
      </div>
      {full && (
        <p className="text-xs text-muted-foreground">{ITEMS_MAX} contenus au plus par objet.</p>
      )}
      {freeOpen && (
        <FreeItemForm
          onCancel={() => setFreeOpen(false)}
          onAdd={(input) => {
            onChange(addFreeItem(items, input), 'Ajouter un contenu');
            setFreeOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FreeItemForm({
  onAdd,
  onCancel,
}: Readonly<{
  onAdd(input: { name: string; quantity: number; description: string }): void;
  onCancel(): void;
}>) {
  const id = useId();
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [description, setDescription] = useState('');
  const [tried, setTried] = useState(false);
  const input = { name, quantity: Number(quantity), description };
  const error = freeItemError(input);

  return (
    <form
      className="space-y-2 rounded-lg border border-border bg-surface-2/40 p-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!error) onAdd(input);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="grid grid-cols-[1fr_4.5rem] gap-2">
        <div className="space-y-1">
          <FieldLabel htmlFor={`${id}-name`}>Nom</FieldLabel>
          <Input
            id={`${id}-name`}
            autoFocus
            value={name}
            maxLength={ITEM_NAME_MAX}
            placeholder="Clé rouillée"
            aria-invalid={tried && !!error}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="space-y-1">
          <FieldLabel htmlFor={`${id}-qty`}>Quantité</FieldLabel>
          <Input
            id={`${id}-qty`}
            type="number"
            min={1}
            max={1_000_000}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="h-8 tabular-nums"
          />
        </div>
      </div>
      <div className="space-y-1">
        <FieldLabel htmlFor={`${id}-desc`}>Description (facultatif)</FieldLabel>
        <Textarea
          id={`${id}-desc`}
          rows={2}
          value={description}
          maxLength={ITEM_DESCRIPTION_MAX}
          placeholder="Ce que le personnage découvre en la prenant."
          onChange={(e) => setDescription(e.target.value)}
          className="min-h-0 text-[13px]"
        />
      </div>
      {tried && error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" size="xs">
          <Plus />
          Ajouter
        </Button>
      </div>
    </form>
  );
}
