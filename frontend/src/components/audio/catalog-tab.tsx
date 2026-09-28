'use client';

/**
 * Catalogue intégré (sons et musiques de l'ancienne app ; Star Wars pour ce
 * système) : préécoute, puis ajout à la bibliothèque de la campagne.
 */
import type { CatalogEntry } from '@vtt/contracts';
import { Check, Headphones, Plus, Square } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Chips, SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import { useAudioCatalog, useAudioLibrary, usePreview } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { KIND_LABELS } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;

export function CatalogTab({ library, systemId }: { library: Library; systemId: string }) {
  const catalog = useAudioCatalog(systemId);
  const preview = usePreview();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  const added = useMemo(
    () => new Set(library.assets.map((a) => a.catalogId).filter(Boolean)),
    [library.assets],
  );
  const items = useMemo(() => {
    const q = query.toLowerCase().trim();
    return catalog.items.filter(
      (e) =>
        (category === 'all' || e.category === category) && (!q || e.name.toLowerCase().includes(q)),
    );
  }, [catalog.items, category, query]);

  const add = async (e: CatalogEntry) => {
    setAdding(e.id);
    try {
      await library.addFromCatalog(e.id);
      toast.success(`${e.name} ajouté à la bibliothèque`);
    } catch (err) {
      toast.error('Ajout impossible', { description: messageErreur(err) });
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className="space-y-3">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Rechercher dans le catalogue"
        label="Rechercher dans le catalogue"
        className="sm:w-full"
      />
      <Chips
        label="Catégorie"
        value={category}
        onChange={setCategory}
        options={[
          { value: 'all', label: 'Tout', count: catalog.items.length },
          ...catalog.categories.map((c) => ({
            value: c.id,
            label: c.label,
            count: catalog.items.filter((e) => e.category === c.id).length,
          })),
        ]}
      />
      {catalog.loading ? (
        <p className="text-[13px] text-muted-foreground">Chargement…</p>
      ) : (
        <ul className="-mx-2">
          {items.map((e) => {
            const playing = preview.playingId === e.id;
            const inLibrary = added.has(e.id);
            return (
              <li
                key={e.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2"
              >
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={playing ? 'Arrêter la préécoute' : `Préécouter ${e.name}`}
                  aria-pressed={playing}
                  className={cn(playing && 'text-primary-strong')}
                  onClick={() =>
                    playing ? preview.stop() : preview.play({ id: e.id, url: e.url })
                  }
                >
                  {playing ? <Square /> : <Headphones />}
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{e.name}</p>
                  <p className="text-[11px] text-muted-foreground">{KIND_LABELS[e.kind]}</p>
                </div>
                <Button
                  variant="secondary"
                  size="xs"
                  disabled={inLibrary}
                  loading={adding === e.id}
                  onClick={() => void add(e)}
                >
                  {inLibrary ? <Check /> : <Plus />}
                  {inLibrary ? 'Ajouté' : 'Ajouter'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
