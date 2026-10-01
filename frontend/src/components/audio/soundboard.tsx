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
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import type { useSoundboard, useSoundCues } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime, KIND_ICONS, SectionTitle } from './parts';

type Cues = ReturnType<typeof useSoundCues>;
type Board = ReturnType<typeof useSoundboard>;

export function Soundboard({
  board,
  library,
  cues,
  onAdd,
}: {
  board: Board;
  /** Tous les sons de la bibliothèque. */
  library: Asset[];
  cues: Cues;
  /** Ouvre « Ajouter un effet ». */
  onAdd: () => void;
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
        Un clic joue le son pour toute la table
      </SectionTitle>

      {sounds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-5 text-center">
          <p className="text-[13px] text-muted-foreground">
            Placez ici les sons à déclencher d’un clic pendant la partie : bruitages, cris, sorts…
            depuis un fichier, YouTube, les sons fournis ou vos autres sons.
          </p>
          <div className="mt-3 flex justify-center">
            <Button size="sm" onClick={onAdd}>
              <Plus />
              Ajouter un effet
            </Button>
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
                      actif
                        ? 'animate-pulse-slow text-primary-strong motion-reduce:animate-none'
                        : 'text-muted-foreground',
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
            <button
              type="button"
              onClick={onAdd}
              className="flex h-12 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border-strong text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <Plus className="size-4" aria-hidden />
              Ajouter
            </button>
          </li>
        </ul>
      )}
    </section>
  );
}
