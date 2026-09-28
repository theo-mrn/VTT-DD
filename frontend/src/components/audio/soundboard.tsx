'use client';

/**
 * Table d'effets du MJ : un bouton par effet de la bibliothèque ; un clic le joue pour toute
 * la table (au même instant chez chacun). Les effets en cours sont repérés et s'arrêtent
 * ensemble.
 */
import type { Asset } from '@vtt/contracts';
import { AudioLines, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { messageErreur } from '@/lib/api';
import type { useSoundCues } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { SectionTitle } from './parts';

type Cues = ReturnType<typeof useSoundCues>;

export function Soundboard({
  effects,
  cues,
  onAdd,
}: {
  /** Effets prêts de la bibliothèque. */
  effects: Asset[];
  cues: Cues;
  /** Ouvre l'ajout d'un son, en type « effet ». */
  onAdd: () => void;
}) {
  const actifs = new Set(cues.active.map((c) => c.assetId));
  const jouer = (a: Asset) =>
    void cues
      .play(a)
      .catch((e) => toast.error('Effet impossible', { description: messageErreur(e) }));

  return (
    <section aria-label="Effets sonores">
      <SectionTitle
        action={
          cues.active.length > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => void cues.stopAll().catch(() => undefined)}
            >
              <Square />
              Tout arrêter
            </Button>
          ) : undefined
        }
      >
        Effets · un clic les joue pour la table
      </SectionTitle>
      {effects.length === 0 ? (
        <button
          type="button"
          onClick={onAdd}
          className="w-full rounded-xl border border-dashed border-border-strong px-4 py-4 text-center text-[13px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        >
          Aucun effet pour l’instant. Ajoutez des sons courts (épée, porte, sort…) de type « Effet
          ».
        </button>
      ) : (
        <ul className="grid max-h-56 grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin] sm:grid-cols-3">
          {effects.map((a) => {
            const actif = actifs.has(a.id);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => jouer(a)}
                  aria-label={`Jouer l’effet ${a.name} pour la table`}
                  className={cn(
                    'flex h-10 w-full items-center gap-2 rounded-lg border px-2.5 text-left text-[13px] transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-[0.98]',
                    actif
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border bg-surface-2/60 hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  <AudioLines
                    className={cn(
                      'size-3.5 shrink-0',
                      actif ? 'animate-pulse text-primary-strong' : 'text-muted-foreground',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{a.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
