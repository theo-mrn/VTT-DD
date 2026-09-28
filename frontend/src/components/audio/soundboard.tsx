'use client';

/**
 * Table d'effets du MJ, personnalisable : il y place les sons de la bibliothèque qu'il veut
 * sous la main, quels que soient leur type et leur provenance (fichier, YouTube, sons
 * fournis). Un clic sur une case joue le son pour toute la table, au même instant chez chacun.
 * « Modifier » : réordonner, retirer, ajouter depuis la bibliothèque.
 */
import type { Asset } from '@vtt/contracts';
import { ArrowLeft, ArrowRight, Check, Pencil, Plus, Square, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { messageErreur } from '@/lib/api';
import type { useSoundboard, useSoundCues } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime, KIND_ICONS, SectionTitle } from './parts';

type Cues = ReturnType<typeof useSoundCues>;
type Board = ReturnType<typeof useSoundboard>;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function Soundboard({
  board,
  library,
  cues,
}: {
  board: Board;
  /** Tous les sons de la bibliothèque. */
  library: Asset[];
  cues: Cues;
}) {
  const [editing, setEditing] = useState(false);
  const byId = useMemo(() => new Map(library.map((a) => [a.id, a])), [library]);
  const sounds = board.assetIds.map((id) => byId.get(id)).filter((a): a is Asset => !!a);
  const actifs = new Set(cues.active.map((c) => c.assetId));
  const fail = (label: string) => (e: unknown) =>
    toast.error(label, { description: messageErreur(e) });
  const jouer = (a: Asset) => void cues.play(a).catch(fail('Son impossible à jouer'));

  return (
    <section aria-label="Table d’effets">
      <SectionTitle
        action={
          <div className="flex items-center gap-1">
            {cues.active.length > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void cues.stopAll().catch(() => undefined)}
              >
                <Square />
                Tout arrêter
              </Button>
            )}
            {sounds.length > 0 && (
              <Button
                variant={editing ? 'default' : 'ghost'}
                size="xs"
                aria-pressed={editing}
                onClick={() => setEditing((e) => !e)}
              >
                {editing ? <Check /> : <Pencil />}
                {editing ? 'Terminé' : 'Modifier'}
              </Button>
            )}
          </div>
        }
      >
        Table d’effets
      </SectionTitle>

      {sounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
          <p className="text-[13px] text-muted-foreground">
            Placez ici les sons que vous voulez déclencher d’un clic pendant la partie : n’importe
            quel son de la bibliothèque, musique ou bruitage, fichier ou YouTube.
          </p>
          <div className="mt-3 flex justify-center">
            <AddToBoard board={board} library={library} />
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {sounds.map((a, i) => {
            const actif = actifs.has(a.id);
            const Icon = KIND_ICONS[a.kind];
            const pret = a.status === 'ready';
            return (
              <li key={a.id} className="relative">
                <button
                  type="button"
                  disabled={!pret || editing}
                  onClick={() => jouer(a)}
                  aria-label={`Jouer ${a.name} pour la table`}
                  className={cn(
                    'flex h-12 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-[13px] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    'disabled:cursor-default',
                    !editing && pret && 'active:scale-[0.98]',
                    actif
                      ? 'border-primary/50 bg-primary/10'
                      : 'border-border bg-surface-2/60 enabled:hover:border-border-strong enabled:hover:bg-surface-2',
                    !pret && 'opacity-60',
                  )}
                >
                  <Icon
                    className={cn(
                      'size-3.5 shrink-0',
                      actif ? 'animate-pulse text-primary-strong' : 'text-muted-foreground',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    {a.durationMs ? (
                      <span className="block text-[11px] tabular-nums text-subtle">
                        {formatTime(a.durationMs)}
                      </span>
                    ) : null}
                  </span>
                </button>
                {editing && (
                  <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={i === 0}
                      aria-label={`Avancer ${a.name}`}
                      onClick={() =>
                        void board.move(a.id, -1).catch(fail('Modification impossible'))
                      }
                    >
                      <ArrowLeft />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      disabled={i === sounds.length - 1}
                      aria-label={`Reculer ${a.name}`}
                      onClick={() =>
                        void board.move(a.id, 1).catch(fail('Modification impossible'))
                      }
                    >
                      <ArrowRight />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Retirer ${a.name} de la table d’effets`}
                      onClick={() => void board.remove(a.id).catch(fail('Modification impossible'))}
                    >
                      <X />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
          <li className="flex">
            <AddToBoard board={board} library={library} tile />
          </li>
        </ul>
      )}
    </section>
  );
}

/** Choisir un son de la bibliothèque à placer sur la table d'effets. */
function AddToBoard({
  board,
  library,
  tile = false,
}: {
  board: Board;
  library: Asset[];
  tile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const candidates = useMemo(() => {
    const q = plain(query.trim());
    return library
      .filter((a) => !board.has(a.id) && (!q || plain(a.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [library, board, query]);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        {tile ? (
          <button
            type="button"
            className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
          >
            <Plus className="size-4" aria-hidden />
            Ajouter
          </button>
        ) : (
          <Button size="sm">
            <Plus />
            Ajouter un son à la table
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-80 flex-col gap-2 p-3"
      >
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Rechercher dans la bibliothèque"
          label="Rechercher un son"
          className="sm:w-full"
        />
        {candidates.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-muted-foreground">
            {library.length ? 'Aucun autre son à ajouter.' : 'La bibliothèque est vide.'}
          </p>
        ) : (
          <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {candidates.map((a) => {
              const Icon = KIND_ICONS[a.kind];
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void board
                        .add(a.id)
                        .catch((e) =>
                          toast.error('Ajout impossible', { description: messageErreur(e) }),
                        )
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <Plus className="size-3.5 shrink-0 text-subtle" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
