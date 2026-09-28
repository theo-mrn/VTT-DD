'use client';

/**
 * Playlists du MJ : créer, renommer, réordonner, retirer une piste, lancer
 * sur la musique (depuis le début ou une piste), supprimer. L'ordre est
 * celui du serveur ; une playlist modifiée pendant sa lecture garde la piste
 * en cours.
 */
import type { Asset, Playlist } from '@vtt/contracts';
import { ChevronDown, ChevronUp, ListMusic, Play, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { messageErreur } from '@/lib/api';
import { useAudioLibrary, useChannel } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;

function PlaylistCard({
  playlist,
  assets,
  library,
  campaignId,
}: {
  playlist: Playlist;
  assets: Map<string, Asset>;
  library: Library;
  campaignId: string;
}) {
  const music = useChannel(campaignId, 'music');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const current = music.state?.playlistId === playlist.id ? music.state.track?.id : null;
  const run = (label: string, p: Promise<unknown>) =>
    p.catch((e) => toast.error(label, { description: messageErreur(e) }));
  const move = (i: number, d: -1 | 1) => {
    const ids = [...playlist.assetIds];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run('Modification impossible', library.updatePlaylist(playlist.id, { assetIds: ids }));
  };
  const duration = playlist.assetIds.reduce((t, id) => t + (assets.get(id)?.durationMs ?? 0), 0);

  return (
    <li className="rounded-xl border border-border bg-surface-2/60">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <ListMusic className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium">{playlist.name}</span>
            <span className="block text-[11px] text-muted-foreground">
              {playlist.assetIds.length} piste{playlist.assetIds.length > 1 ? 's' : ''}
              {duration > 0 && ` · ${formatTime(duration)}`}
            </span>
          </span>
        </button>
        <Button
          size="xs"
          disabled={!playlist.assetIds.length}
          onClick={() => void run('Lecture impossible', music.play({ playlistId: playlist.id }))}
        >
          <Play />
          Lancer
        </Button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-border p-2">
          <div className="flex gap-2">
            <Input
              value={name ?? playlist.name}
              maxLength={100}
              aria-label="Nom de la playlist"
              className="h-8"
              onChange={(e) => setName(e.target.value)}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={name === null || !name.trim() || name.trim() === playlist.name}
              onClick={() => {
                void run(
                  'Renommage impossible',
                  library.updatePlaylist(playlist.id, { name: name!.trim() }),
                );
                setName(null);
              }}
            >
              Renommer
            </Button>
          </div>
          {playlist.assetIds.length === 0 ? (
            <p className="px-1 text-[12px] text-muted-foreground">
              Vide : ajoutez des sons depuis la bibliothèque (menu « … »).
            </p>
          ) : (
            <ol className="space-y-0.5">
              {playlist.assetIds.map((id, i) => {
                const a = assets.get(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      'flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px]',
                      current === id && 'bg-primary/10 text-primary-strong',
                    )}
                  >
                    <span className="w-5 text-right text-[11px] tabular-nums text-subtle">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{a?.name ?? 'Son introuvable'}</span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Lancer à partir de ${a?.name ?? 'cette piste'}`}
                      onClick={() =>
                        void run(
                          'Lecture impossible',
                          music.play({ playlistId: playlist.id, index: i }),
                        )
                      }
                    >
                      <Play />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Monter"
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      <ChevronUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Descendre"
                      disabled={i === playlist.assetIds.length - 1}
                      onClick={() => move(i, 1)}
                    >
                      <ChevronDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Retirer de la playlist"
                      onClick={() =>
                        void run(
                          'Modification impossible',
                          library.updatePlaylist(playlist.id, {
                            assetIds: playlist.assetIds.filter((x) => x !== id),
                          }),
                        )
                      }
                    >
                      <X />
                    </Button>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex justify-end">
            <Button
              variant={confirm ? 'destructive' : 'ghost'}
              size="xs"
              onClick={() =>
                confirm
                  ? void run('Suppression impossible', library.deletePlaylist(playlist.id))
                  : setConfirm(true)
              }
            >
              <Trash2 />
              {confirm ? 'Confirmer' : 'Supprimer la playlist'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function PlaylistsTab({ campaignId, library }: { campaignId: string; library: Library }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const assets = new Map(library.assets.map((a) => [a.id, a]));
  const create = async () => {
    setBusy(true);
    try {
      await library.createPlaylist(name.trim());
      setName('');
    } catch (e) {
      toast.error('Création impossible', { description: messageErreur(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void create();
        }}
      >
        <Input
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nouvelle playlist"
          aria-label="Nom de la nouvelle playlist"
          className="h-9"
        />
        <Button type="submit" size="sm" loading={busy} disabled={!name.trim()}>
          <Plus />
          Créer
        </Button>
      </form>
      {library.playlists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          Aucune playlist. Créez-en une, puis ajoutez-y des sons de la bibliothèque.
        </p>
      ) : (
        <ul className="space-y-2">
          {library.playlists.map((p) => (
            <PlaylistCard
              key={p.id}
              playlist={p}
              assets={assets}
              library={library}
              campaignId={campaignId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
