'use client';

/**
 * « Ajouter une musique / une ambiance / un effet » : la fenêtre d'un espace. Quatre
 * provenances : un fichier, un lien YouTube, les sons fournis, ou un de mes autres sons (déjà
 * dans un autre espace : il y est ajouté aussi, sans copie). Le son arrive directement dans
 * l'espace d'où l'on a ouvert la fenêtre.
 */
import { useTranslations } from 'next-intl';
import type { Asset, AssetKind, CatalogEntry } from '@vtt/contracts';
import {
  Check,
  FileAudio,
  Headphones,
  Library,
  Package,
  Plus,
  Square,
  Upload,
  Youtube,
} from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Chips, SearchField } from '@/components/resources/parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { messageErreur } from '@/lib/api';
import {
  ACCEPTED_AUDIO,
  audioContentType,
  useAudioCatalog,
  usePreview,
  type useAudioLibrary,
  type useSoundboard,
} from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime, Segmented } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;
type Board = ReturnType<typeof useSoundboard>;
type Source = 'file' | 'youtube' | 'catalog' | 'mine';

/** L'espace visé : musique, ambiance ou table d'effets. */
export type SoundTarget = AssetKind;

export const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const baseName = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

/** Le son est-il déjà dans cet espace ? */
export function inTarget(a: Asset, target: SoundTarget, board: Board): boolean {
  return target === 'sfx' ? board.has(a.id) : a.sections.includes(target);
}

export function AddSoundDialog({
  target,
  systemId,
  library,
  board,
  onOpenChange,
}: Readonly<{
  /** null : fenêtre fermée. */
  target: SoundTarget | null;
  systemId: string;
  library: Library;
  board: Board;
  onOpenChange: (open: boolean) => void;
}>) {
  const t = useTranslations();
  const [source, setSource] = useState<Source>('file');
  const open = target !== null;
  const fermer = (o: boolean) => {
    onOpenChange(o);
    if (!o) setSource('file');
  };

  /** Range un son (neuf ou existant) dans l'espace visé. */
  async function ranger(a: Asset) {
    if (!target || inTarget(a, target, board)) return;
    if (target === 'sfx') await board.add(a.id);
    else await library.update(a.id, { sections: [...a.sections, target] });
  }

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target ? t(`audio.add.titles.${target}`) : ''}</DialogTitle>
          <DialogDescription>{target ? t(`audio.add.joins.${target}`) : ''}</DialogDescription>
        </DialogHeader>

        <Segmented
          label={t('map.sounds.source')}
          value={source}
          onChange={(v) => setSource(v as Source)}
          options={[
            { value: 'file', label: t('map.sounds.file'), icon: Upload },
            { value: 'youtube', label: 'YouTube', icon: Youtube },
            { value: 'catalog', label: t('map.sounds.provided'), icon: Package },
            { value: 'mine', label: t('map.sounds.mine'), icon: Library },
          ]}
        />

        {target && (
          <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
            {source === 'file' && (
              <FileSource
                target={target}
                library={library}
                ranger={ranger}
                onDone={() => fermer(false)}
              />
            )}
            {source === 'youtube' && (
              <YoutubeSource
                target={target}
                library={library}
                ranger={ranger}
                onDone={() => fermer(false)}
              />
            )}
            {source === 'catalog' && (
              <CatalogSource
                target={target}
                systemId={systemId}
                library={library}
                board={board}
                ranger={ranger}
              />
            )}
            {source === 'mine' && (
              <MineSource target={target} library={library} board={board} ranger={ranger} />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Envoi d'un fichier (aussi pour la fenêtre des zones sonores de la carte). */
export function FileSource({
  target,
  library,
  ranger,
  onDone,
}: Readonly<{
  target: SoundTarget;
  library: Library;
  ranger: (a: Asset) => Promise<void>;
  onDone: () => void;
}>) {
  const t = useTranslations();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [survol, setSurvol] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!audioContentType(f)) {
      toast.error(t('audio.add.unsupported'), {
        description: t('audio.add.formats'),
      });
      return;
    }
    setFile(f);
    if (!name.trim()) setName(baseName(f.name).slice(0, 200));
  };

  async function envoyer() {
    if (!file || !name.trim()) return;
    setProgress(0);
    try {
      const a = await library.upload(file, { name: name.trim(), kind: target }, setProgress);
      await ranger(a);
      toast.success(t('audio.add.added', { name: name.trim() }), {
        description: t('audio.add.preparing'),
      });
      onDone();
    } catch (e) {
      toast.error(t('map.sounds.uploadFailed'), { description: messageErreur(e) });
      setProgress(null);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_AUDIO}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setSurvol(true);
        }}
        onDragLeave={() => setSurvol(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setSurvol(false);
          pick(e.dataTransfer.files[0]);
        }}
        disabled={progress !== null}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          survol
            ? 'border-primary bg-primary/[0.06]'
            : 'border-border-strong hover:border-primary/50 hover:bg-surface-2',
        )}
      >
        <FileAudio className="size-6 text-muted-foreground" aria-hidden />
        {file ? (
          <>
            <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
            <span className="text-xs text-muted-foreground">
              {(file.size / 1024 / 1024).toFixed(1)} Mo · cliquer pour changer
            </span>
          </>
        ) : (
          <>
            <span className="text-sm font-medium">{t('audio.add.drop')}</span>
            <span className="text-xs text-muted-foreground">{t('audio.add.dropFormats')}</span>
          </>
        )}
      </button>
      <div className="space-y-1.5">
        <Label htmlFor="son-nom">{t('map.lights.name')}</Label>
        <Input
          id="son-nom"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {progress !== null && (
        <Progress valeur={Math.round(progress * 100)} label={t('audio.add.uploading')} />
      )}
      <DialogFooter>
        <Button
          disabled={!file || !name.trim()}
          loading={progress !== null}
          onClick={() => void envoyer()}
        >
          {t('common.actions.add')}
        </Button>
      </DialogFooter>
    </div>
  );
}

function YoutubeSource({
  target,
  library,
  ranger,
  onDone,
}: Readonly<{
  target: SoundTarget;
  library: Library;
  ranger: (a: Asset) => Promise<void>;
  onDone: () => void;
}>) {
  const t = useTranslations();
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function ajouter() {
    setBusy(true);
    try {
      const a = await library.addYoutube(url.trim(), name.trim(), target);
      await ranger(a);
      toast.success(t('audio.add.added', { name: name.trim() }));
      onDone();
    } catch (e) {
      toast.error(t('audio.add.linkRefused'), { description: messageErreur(e) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor="son-lien">{t('audio.add.videoLink')}</Label>
        <Input
          id="son-lien"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="son-nom-yt">{t('map.lights.name')}</Label>
        <Input
          id="son-nom-yt"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <DialogFooter>
        <Button
          disabled={!url.trim() || !name.trim()}
          loading={busy}
          onClick={() => void ajouter()}
        >
          {t('common.actions.add')}
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Ligne d'un choix (sons fournis, mes sons) : écoute, nom, bouton d'ajout. */
function ChoiceRow({
  name,
  meta,
  previewing,
  onPreview,
  done,
  busy,
  onAdd,
}: Readonly<{
  name: string;
  meta?: string;
  previewing: boolean;
  onPreview: () => void;
  done: boolean;
  busy: boolean;
  onAdd: () => void;
}>) {
  const t = useTranslations();
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={previewing ? t('map.sounds.stopListening') : t('map.sounds.listenTo', { name })}
        aria-pressed={previewing}
        onClick={onPreview}
        className={cn(previewing && 'text-primary-strong')}
      >
        {previewing ? <Square /> : <Headphones />}
      </Button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">{name}</p>
        {meta && <p className="text-[11px] text-muted-foreground">{meta}</p>}
      </div>
      <Button
        size="xs"
        variant={done ? 'ghost' : 'secondary'}
        disabled={done}
        loading={busy}
        onClick={onAdd}
      >
        {done ? <Check /> : <Plus />}
        {done ? t('audio.add.addedShort') : t('common.actions.add')}
      </Button>
    </li>
  );
}

function CatalogSource({
  target,
  systemId,
  library,
  board,
  ranger,
}: Readonly<{
  target: SoundTarget;
  systemId: string;
  library: Library;
  board: Board;
  ranger: (a: Asset) => Promise<void>;
}>) {
  const t = useTranslations();
  const catalog = useAudioCatalog(systemId);
  const preview = usePreview();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const labels = useMemo(
    () => new Map(catalog.categories.map((c) => [c.id, c.label])),
    [catalog.categories],
  );
  // Catégories des sons fournis, celles du type de l'espace d'abord
  const chips = useMemo(
    () => [
      { value: 'all', label: t('map.objects.library.all'), count: catalog.items.length },
      ...[...catalog.categories]
        .sort((a, b) => Number(b.kind === target) - Number(a.kind === target))
        .map((c) => ({
          value: c.id,
          label: c.label,
          count: catalog.items.filter((e) => e.category === c.id).length,
        }))
        .filter((c) => c.count > 0),
    ],
    [catalog.categories, catalog.items, target],
  );
  const byCatalog = useMemo(
    () => new Map(library.assets.filter((a) => a.catalogId).map((a) => [a.catalogId!, a])),
    [library.assets],
  );
  // Ceux du bon type d'abord, puis les autres (tout son peut servir partout)
  const items = useMemo(() => {
    const q = plain(query.trim());
    return catalog.items
      .filter(
        (e) => (category === 'all' || e.category === category) && (!q || plain(e.name).includes(q)),
      )
      .sort(
        (a, b) =>
          Number(b.kind === target) - Number(a.kind === target) ||
          a.name.localeCompare(b.name, 'fr'),
      );
  }, [catalog.items, query, target, category]);

  async function ajouter(e: CatalogEntry) {
    setBusy(e.id);
    try {
      const a = byCatalog.get(e.id) ?? (await library.addFromCatalog(e.id, { kind: target }));
      await ranger(a);
      toast.success(t('audio.add.added', { name: e.name }));
    } catch (err) {
      toast.error(t('map.sounds.addFailed'), { description: messageErreur(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder={t('map.sounds.searchProvided')}
        label={t('map.sounds.searchProvided')}
        className="sm:w-full"
      />
      {chips.length > 2 && (
        <Chips
          label={t('map.sounds.category')}
          value={category}
          onChange={setCategory}
          options={chips}
        />
      )}
      {catalog.loading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {t('common.states.loading')}
        </p>
      ) : (
        <ul>
          {items.map((e) => {
            const a = byCatalog.get(e.id);
            return (
              <ChoiceRow
                key={e.id}
                name={e.name}
                meta={[labels.get(e.category), e.durationMs ? formatTime(e.durationMs) : null]
                  .filter(Boolean)
                  .join(' · ')}
                previewing={preview.playingId === e.id}
                onPreview={() =>
                  preview.playingId === e.id
                    ? preview.stop()
                    : preview.play({ id: e.id, url: e.url, name: e.name })
                }
                done={!!a && inTarget(a, target, board)}
                busy={busy === e.id}
                onAdd={() => void ajouter(e)}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

type Where = 'all' | 'music' | 'ambience' | 'sfx' | 'none';
/** Filtres de rangement ; nom : `audio.add.where.<valeur>`. */
const WHERE: { value: Where; test: (a: Asset, board: Board) => boolean }[] = [
  { value: 'all', test: () => true },
  { value: 'music', test: (a) => a.sections.includes('music') },
  { value: 'ambience', test: (a) => a.sections.includes('ambience') },
  { value: 'sfx', test: (a, b) => b.has(a.id) },
  { value: 'none', test: (a, b) => !a.sections.length && !b.has(a.id) },
];

function MineSource({
  target,
  library,
  board,
  ranger,
}: Readonly<{
  target: SoundTarget;
  library: Library;
  board: Board;
  ranger: (a: Asset) => Promise<void>;
}>) {
  const t = useTranslations();
  const preview = usePreview();
  const [query, setQuery] = useState('');
  const [where, setWhere] = useState<Where>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const usable = useMemo(
    () => library.assets.filter((a) => a.status !== 'rejected'),
    [library.assets],
  );
  const chips = useMemo(
    () =>
      WHERE.map((w) => ({
        value: w.value,
        label: t(`audio.add.where.${w.value}`),
        count: usable.filter((a) => w.test(a, board)).length,
      })).filter((c) => c.value === 'all' || c.count > 0),
    [usable, board, t],
  );
  const items = useMemo(() => {
    const q = plain(query.trim());
    const test = WHERE.find((w) => w.value === where)!.test;
    return usable
      .filter((a) => test(a, board) && (!q || plain(a.name).includes(q)))
      .sort(
        (a, b) =>
          Number(inTarget(a, target, board)) - Number(inTarget(b, target, board)) ||
          a.name.localeCompare(b.name, 'fr'),
      );
  }, [usable, query, target, board, where]);

  async function ajouter(a: Asset) {
    setBusy(a.id);
    try {
      await ranger(a);
    } catch (e) {
      toast.error(t('map.sounds.addFailed'), { description: messageErreur(e) });
    } finally {
      setBusy(null);
    }
  }

  const ou = (a: Asset) =>
    [
      a.sections.includes('music') && t('audio.add.in.music'),
      a.sections.includes('ambience') && t('audio.add.in.ambience'),
      board.has(a.id) && t('audio.add.in.sfx'),
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs text-muted-foreground">{t('audio.add.mineHint')}</p>
      {library.assets.length > 6 && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t('map.sounds.searchMine')}
          label={t('map.sounds.searchMine')}
          className="sm:w-full"
        />
      )}
      {chips.length > 2 && (
        <Chips
          label={t('audio.add.filing')}
          value={where}
          onChange={(v) => setWhere(v as Where)}
          options={chips}
        />
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {usable.length ? t('map.sounds.noMatch') : t('audio.add.noSounds')}
        </p>
      ) : (
        <ul>
          {items.map((a) => (
            <ChoiceRow
              key={a.id}
              name={a.name}
              meta={ou(a) ? t('audio.add.alreadyIn', { places: ou(a) }) : t('audio.add.nowhere')}
              previewing={preview.playingId === a.id}
              onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
              done={inTarget(a, target, board)}
              busy={busy === a.id}
              onAdd={() => void ajouter(a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
