'use client';

/**
 * Bibliothèque du MJ : une seule liste de tous ses sons, d'où qu'ils viennent (fichier,
 * YouTube, sons fournis). Chaque son sert partout : « Musique » ou « Ambiance » le joue sur ce
 * canal pour la table, l'étoile le place sur la table d'effets, le casque l'écoute pour soi
 * seul. Le reste (playlist, renommer, supprimer) est dans « … ». Les playlists et les sons
 * fournis ont leur onglet.
 */
import type { Asset, Playlist } from '@vtt/contracts';
import {
  AlertTriangle,
  Headphones,
  ListMusic,
  ListPlus,
  Loader2,
  Library,
  MoreHorizontal,
  Music,
  Package,
  Pencil,
  Plus,
  Square,
  Star,
  Trash2,
  Wind,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { usePreview, type useAudioLibrary, type useChannel, type useSoundboard } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { CatalogTab } from './catalog-tab';
import { formatTime, KIND_ICONS, Segmented, SectionTitle } from './parts';
import { PlaylistsTab } from './playlists-tab';

type Library = ReturnType<typeof useAudioLibrary>;
type Channel = ReturnType<typeof useChannel>;
type Board = ReturnType<typeof useSoundboard>;
export type LibraryView = 'sounds' | 'playlists' | 'catalog';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function SoundLibrary({
  campaignId,
  systemId,
  library,
  music,
  ambience,
  board,
  view,
  onView,
  onAdd,
}: {
  campaignId: string;
  systemId: string;
  library: Library;
  music: Channel;
  ambience: Channel;
  board: Board;
  view: LibraryView;
  onView: (v: LibraryView) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState('');
  const preview = usePreview();

  const list = useMemo(() => {
    const q = plain(query.trim());
    return library.assets
      .filter((a) => !q || plain(a.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [library.assets, query]);

  const fail = (label: string) => (e: unknown) =>
    toast.error(label, { description: messageErreur(e) });
  const run = (label: string, p: Promise<unknown>) => void p.catch(fail(label));

  return (
    <section aria-label="Bibliothèque" className="space-y-3">
      <SectionTitle
        action={
          <Button size="xs" onClick={onAdd}>
            <Plus />
            Ajouter un son
          </Button>
        }
      >
        Bibliothèque
      </SectionTitle>

      <Segmented
        label="Bibliothèque"
        value={view}
        onChange={(v) => onView(v as LibraryView)}
        options={[
          { value: 'sounds', label: 'Mes sons', icon: Library, count: library.assets.length },
          {
            value: 'playlists',
            label: 'Playlists',
            icon: ListMusic,
            count: library.playlists.length,
          },
          { value: 'catalog', label: 'Sons fournis', icon: Package },
        ]}
      />

      {view === 'playlists' && <PlaylistsTab campaignId={campaignId} library={library} />}
      {view === 'catalog' && (
        <>
          <p className="text-xs text-muted-foreground">
            Des sons prêts à l’emploi : écoutez-les, ajoutez ceux qui vous plaisent à vos sons, puis
            jouez-les où vous voulez.
          </p>
          <CatalogTab library={library} systemId={systemId} />
        </>
      )}

      {view === 'sounds' && (
        <>
          {library.assets.length > 6 && (
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder="Rechercher un son"
              label="Rechercher un son"
              className="sm:w-full"
            />
          )}
          {library.loading ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {library.assets.length
                  ? 'Aucun son ne correspond à la recherche.'
                  : 'Vous n’avez pas encore de sons.'}
              </p>
              {!library.assets.length && (
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" onClick={onAdd}>
                    <Plus />
                    Ajouter un son
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onView('catalog')}>
                    <Package />
                    Voir les sons fournis
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <ul className="-mx-1 divide-y divide-border/60">
              {list.map((a) => (
                <AssetRow
                  key={a.id}
                  asset={a}
                  playlists={library.playlists}
                  onMusic={music.state?.track?.id === a.id}
                  onAmbience={ambience.state?.track?.id === a.id}
                  onBoard={board.has(a.id)}
                  previewing={preview.playingId === a.id}
                  onPlay={(channel) =>
                    run(
                      'Lecture impossible',
                      (channel === 'music' ? music : ambience).play({ assetId: a.id }),
                    )
                  }
                  onToggleBoard={() =>
                    run(
                      'Table d’effets non modifiée',
                      board.has(a.id) ? board.remove(a.id) : board.add(a.id),
                    )
                  }
                  onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
                  onAddToPlaylist={(p) =>
                    run(
                      'Ajout impossible',
                      library.updatePlaylist(p.id, { assetIds: [...p.assetIds, a.id] }),
                    )
                  }
                  onRename={(name) => run('Renommage impossible', library.update(a.id, { name }))}
                  onRemove={() => run('Suppression impossible', library.remove(a.id))}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function AssetRow({
  asset,
  playlists,
  onMusic,
  onAmbience,
  onBoard,
  previewing,
  onPlay,
  onToggleBoard,
  onPreview,
  onAddToPlaylist,
  onRename,
  onRemove,
}: {
  asset: Asset;
  playlists: Playlist[];
  onMusic: boolean;
  onAmbience: boolean;
  onBoard: boolean;
  previewing: boolean;
  onPlay: (channel: 'music' | 'ambience') => void;
  onToggleBoard: () => void;
  onPreview: () => void;
  onAddToPlaylist: (p: Playlist) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const ready = asset.status === 'ready';
  const Icon = KIND_ICONS[asset.kind];

  const valider = () => {
    const name = renaming?.trim();
    if (name && name !== asset.name) onRename(name);
    setRenaming(null);
  };

  return (
    <li
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-1.5 py-2',
        (onMusic || onAmbience) && 'bg-primary/[0.06]',
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        {renaming !== null ? (
          <Input
            autoFocus
            value={renaming}
            maxLength={200}
            aria-label="Nouveau nom"
            onChange={(e) => setRenaming(e.target.value)}
            onBlur={valider}
            onKeyDown={(e) => {
              if (e.key === 'Enter') valider();
              if (e.key === 'Escape') setRenaming(null);
            }}
            className="h-7 text-[13px]"
          />
        ) : (
          <p className="truncate text-[13px] font-medium" title={asset.name}>
            {asset.name}
          </p>
        )}
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {onMusic && <span className="font-semibold text-primary-strong">En musique</span>}
          {onAmbience && <span className="font-semibold text-primary-strong">En ambiance</span>}
          {asset.durationMs ? (
            <span className="tabular-nums">{formatTime(asset.durationMs)}</span>
          ) : null}
          {asset.source === 'youtube' && <span>YouTube</span>}
          {asset.status === 'processing' && (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Préparation…
            </span>
          )}
          {asset.status === 'rejected' && (
            <span
              className="inline-flex items-center gap-1 text-destructive"
              title={asset.rejectReason ?? ''}
            >
              <AlertTriangle className="size-3" aria-hidden />
              Fichier refusé
            </span>
          )}
        </p>
      </div>

      <Info texte={previewing ? 'Arrêter l’écoute' : 'Écouter pour moi seul'}>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!ready}
          aria-label={previewing ? 'Arrêter l’écoute' : `Écouter ${asset.name} pour moi seul`}
          aria-pressed={previewing}
          onClick={onPreview}
          className={cn(previewing && 'text-primary-strong')}
        >
          {previewing ? <Square /> : <Headphones />}
        </Button>
      </Info>
      <Info texte="Jouer en musique pour toute la table">
        <Button
          size="xs"
          variant={onMusic ? 'default' : 'secondary'}
          disabled={!ready}
          aria-label={`Jouer ${asset.name} en musique pour la table`}
          onClick={() => onPlay('music')}
        >
          <Music />
          <span className="hidden sm:inline">Musique</span>
        </Button>
      </Info>
      <Info texte="Jouer en ambiance (en boucle) pour toute la table">
        <Button
          size="xs"
          variant={onAmbience ? 'default' : 'secondary'}
          disabled={!ready}
          aria-label={`Jouer ${asset.name} en ambiance pour la table`}
          onClick={() => onPlay('ambience')}
        >
          <Wind />
          <span className="hidden sm:inline">Ambiance</span>
        </Button>
      </Info>
      <Info texte={onBoard ? 'Retirer de la table d’effets' : 'Placer sur la table d’effets'}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={
            onBoard
              ? `Retirer ${asset.name} de la table d’effets`
              : `Placer ${asset.name} sur la table d’effets`
          }
          aria-pressed={onBoard}
          onClick={onToggleBoard}
          className={cn(onBoard && 'text-primary-strong')}
        >
          <Star className={cn(onBoard && 'fill-current')} />
        </Button>
      </Info>

      <DropdownMenu onOpenChange={(o) => !o && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Autres actions pour ${asset.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {playlists.length > 0 && (
            <>
              <DropdownMenuLabel>Ajouter à une playlist</DropdownMenuLabel>
              {playlists.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  disabled={p.assetIds.includes(asset.id)}
                  onSelect={() => onAddToPlaylist(p)}
                >
                  <ListPlus />
                  {p.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => setRenaming(asset.name)}>
            <Pencil />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirm) {
                e.preventDefault();
                setConfirm(true);
                return;
              }
              onRemove();
            }}
          >
            <Trash2 />
            {confirm ? 'Confirmer la suppression' : 'Supprimer'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
