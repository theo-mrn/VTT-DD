'use client';

/**
 * Les sons d'un espace (musique ou ambiance), et seulement eux : « Jouer » (musique) ou
 * « Lancer » (ambiance) pour toute la table, l'écoute pour soi seul, et dans « … » :
 * playlist, l'autre espace, la table d'effets, renommer, retirer de l'espace, supprimer.
 */
import { useTranslations } from 'next-intl';
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
import { canDragSound, startSoundDrag } from '@/lib/map/features/sounds/engine/model';
import { cn } from '@/lib/utils';
import { formatTime } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;
type Channel = ReturnType<typeof useChannel>;
type Board = ReturnType<typeof useSoundboard>;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const preview = usePreview();
  const texts = {
    action: t(`audio.sections.${section}.action`),
    autre: t(`audio.sections.${section}.other`),
    retirer: t(`audio.sections.${section}.remove`),
  };
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
    run(t('audio.editFailed'), library.update(a.id, { sections: next }));

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {sounds.length > 6 ? (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t('common.actions.search')}
            label={t('audio.searchSound')}
            className="sm:w-full"
          />
        ) : (
          <span className="flex-1" />
        )}
        <Button size="sm" onClick={onAdd} className="shrink-0">
          <Plus />
          {t(`audio.sections.${section}.add`)}
        </Button>
      </div>

      {library.loading && (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t('common.states.loading')}
        </p>
      )}
      {!library.loading && list.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-[13px] text-muted-foreground">
          {sounds.length ? t('audio.noSearchMatch') : t(`audio.sections.${section}.empty`)}
        </p>
      )}
      {!library.loading && list.length > 0 && (
        <ul className="-mx-1 divide-y divide-border/60">
          {list.map((a) => (
            <Row
              key={a.id}
              asset={a}
              section={section}
              texts={texts}
              current={channel.state?.track?.id === a.id}
              playlists={section === 'music' ? library.playlists : []}
              onBoard={board.has(a.id)}
              previewing={preview.playingId === a.id}
              onPlay={() => run(t('audio.playFailed'), channel.play({ assetId: a.id }))}
              onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
              onAddToPlaylist={(p) =>
                run(
                  t('map.sounds.addFailed'),
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
                  t('audio.boardUnchanged'),
                  board.has(a.id) ? board.remove(a.id) : board.add(a.id),
                )
              }
              onRename={(name) => run(t('audio.renameFailed'), library.update(a.id, { name }))}
              onLeave={() =>
                setSections(
                  a,
                  a.sections.filter((s) => s !== section),
                )
              }
              onDelete={() => run(t('audio.deleteFailed'), library.remove(a.id))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Ligne sous le nom d'un son : en cours, durée, YouTube, préparation ou refus. */
function AssetInfo({ asset, current }: Readonly<{ asset: Asset; current: boolean }>) {
  const t = useTranslations();
  return (
    <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      {current && (
        <span className="font-semibold text-primary-strong">{t('audio.nowPlaying')}</span>
      )}
      {asset.durationMs ? (
        <span className="tabular-nums">{formatTime(asset.durationMs)}</span>
      ) : null}
      {asset.source === 'youtube' && <span>YouTube</span>}
      {asset.status === 'processing' && (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {t('portraits.preparing')}
        </span>
      )}
      {asset.status === 'rejected' && (
        <span
          className="inline-flex items-center gap-1 text-destructive"
          title={asset.rejectReason ?? ''}
        >
          <AlertTriangle className="size-3" aria-hidden />
          {t('audio.fileRejected')}
        </span>
      )}
    </p>
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
  texts: { action: string; autre: string; retirer: string };
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
  const t = useTranslations();
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
            aria-label={t('handouts.newName')}
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
        <AssetInfo asset={asset} current={current} />
      </div>

      <Info texte={previewing ? t('map.sounds.stopListening') : t('audio.listenForMeHint')}>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!ready}
          aria-label={
            previewing
              ? t('map.sounds.stopListening')
              : t('audio.listenForMe', { name: asset.name })
          }
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
        aria-label={t('audio.forTable', { action: texts.action, name: asset.name })}
        onClick={onPlay}
      >
        <ActionIcon />
        {texts.action}
      </Button>

      <DropdownMenu onOpenChange={(o) => !o && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('audio.moreActionsFor', { name: asset.name })}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {playlists.length > 0 && (
            <>
              <DropdownMenuLabel>{t('audio.addToPlaylist')}</DropdownMenuLabel>
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
            {onBoard ? `${t('audio.onBoard')} ✓` : t('audio.onBoard')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRenaming(asset.name)}>
            <Pencil />
            {t('common.actions.rename')}
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
            {confirm ? t('audio.deleteEverywhereConfirm') : t('audio.deleteEverywhere')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
