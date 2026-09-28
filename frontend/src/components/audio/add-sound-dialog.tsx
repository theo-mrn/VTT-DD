'use client';

/**
 * « Ajouter une musique / une ambiance / un effet » : la fenêtre d'un espace. Quatre
 * provenances : un fichier, un lien YouTube, les sons fournis, ou un de mes autres sons (déjà
 * dans un autre espace : il y est ajouté aussi, sans copie). Le son arrive directement dans
 * l'espace d'où l'on a ouvert la fenêtre.
 */
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

export const TARGET_TITLES: Record<SoundTarget, string> = {
  music: 'Ajouter une musique',
  ambience: 'Ajouter une ambiance',
  sfx: 'Ajouter un effet',
};

const NOMS: Record<SoundTarget, string> = {
  music: 'la musique',
  ambience: 'l’ambiance',
  sfx: 'la table d’effets',
};

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

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
}: {
  /** null : fenêtre fermée. */
  target: SoundTarget | null;
  systemId: string;
  library: Library;
  board: Board;
  onOpenChange: (open: boolean) => void;
}) {
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
          <DialogTitle>{target ? TARGET_TITLES[target] : ''}</DialogTitle>
          <DialogDescription>{target ? `Le son rejoint ${NOMS[target]}.` : ''}</DialogDescription>
        </DialogHeader>

        <Segmented
          label="Provenance"
          value={source}
          onChange={(v) => setSource(v as Source)}
          options={[
            { value: 'file', label: 'Fichier', icon: Upload },
            { value: 'youtube', label: 'YouTube', icon: Youtube },
            { value: 'catalog', label: 'Fournis', icon: Package },
            { value: 'mine', label: 'Mes sons', icon: Library },
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

function FileSource({
  target,
  library,
  ranger,
  onDone,
}: {
  target: SoundTarget;
  library: Library;
  ranger: (a: Asset) => Promise<void>;
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [survol, setSurvol] = useState(false);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!audioContentType(f)) {
      toast.error('Format non pris en charge', {
        description: 'Formats acceptés : mp3, m4a, aac, ogg, opus, webm, wav, flac.',
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
      toast.success(`${name.trim()} ajouté`, {
        description: 'Préparation du fichier : il sera jouable dans un instant.',
      });
      onDone();
    } catch (e) {
      toast.error('Envoi impossible', { description: messageErreur(e) });
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
            <span className="text-sm font-medium">Déposez un fichier ou cliquez pour choisir</span>
            <span className="text-xs text-muted-foreground">mp3, m4a, ogg, opus, wav, flac…</span>
          </>
        )}
      </button>
      <div className="space-y-1.5">
        <Label htmlFor="son-nom">Nom</Label>
        <Input
          id="son-nom"
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      {progress !== null && (
        <Progress valeur={Math.round(progress * 100)} label="Envoi du fichier" />
      )}
      <DialogFooter>
        <Button
          disabled={!file || !name.trim()}
          loading={progress !== null}
          onClick={() => void envoyer()}
        >
          Ajouter
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
}: {
  target: SoundTarget;
  library: Library;
  ranger: (a: Asset) => Promise<void>;
  onDone: () => void;
}) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  async function ajouter() {
    setBusy(true);
    try {
      const a = await library.addYoutube(url.trim(), name.trim(), target);
      await ranger(a);
      toast.success(`${name.trim()} ajouté`);
      onDone();
    } catch (e) {
      toast.error('Lien refusé', { description: messageErreur(e) });
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 pt-1">
      <div className="space-y-1.5">
        <Label htmlFor="son-lien">Lien de la vidéo</Label>
        <Input
          id="son-lien"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="son-nom-yt">Nom</Label>
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
          Ajouter
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
}: {
  name: string;
  meta?: string;
  previewing: boolean;
  onPreview: () => void;
  done: boolean;
  busy: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-surface-2">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={previewing ? 'Arrêter l’écoute' : `Écouter ${name}`}
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
        {done ? 'Ajouté' : 'Ajouter'}
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
}: {
  target: SoundTarget;
  systemId: string;
  library: Library;
  board: Board;
  ranger: (a: Asset) => Promise<void>;
}) {
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
      { value: 'all', label: 'Tout', count: catalog.items.length },
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
      toast.success(`${e.name} ajouté`);
    } catch (err) {
      toast.error('Ajout impossible', { description: messageErreur(err) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Rechercher un son fourni"
        label="Rechercher un son fourni"
        className="sm:w-full"
      />
      {chips.length > 2 && (
        <Chips label="Catégorie" value={category} onChange={setCategory} options={chips} />
      )}
      {catalog.loading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
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
const WHERE: { value: Where; label: string; test: (a: Asset, board: Board) => boolean }[] = [
  { value: 'all', label: 'Tous', test: () => true },
  { value: 'music', label: 'Musique', test: (a) => a.sections.includes('music') },
  { value: 'ambience', label: 'Ambiance', test: (a) => a.sections.includes('ambience') },
  { value: 'sfx', label: 'Effets', test: (a, b) => b.has(a.id) },
  {
    value: 'none',
    label: 'Rangés nulle part',
    test: (a, b) => !a.sections.length && !b.has(a.id),
  },
];

function MineSource({
  target,
  library,
  board,
  ranger,
}: {
  target: SoundTarget;
  library: Library;
  board: Board;
  ranger: (a: Asset) => Promise<void>;
}) {
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
        label: w.label,
        count: usable.filter((a) => w.test(a, board)).length,
      })).filter((c) => c.value === 'all' || c.count > 0),
    [usable, board],
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
      toast.error('Ajout impossible', { description: messageErreur(e) });
    } finally {
      setBusy(null);
    }
  }

  const ou = (a: Asset) =>
    [
      a.sections.includes('music') && 'musique',
      a.sections.includes('ambience') && 'ambiance',
      board.has(a.id) && 'effets',
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs text-muted-foreground">
        Un son déjà rangé ailleurs est ajouté ici aussi, sans être copié.
      </p>
      {library.assets.length > 6 && (
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Rechercher dans mes sons"
          label="Rechercher dans mes sons"
          className="sm:w-full"
        />
      )}
      {chips.length > 2 && (
        <Chips
          label="Rangement"
          value={where}
          onChange={(v) => setWhere(v as Where)}
          options={chips}
        />
      )}
      {items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {usable.length ? 'Aucun son ne correspond.' : 'Vous n’avez pas encore de sons.'}
        </p>
      ) : (
        <ul>
          {items.map((a) => (
            <ChoiceRow
              key={a.id}
              name={a.name}
              meta={ou(a) ? `Déjà en ${ou(a)}` : 'Rangé nulle part'}
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
