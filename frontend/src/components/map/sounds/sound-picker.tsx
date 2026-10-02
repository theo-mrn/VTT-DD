'use client';

/**
 * Choix du son d'une zone (MJ) : un bouton qui ouvre la bibliothèque, et la préécoute du son
 * choisi. La fenêtre a trois provenances :
 *
 * - **Mes sons** : toute la bibliothèque de la campagne (ambiances, musiques, effets) ;
 * - **Fournis** : les sons fournis avec le système, ajoutés à la bibliothèque au choix ;
 * - **Fichier** : un mp3 (ou autre) de l'ordinateur, envoyé puis choisi.
 *
 * Les sons YouTube n'y figurent pas (ni direction ni étouffement possibles hors de Web Audio).
 */
import type { Asset, AssetKind, CatalogEntry } from '@vtt/contracts';
import { Check, Headphones, Library, Package, Pause, Play, Square, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileSource, plain } from '@/components/audio/add-sound-dialog';
import { formatTime, KIND_ICONS, KIND_LABELS, Segmented } from '@/components/audio/parts';
import { Chips, SearchField } from '@/components/resources/parts';
import { useTable } from '@/components/table/contexte';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { useAudioCatalog, useAudioLibrary, usePreview } from '@/lib/audio';
import { cn } from '@/lib/utils';

type Library = ReturnType<typeof useAudioLibrary>;
type Preview = ReturnType<typeof usePreview>;
type Source = 'mine' | 'catalog' | 'file';

/** Sons qu'une zone peut jouer : ni YouTube, ni refusés, ni supprimés. */
export const zoneSounds = (assets: readonly Asset[]) =>
  assets.filter((a) => a.source !== 'youtube' && a.status !== 'rejected' && !a.deleted);

const KINDS: AssetKind[] = ['ambience', 'music', 'sfx'];

export function SoundPicker({
  campaignId,
  value,
  onChange,
  className,
}: {
  campaignId: string;
  value: string | null;
  onChange(asset: Asset): void;
  className?: string;
}) {
  const library = useAudioLibrary(campaignId);
  const preview = usePreview();
  const [open, setOpen] = useState(false);
  const current = library.assets.find((a) => a.id === value) ?? null;
  const playing = !!current && preview.playingId === current.id;

  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <Button
        variant="secondary"
        size="sm"
        aria-haspopup="dialog"
        aria-label="Son de la zone"
        onClick={() => setOpen(true)}
        className="min-w-0 flex-1 justify-start gap-2"
      >
        <Library className="opacity-60" />
        <span className={cn('truncate', !current && 'text-muted-foreground')}>
          {current?.name ?? (value ? 'Son introuvable' : 'Choisir un son')}
        </span>
      </Button>
      <Info texte={playing ? 'Arrêter l’écoute' : 'Écouter'}>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={playing ? 'Arrêter l’écoute' : 'Écouter'}
          disabled={!current?.url}
          onClick={() => (playing ? preview.stop() : current && preview.play(current))}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
      </Info>
      {open && (
        <SoundLibraryDialog
          library={library}
          value={value}
          onOpenChange={setOpen}
          onPick={(a) => {
            onChange(a);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

/** La bibliothèque de sons, pour choisir celui d'une zone. */
function SoundLibraryDialog({
  library,
  value,
  onOpenChange,
  onPick,
}: {
  library: Library;
  value: string | null;
  onOpenChange(open: boolean): void;
  onPick(asset: Asset): void;
}) {
  const { campagne } = useTable();
  const preview = usePreview();
  const [source, setSource] = useState<Source>('mine');

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80dvh] max-h-[640px] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Son de la zone</DialogTitle>
          <DialogDescription className="sr-only">
            Choisir un son de la bibliothèque, un son fourni ou un fichier.
          </DialogDescription>
        </DialogHeader>
        <Segmented
          label="Provenance"
          value={source}
          onChange={(v) => setSource(v as Source)}
          options={[
            { value: 'mine', label: 'Mes sons', icon: Library },
            { value: 'catalog', label: 'Fournis', icon: Package },
            { value: 'file', label: 'Fichier', icon: Upload },
          ]}
        />
        <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
          {source === 'mine' && (
            <MineList library={library} preview={preview} value={value} onPick={onPick} />
          )}
          {source === 'catalog' && (
            <CatalogList
              systemId={campagne.system}
              library={library}
              preview={preview}
              value={value}
              onPick={onPick}
            />
          )}
          {source === 'file' && (
            <FileSource
              target="ambience"
              library={library}
              ranger={async (a) => onPick(a)}
              onDone={() => undefined}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Ligne d'un son : écoute, nom et détails ; un clic le choisit. */
function PickRow({
  name,
  meta,
  kind,
  previewing,
  onPreview,
  chosen,
  busy,
  onPick,
}: {
  name: string;
  meta: string;
  kind: AssetKind;
  previewing: boolean;
  onPreview(): void;
  chosen: boolean;
  busy?: boolean;
  onPick(): void;
}) {
  const Icon = KIND_ICONS[kind];
  return (
    <li
      className={cn(
        'flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-surface-2',
        chosen && 'bg-primary/[0.06]',
      )}
    >
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
      <button
        type="button"
        onClick={onPick}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      >
        <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="block text-[11px] text-muted-foreground">{meta}</span>
        </span>
        {chosen && <Check className="size-4 shrink-0 text-primary-strong" aria-label="Choisi" />}
      </button>
    </li>
  );
}

function kindChips<T>(items: readonly T[], kindOf: (x: T) => AssetKind) {
  return [
    { value: 'all', label: 'Tous', count: items.length },
    ...KINDS.map((k) => ({
      value: k,
      label: KIND_LABELS[k],
      count: items.filter((x) => kindOf(x) === k).length,
    })).filter((c) => c.count > 0),
  ];
}

function MineList({
  library,
  preview,
  value,
  onPick,
}: {
  library: Library;
  preview: Preview;
  value: string | null;
  onPick(a: Asset): void;
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const sounds = useMemo(() => zoneSounds(library.assets), [library.assets]);
  const items = useMemo(() => {
    const q = plain(query.trim());
    return sounds
      .filter((a) => (kind === 'all' || a.kind === kind) && (!q || plain(a.name).includes(q)))
      .sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, 'fr'),
      );
  }, [sounds, query, kind]);

  return (
    <div className="space-y-2 pt-1">
      <SearchField
        value={query}
        onChange={setQuery}
        placeholder="Rechercher dans mes sons"
        label="Rechercher dans mes sons"
        className="sm:w-full"
      />
      <Chips
        label="Type"
        value={kind}
        onChange={setKind}
        options={kindChips(sounds, (a) => a.kind)}
      />
      {library.loading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">
          {sounds.length ? 'Aucun son ne correspond.' : 'La bibliothèque est vide.'}
        </p>
      ) : (
        <ul>
          {items.map((a) => (
            <PickRow
              key={a.id}
              name={a.name}
              kind={a.kind}
              meta={[
                KIND_LABELS[a.kind],
                a.status === 'processing' ? 'en préparation' : formatTime(a.durationMs),
              ].join(' · ')}
              previewing={preview.playingId === a.id}
              onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
              chosen={a.id === value}
              onPick={() => onPick(a)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CatalogList({
  systemId,
  library,
  preview,
  value,
  onPick,
}: {
  systemId: string;
  library: Library;
  preview: Preview;
  value: string | null;
  onPick(a: Asset): void;
}) {
  const catalog = useAudioCatalog(systemId);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const labels = useMemo(
    () => new Map(catalog.categories.map((c) => [c.id, c.label])),
    [catalog.categories],
  );
  const byCatalog = useMemo(
    () => new Map(library.assets.filter((a) => a.catalogId).map((a) => [a.catalogId!, a])),
    [library.assets],
  );
  const items = useMemo(() => {
    const q = plain(query.trim());
    return catalog.items
      .filter((e) => (kind === 'all' || e.kind === kind) && (!q || plain(e.name).includes(q)))
      .sort(
        (a, b) =>
          KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, 'fr'),
      );
  }, [catalog.items, query, kind]);

  async function pick(e: CatalogEntry) {
    setBusy(e.id);
    try {
      onPick(byCatalog.get(e.id) ?? (await library.addFromCatalog(e.id, { kind: e.kind })));
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
      <Chips
        label="Type"
        value={kind}
        onChange={setKind}
        options={kindChips(catalog.items, (e) => e.kind)}
      />
      {catalog.loading ? (
        <p className="py-6 text-center text-[13px] text-muted-foreground">Chargement…</p>
      ) : (
        <ul>
          {items.map((e) => (
            <PickRow
              key={e.id}
              name={e.name}
              kind={e.kind}
              meta={[labels.get(e.category), e.durationMs ? formatTime(e.durationMs) : null]
                .filter(Boolean)
                .join(' · ')}
              previewing={preview.playingId === e.id}
              onPreview={() =>
                preview.playingId === e.id
                  ? preview.stop()
                  : preview.play({ id: e.id, url: e.url, name: e.name })
              }
              chosen={!!value && byCatalog.get(e.id)?.id === value}
              busy={busy === e.id}
              onPick={() => void pick(e)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
