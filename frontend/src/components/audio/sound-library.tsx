'use client';

/**
 * Bibliothèque du MJ, rangée par type (musiques, ambiances, effets), plus les playlists et
 * les sons fournis. Une ligne = un son, une action principale claire selon son type
 * (« Jouer » la musique, « Lancer » l'ambiance, « Déclencher » l'effet), l'écoute pour soi
 * seul, et le reste dans « … » (jouer ailleurs, playlist, changer de type, supprimer).
 * Les canaux et les effets sont lus une fois ici, pas par ligne.
 */
import type { Asset, AssetKind, Playlist } from '@vtt/contracts';
import {
  AlertTriangle,
  AudioLines,
  Headphones,
  ListMusic,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Music,
  Package,
  Play,
  Plus,
  Square,
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
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { usePreview, type useAudioLibrary, type useChannel, type useSoundCues } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { CatalogTab } from './catalog-tab';
import { formatTime, KIND_ICONS, KIND_LABELS, Segmented, SectionTitle } from './parts';
import { PlaylistsTab } from './playlists-tab';

type Library = ReturnType<typeof useAudioLibrary>;
type Channel = ReturnType<typeof useChannel>;
type Cues = ReturnType<typeof useSoundCues>;
export type LibraryView = AssetKind | 'playlists' | 'catalog';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const PRIMARY: Record<AssetKind, { label: string; icon: typeof Play }> = {
  music: { label: 'Jouer', icon: Play },
  ambience: { label: 'Lancer', icon: Wind },
  sfx: { label: 'Déclencher', icon: AudioLines },
};

export function SoundLibrary({
  campaignId,
  systemId,
  library,
  music,
  ambience,
  cues,
  view,
  onView,
  onAdd,
}: {
  campaignId: string;
  systemId: string;
  library: Library;
  music: Channel;
  ambience: Channel;
  cues: Cues;
  view: LibraryView;
  onView: (v: LibraryView) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState('');
  const preview = usePreview();

  const counts = useMemo(() => {
    const c: Record<AssetKind, number> = { music: 0, ambience: 0, sfx: 0 };
    for (const a of library.assets) c[a.kind] += 1;
    return c;
  }, [library.assets]);

  const assetView = view === 'music' || view === 'ambience' || view === 'sfx';
  const list = useMemo(() => {
    if (!assetView) return [];
    const q = plain(query.trim());
    return library.assets
      .filter((a) => a.kind === view && (!q || plain(a.name).includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [library.assets, query, view, assetView]);

  const run = (label: string, p: Promise<unknown>) =>
    void p.catch((e) => toast.error(label, { description: messageErreur(e) }));
  const jouer = (a: Asset, sur: AssetKind = a.kind) =>
    sur === 'sfx'
      ? run('Effet impossible', cues.play(a))
      : run('Lecture impossible', (sur === 'ambience' ? ambience : music).play({ assetId: a.id }));
  const enCours = (a: Asset) =>
    (a.kind === 'music' && music.state?.track?.id === a.id) ||
    (a.kind === 'ambience' && ambience.state?.track?.id === a.id);

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
        label="Rayon de la bibliothèque"
        value={view}
        onChange={(v) => {
          onView(v as LibraryView);
          setQuery('');
        }}
        options={[
          { value: 'music', label: 'Musiques', icon: Music, count: counts.music },
          { value: 'ambience', label: 'Ambiances', icon: Wind, count: counts.ambience },
          { value: 'sfx', label: 'Effets', icon: AudioLines, count: counts.sfx },
          { value: 'playlists', label: 'Playlists', icon: ListMusic },
          { value: 'catalog', label: 'Fournis', icon: Package },
        ]}
      />

      {view === 'playlists' && <PlaylistsTab campaignId={campaignId} library={library} />}
      {view === 'catalog' && (
        <>
          <p className="text-xs text-muted-foreground">
            Sons prêts à l’emploi : écoutez-les, puis ajoutez ceux qui vous plaisent à la
            bibliothèque.
          </p>
          <CatalogTab library={library} systemId={systemId} />
        </>
      )}

      {assetView && (
        <>
          {counts[view] > 8 && (
            <SearchField
              value={query}
              onChange={setQuery}
              placeholder={`Rechercher parmi les ${KIND_LABELS[view].toLowerCase()}s`}
              label="Rechercher un son"
              className="sm:w-full"
            />
          )}
          {library.loading ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">
                {counts[view]
                  ? 'Aucun son ne correspond à la recherche.'
                  : `Pas encore de ${KIND_LABELS[view].toLowerCase()} dans la bibliothèque.`}
              </p>
              {!counts[view] && (
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
                  playing={enCours(a)}
                  previewing={preview.playingId === a.id}
                  onPlay={(sur) => jouer(a, sur)}
                  onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
                  onAddToPlaylist={(p) =>
                    run(
                      'Ajout impossible',
                      library.updatePlaylist(p.id, { assetIds: [...p.assetIds, a.id] }),
                    )
                  }
                  onChangeKind={(k) =>
                    run('Modification impossible', library.update(a.id, { kind: k }))
                  }
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
  playing,
  previewing,
  onPlay,
  onPreview,
  onAddToPlaylist,
  onChangeKind,
  onRemove,
}: {
  asset: Asset;
  playlists: Playlist[];
  playing: boolean;
  previewing: boolean;
  onPlay: (sur?: AssetKind) => void;
  onPreview: () => void;
  onAddToPlaylist: (p: Playlist) => void;
  onChangeKind: (k: AssetKind) => void;
  onRemove: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const ready = asset.status === 'ready';
  const primary = PRIMARY[asset.kind];
  const PrimaryIcon = primary.icon;
  const autres = (['music', 'ambience', 'sfx'] as const).filter((k) => k !== asset.kind);

  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-1.5 py-2',
        playing && 'bg-primary/[0.06]',
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className="flex items-center gap-1.5 truncate text-[13px] font-medium"
          title={asset.name}
        >
          {playing && (
            <span className="shrink-0 text-[11px] font-semibold text-primary-strong">
              En cours ·
            </span>
          )}
          <span className="truncate">{asset.name}</span>
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
      <Button
        size="xs"
        variant={playing ? 'secondary' : 'default'}
        disabled={!ready}
        onClick={() => onPlay()}
        aria-label={`${primary.label} ${asset.name} pour la table`}
      >
        <PrimaryIcon />
        {primary.label}
      </Button>

      <DropdownMenu onOpenChange={(o) => !o && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Autres actions pour ${asset.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {ready && (
            <>
              <DropdownMenuLabel>Jouer pour la table</DropdownMenuLabel>
              {autres.map((k) => {
                const Icon = KIND_ICONS[k];
                return (
                  <DropdownMenuItem key={k} onSelect={() => onPlay(k)}>
                    <Icon />
                    {k === 'music'
                      ? 'En musique'
                      : k === 'ambience'
                        ? 'En ambiance'
                        : 'Comme effet'}
                  </DropdownMenuItem>
                );
              })}
            </>
          )}
          {playlists.length > 0 && (
            <>
              <DropdownMenuSeparator />
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
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Ranger comme</DropdownMenuLabel>
          {autres.map((k) => {
            const Icon = KIND_ICONS[k];
            return (
              <DropdownMenuItem key={`kind-${k}`} onSelect={() => onChangeKind(k)}>
                <Icon />
                {KIND_LABELS[k]}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
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
