'use client';

/**
 * Les sons d'un espace (musique ou ambiance), et seulement eux : « Jouer » (musique) ou
 * « Lancer » (ambiance) pour toute la table, l'écoute pour soi seul, et dans « … » :
 * playlist, l'autre espace, la table d'effets, renommer, retirer de l'espace, supprimer.
 */
import type { Asset, AssetSection, Playlist } from '@vtt/contracts';
import {
  AlertTriangle,
  Headphones,
  ListPlus,
  Loader2,
  MinusCircle,
  MoreHorizontal,
  Music,
  Pencil,
  Play,
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
import { canDragSound, startSoundDrag } from '@/lib/map/modules/sounds/model';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;
type Channel = ReturnType<typeof useChannel>;
type Board = ReturnType<typeof useSoundboard>;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const TEXTES: Record<
  AssetSection,
  { vide: string; ajouter: string; action: string; autre: string; retirer: string }
> = {
  music: {
    vide: 'Pas encore de musique.',
    ajouter: 'Ajouter une musique',
    action: 'Jouer',
    autre: 'Aussi en ambiance',
    retirer: 'Retirer de la musique',
  },
  ambience: {
    vide: 'Pas encore d’ambiance.',
    ajouter: 'Ajouter une ambiance',
    action: 'Lancer',
    autre: 'Aussi en musique',
    retirer: 'Retirer de l’ambiance',
  },
};

export function SectionList({
  section,
  library,
  channel,
  board,
  onAdd,
}: Readonly<{
  section: AssetSection;
  library: Library;
  channel: Channel;
  board: Board;
  onAdd: () => void;
}>) {
  const [query, setQuery] = useState('');
  const preview = usePreview();
  const t = TEXTES[section];
  const other: AssetSection = section === 'music' ? 'ambience' : 'music';
  const sounds = useMemo(
    () => library.assets.filter((a) => a.sections.includes(section)),
    [library.assets, section],
  );
  const list = useMemo(() => {
    const q = plain(query.trim());
    return sounds
      .filter((a) => !q || plain(a.name).includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [sounds, query]);

  const run = (label: string, p: Promise<unknown>) =>
    void p.catch((e) => toast.error(label, { description: messageErreur(e) }));
  const setSections = (a: Asset, next: AssetSection[]) =>
    run('Modification impossible', library.update(a.id, { sections: next }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {sounds.length > 6 ? (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Rechercher"
            label="Rechercher un son"
            className="sm:w-full"
          />
        ) : (
          <span className="flex-1" />
        )}
        <Button size="sm" onClick={onAdd} className="shrink-0">
          <Plus />
          {t.ajouter}
        </Button>
      </div>

      {library.loading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
          {sounds.length ? 'Aucun son ne correspond à la recherche.' : t.vide}
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {list.map((a) => (
            <Row
              key={a.id}
              asset={a}
              section={section}
              texts={t}
              current={channel.state?.track?.id === a.id}
              playlists={section === 'music' ? library.playlists : []}
              onBoard={board.has(a.id)}
              previewing={preview.playingId === a.id}
              onPlay={() => run('Lecture impossible', channel.play({ assetId: a.id }))}
              onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
              onAddToPlaylist={(p) =>
                run(
                  'Ajout impossible',
                  library.updatePlaylist(p.id, { assetIds: [...p.assetIds, a.id] }),
                )
              }
              onToggleOther={() =>
                setSections(
                  a,
                  a.sections.includes(other)
                    ? a.sections.filter((s) => s !== other)
                    : [...a.sections, other],
                )
              }
              otherActive={a.sections.includes(other)}
              onToggleBoard={() =>
                run(
                  'Table d’effets non modifiée',
                  board.has(a.id) ? board.remove(a.id) : board.add(a.id),
                )
              }
              onRename={(name) => run('Renommage impossible', library.update(a.id, { name }))}
              onLeave={() =>
                setSections(
                  a,
                  a.sections.filter((s) => s !== section),
                )
              }
              onDelete={() => run('Suppression impossible', library.remove(a.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  asset,
  section,
  texts,
  current,
  playlists,
  onBoard,
  previewing,
  otherActive,
  onPlay,
  onPreview,
  onAddToPlaylist,
  onToggleOther,
  onToggleBoard,
  onRename,
  onLeave,
  onDelete,
}: Readonly<{
  asset: Asset;
  section: AssetSection;
  texts: (typeof TEXTES)[AssetSection];
  current: boolean;
  playlists: Playlist[];
  onBoard: boolean;
  previewing: boolean;
  otherActive: boolean;
  onPlay: () => void;
  onPreview: () => void;
  onAddToPlaylist: (p: Playlist) => void;
  onToggleOther: () => void;
  onToggleBoard: () => void;
  onRename: (name: string) => void;
  onLeave: () => void;
  onDelete: () => void;
}>) {
  const [confirm, setConfirm] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const ready = asset.status === 'ready';
  const ActionIcon = section === 'music' ? Play : Wind;
  const OtherIcon = section === 'music' ? Wind : Music;
  const valider = () => {
    const name = renaming?.trim();
    if (name && name !== asset.name) onRename(name);
    setRenaming(null);
  };

  return (
    <li
      // Glissé sur la carte : une zone sonore (docs/carte.md § 10)
      draggable={renaming === null && canDragSound(asset)}
      onDragStart={(e) => startSoundDrag(e, asset)}
      className={cn(
        'flex items-center gap-1.5 rounded-lg px-1.5 py-1.5',
        current && 'bg-primary/[0.06]',
      )}
    >
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
          {current && <span className="font-semibold text-primary-strong">En cours</span>}
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
        variant={current ? 'secondary' : 'default'}
        disabled={!ready}
        aria-label={`${texts.action} ${asset.name} pour la table`}
        onClick={onPlay}
      >
        <ActionIcon />
        {texts.action}
      </Button>

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
          <DropdownMenuItem onSelect={onToggleOther}>
            <OtherIcon />
            {otherActive ? `${texts.autre} ✓` : texts.autre}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onToggleBoard}>
            <Star className={cn(onBoard && 'fill-current')} />
            {onBoard ? 'Sur la table d’effets ✓' : 'Sur la table d’effets'}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(asset.name)}>
            <Pencil />
            Renommer
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onLeave}>
            <MinusCircle />
            {texts.retirer}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirm) {
                e.preventDefault();
                setConfirm(true);
                return;
              }
              onDelete();
            }}
          >
            <Trash2 />
            {confirm ? 'Confirmer : supprimer partout' : 'Supprimer partout'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
