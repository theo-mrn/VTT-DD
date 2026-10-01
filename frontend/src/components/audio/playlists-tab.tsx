'use client';

/**
 * Playlists du MJ, comme dans un lecteur de musique :
 * - la liste : une carte par playlist (couverture, nombre de morceaux, durée, lecture) ;
 * - la playlist ouverte : en-tête (Lire, Lire au hasard, Ajouter des morceaux, renommer,
 *   supprimer) et morceaux numérotés, réordonnés par glisser-déposer (ou au clavier), lus
 *   à partir de n'importe lequel ; le morceau en cours est mis en évidence ;
 * - l'ajout : sélection multiple dans mes sons, les musiques d'abord.
 * Tout passe par le canal musique : la table entend la playlist au même instant.
 */
import type { Asset, Playlist } from '@vtt/contracts';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  GripVertical,
  ListMusic,
  MoreHorizontal,
  Music,
  Pencil,
  Play,
  Plus,
  Shuffle,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { messageErreur } from '@/lib/api';
import { useAudioLibrary, useChannel } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;
type Channel = ReturnType<typeof useChannel>;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const fail = (label: string) => (e: unknown) =>
  toast.error(label, { description: messageErreur(e) });

/** « 12 morceaux · 42 min » */
function resume(p: Playlist, assets: Map<string, Asset>): string {
  const n = p.assetIds.length;
  const ms = p.assetIds.reduce((t, id) => t + (assets.get(id)?.durationMs ?? 0), 0);
  const duree =
    ms >= 3_600_000
      ? `${Math.floor(ms / 3_600_000)} h ${Math.round((ms % 3_600_000) / 60_000)} min`
      : ms > 0
        ? `${Math.max(1, Math.round(ms / 60_000))} min`
        : null;
  return [`${n} morceau${n > 1 ? 'x' : ''}`, duree].filter(Boolean).join(' · ');
}

/** Couverture générée aux couleurs du thème, nuance stable tirée du nom (rien à charger). */
function Cover({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  const clair = 45 + (h % 35);
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-lg text-white/90',
        size === 'lg' ? 'size-20' : 'size-12',
      )}
      style={{
        background: `linear-gradient(${(h % 4) * 45 + 110}deg, color-mix(in srgb, hsl(var(--primary)) ${clair}%, black), color-mix(in srgb, hsl(var(--primary)) 18%, black))`,
      }}
    >
      <ListMusic className={size === 'lg' ? 'size-8' : 'size-5'} />
    </span>
  );
}

export function PlaylistsTab({ campaignId, library }: { campaignId: string; library: Library }) {
  const music = useChannel(campaignId, 'music');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const assets = useMemo(() => new Map(library.assets.map((a) => [a.id, a])), [library.assets]);
  const opened = library.playlists.find((p) => p.id === openId) ?? null;

  if (opened)
    return (
      <PlaylistView
        playlist={opened}
        assets={assets}
        library={library}
        music={music}
        onBack={() => setOpenId(null)}
      />
    );

  async function creer() {
    const name = creating?.trim();
    if (!name) return;
    try {
      const p = await library.createPlaylist(name);
      setCreating(null);
      setOpenId(p.id);
    } catch (e) {
      fail('Création impossible')(e);
    }
  }

  return (
    <div className="space-y-3">
      {creating !== null ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void creer();
          }}
        >
          <Input
            autoFocus
            value={creating}
            maxLength={100}
            onChange={(e) => setCreating(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setCreating(null)}
            placeholder="Nom de la playlist : Combat, Taverne, Voyage…"
            aria-label="Nom de la nouvelle playlist"
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={!creating.trim()}>
            Créer
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(null)}>
            Annuler
          </Button>
        </form>
      ) : (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCreating('')}>
            <Plus />
            Nouvelle playlist
          </Button>
        </div>
      )}

      {library.playlists.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          Pas encore de playlist. Regroupez vos musiques par scène (combat, taverne, voyage…) pour
          les enchaîner d’un clic.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {library.playlists.map((p) => {
            const enCours = music.state?.playlistId === p.id && music.state.status === 'playing';
            return (
              <li key={p.id}>
                <div
                  className={cn(
                    'group flex items-center gap-3 rounded-xl border p-2 transition-colors',
                    enCours
                      ? 'border-primary/40 bg-primary/[0.06]'
                      : 'border-border bg-surface-2/60 hover:border-border-strong hover:bg-surface-2',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    aria-label={`Ouvrir la playlist ${p.name}`}
                  >
                    <Cover name={p.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{p.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {enCours ? (
                          <span className="font-semibold text-primary-strong">En cours · </span>
                        ) : null}
                        {resume(p, assets)}
                      </span>
                    </span>
                  </button>
                  <Button
                    size="icon"
                    className="shrink-0 rounded-full"
                    disabled={!p.assetIds.length}
                    aria-label={`Lire la playlist ${p.name} pour la table`}
                    onClick={() =>
                      void music.play({ playlistId: p.id }).catch(fail('Lecture impossible'))
                    }
                  >
                    <Play />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function PlaylistView({
  playlist: p,
  assets,
  library,
  music,
  onBack,
}: {
  playlist: Playlist;
  assets: Map<string, Asset>;
  library: Library;
  music: Channel;
  onBack: () => void;
}) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dragged, setDragged] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  // Morceau en cours repéré par son son (la file peut être mélangée : l'index ne suffit pas)
  const courant =
    music.state?.playlistId === p.id && music.state.status !== 'stopped'
      ? (music.state.track?.id ?? null)
      : null;
  const joue = music.state?.playlistId === p.id && music.state.status === 'playing';

  const save = (assetIds: string[]) =>
    library.updatePlaylist(p.id, { assetIds }).catch(fail('Modification impossible'));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= p.assetIds.length || from === to) return;
    const ids = [...p.assetIds];
    const [x] = ids.splice(from, 1);
    ids.splice(to, 0, x!);
    void save(ids);
  };
  const renommer = () => {
    const name = renaming?.trim();
    setRenaming(null);
    if (name && name !== p.name)
      void library.updatePlaylist(p.id, { name }).catch(fail('Renommage impossible'));
  };
  const lire = (index?: number) =>
    void music
      .play({ playlistId: p.id, ...(index !== undefined ? { index } : {}) })
      .catch(fail('Lecture impossible'));
  const auHasard = async () => {
    try {
      await music.configure({ shuffle: true });
      await music.play({ playlistId: p.id });
    } catch (e) {
      fail('Lecture impossible')(e);
    }
  };

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="xs" onClick={onBack} className="-ml-2">
        <ArrowLeft />
        Playlists
      </Button>

      <header className="flex items-center gap-4">
        <Cover name={p.name} size="lg" />
        <div className="min-w-0 flex-1 space-y-2">
          {renaming !== null ? (
            <Input
              autoFocus
              value={renaming}
              maxLength={100}
              aria-label="Nom de la playlist"
              onChange={(e) => setRenaming(e.target.value)}
              onBlur={renommer}
              onKeyDown={(e) => {
                if (e.key === 'Enter') renommer();
                if (e.key === 'Escape') setRenaming(null);
              }}
              className="h-9 text-base font-semibold"
            />
          ) : (
            <h3 className="truncate text-lg font-semibold">{p.name}</h3>
          )}
          <p className="text-xs text-muted-foreground">{resume(p, assets)}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" disabled={!p.assetIds.length} onClick={() => lire()}>
              <Play />
              Lire
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={p.assetIds.length < 2}
              onClick={() => void auHasard()}
            >
              <Shuffle />
              Au hasard
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>
              <Plus />
              Ajouter des morceaux
            </Button>
            <DropdownMenu onOpenChange={(o) => !o && setConfirm(false)}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Autres actions de la playlist">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRenaming(p.name)}>
                  <Pencil />
                  Renommer
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={(e) => {
                    if (!confirm) {
                      e.preventDefault();
                      setConfirm(true);
                      return;
                    }
                    void library
                      .deletePlaylist(p.id)
                      .then(onBack)
                      .catch(fail('Suppression impossible'));
                  }}
                >
                  <Trash2 />
                  {confirm ? 'Confirmer la suppression' : 'Supprimer la playlist'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {p.assetIds.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
          <p className="text-[13px] text-muted-foreground">Cette playlist est vide.</p>
          <Button size="sm" className="mt-3" onClick={() => setPicking(true)}>
            <Plus />
            Ajouter des morceaux
          </Button>
        </div>
      ) : (
        <ol className="rounded-xl border border-border">
          {p.assetIds.map((id, i) => {
            const a = assets.get(id);
            const actif = courant === id;
            return (
              <li
                key={id}
                draggable
                onDragStart={(e: DragEvent) => {
                  e.dataTransfer.effectAllowed = 'move';
                  setDragged(i);
                }}
                onDragOver={(e) => {
                  if (dragged === null) return;
                  e.preventDefault();
                  if (over !== i) setOver(i);
                }}
                onDragEnd={() => {
                  setDragged(null);
                  setOver(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragged !== null) move(dragged, i);
                  setDragged(null);
                  setOver(null);
                }}
                className={cn(
                  'group flex items-center gap-2 border-b border-border/60 px-2 py-1.5 last:border-b-0',
                  actif && 'bg-primary/[0.08]',
                  dragged === i && 'opacity-40',
                  over === i && dragged !== i && 'shadow-[inset_0_2px_0_hsl(var(--primary))]',
                )}
              >
                <GripVertical
                  className="size-3.5 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => lire(i)}
                  aria-label={`Lire à partir de ${a?.name ?? 'ce morceau'}`}
                  className="grid size-6 shrink-0 place-items-center rounded text-[12px] tabular-nums text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                >
                  {actif && joue ? (
                    <Music
                      className="size-3.5 animate-pulse-slow text-primary-strong motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : (
                    <>
                      <span className="group-hover:hidden">{i + 1}</span>
                      <Play
                        className="hidden size-3.5 text-foreground group-hover:block"
                        aria-hidden
                      />
                    </>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'truncate text-[13px] font-medium',
                      actif && 'text-primary-strong',
                      !a && 'text-muted-foreground',
                    )}
                  >
                    {a?.name ?? 'Son supprimé'}
                  </p>
                  {a?.source === 'youtube' && (
                    <p className="text-[11px] text-muted-foreground">YouTube</p>
                  )}
                </div>
                <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">
                  {a?.durationMs ? formatTime(a.durationMs) : ''}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Actions pour ${a?.name ?? 'ce morceau'}`}
                      className="opacity-60 group-hover:opacity-100"
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => lire(i)}>
                      <Play />
                      Lire à partir d’ici
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={i === 0} onSelect={() => move(i, i - 1)}>
                      <ArrowUp />
                      Monter
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={i === p.assetIds.length - 1}
                      onSelect={() => move(i, i + 1)}
                    >
                      <ArrowDown />
                      Descendre
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => void save(p.assetIds.filter((_, j) => j !== i))}
                    >
                      <X />
                      Retirer de la playlist
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ol>
      )}

      <AddTracks
        open={picking}
        onOpenChange={setPicking}
        playlist={p}
        library={library}
        onAdd={(ids) => save([...p.assetIds, ...ids])}
      />
    </div>
  );
}

/** Sélection multiple de morceaux à ajouter (musiques d'abord, puis mes autres sons). */
function AddTracks({
  open,
  onOpenChange,
  playlist,
  library,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  playlist: Playlist;
  library: Library;
  onAdd: (ids: string[]) => Promise<unknown>;
}) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const deja = new Set(playlist.assetIds);
  const candidats = useMemo(() => {
    const q = plain(query.trim());
    return library.assets
      .filter(
        (a) => a.status !== 'rejected' && !deja.has(a.id) && (!q || plain(a.name).includes(q)),
      )
      .sort(
        (a, b) =>
          Number(b.sections.includes('music')) - Number(a.sections.includes('music')) ||
          a.name.localeCompare(b.name, 'fr'),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library.assets, query, playlist.assetIds]);
  const fermer = (o: boolean) => {
    onOpenChange(o);
    if (!o) {
      setChosen([]);
      setQuery('');
    }
  };
  const basculer = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  async function ajouter() {
    setBusy(true);
    await onAdd(chosen);
    setBusy(false);
    fermer(false);
  }

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter à « {playlist.name} »</DialogTitle>
          <DialogDescription>
            Cochez les morceaux ; ils s’ajoutent à la fin, dans l’ordre choisi.
          </DialogDescription>
        </DialogHeader>
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Rechercher dans mes sons"
          label="Rechercher dans mes sons"
          className="sm:w-full"
        />
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {candidats.length === 0 ? (
            <li className="py-8 text-center text-[13px] text-muted-foreground">
              {library.assets.length
                ? 'Tous vos sons sont déjà dans la playlist.'
                : 'Ajoutez d’abord des musiques dans l’onglet Musique.'}
            </li>
          ) : (
            candidats.map((a) => {
              const coche = chosen.includes(a.id);
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={coche}
                    onClick={() => basculer(a.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none',
                      coche && 'bg-primary/[0.06]',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'grid size-4 shrink-0 place-items-center rounded border',
                        coche
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border-strong',
                      )}
                    >
                      {coche && <Check className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{a.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {a.sections.includes('music') ? 'Musique' : 'Autre son'}
                        {a.durationMs ? ` · ${formatTime(a.durationMs)}` : ''}
                      </span>
                    </span>
                    {coche && (
                      <span className="text-[11px] tabular-nums text-primary-strong">
                        {chosen.indexOf(a.id) + 1}
                      </span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={() => fermer(false)}>
            Annuler
          </Button>
          <Button disabled={!chosen.length} loading={busy} onClick={() => void ajouter()}>
            {chosen.length
              ? `Ajouter ${chosen.length} morceau${chosen.length > 1 ? 'x' : ''}`
              : 'Ajouter'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
