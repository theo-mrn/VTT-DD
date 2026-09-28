'use client';

/**
 * Bibliothèque du MJ : import d'un fichier (envoi direct au stockage, analyse
 * par le serveur) ou d'un lien YouTube, recherche, tri par sorte ; chaque son
 * se lance sur la musique, sur l'ambiance, ou comme effet pour toute la table,
 * se préécoute seul, s'ajoute à une playlist, se supprime.
 */
import type { Asset, AssetKind, Playlist } from '@vtt/contracts';
import {
  AlertTriangle,
  AudioLines,
  Headphones,
  ListPlus,
  Loader2,
  Music,
  MoreHorizontal,
  Square,
  Trash2,
  Upload,
  Wind,
  Youtube,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Chips, SearchField } from '@/components/resources/parts';
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
import { Progress } from '@/components/ui/progress';
import { SelectField } from '@/components/ui/select';
import { messageErreur } from '@/lib/api';
import {
  ACCEPTED_AUDIO,
  audioContentType,
  useAudioLibrary,
  useChannel,
  usePreview,
  useSoundCues,
} from '@/lib/audio';
import { cn } from '@/lib/utils';
import { formatTime, KIND_ICONS, KIND_LABELS, KIND_OPTIONS, SectionTitle } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;

/** Sorte proposée d'après le nom et la durée inconnue : musique par défaut, effet si court. */
const guessKind = (file: File): AssetKind => (file.size < 1_500_000 ? 'sfx' : 'music');
const baseName = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

function ImportFile({ library }: { library: Library }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('music');
  const [progress, setProgress] = useState<number | null>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    if (!audioContentType(f)) {
      toast.error('Format non pris en charge', {
        description: 'Formats acceptés : mp3, m4a, aac, ogg, opus, webm, wav, flac.',
      });
      return;
    }
    setFile(f);
    setName(baseName(f.name).slice(0, 200));
    setKind(guessKind(f));
  };

  const send = async () => {
    if (!file || !name.trim()) return;
    setProgress(0);
    try {
      await library.upload(file, { name: name.trim(), kind }, setProgress);
      toast.success('Son envoyé', {
        description: 'Analyse en cours, il sera prêt dans un instant.',
      });
      setFile(null);
    } catch (e) {
      toast.error('Envoi impossible', { description: messageErreur(e) });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPTED_AUDIO}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {!file ? (
        <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
          <Upload />
          Envoyer un fichier
        </Button>
      ) : (
        <div className="w-full space-y-2 rounded-xl border border-border bg-surface-2/60 p-3">
          <p className="truncate text-[12px] text-muted-foreground">
            {file.name} · {(file.size / 1024 / 1024).toFixed(1)} Mo
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              aria-label="Nom du son"
              placeholder="Nom du son"
              className="h-9"
            />
            <SelectField
              value={kind}
              onValueChange={(v) => setKind(v as AssetKind)}
              options={KIND_OPTIONS}
              aria-label="Sorte"
              className="h-9 sm:w-36"
            />
          </div>
          {progress !== null && (
            <Progress valeur={Math.round(progress * 100)} label="Envoi du fichier" />
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={progress !== null}
              onClick={() => setFile(null)}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              loading={progress !== null}
              disabled={!name.trim()}
              onClick={() => void send()}
            >
              Envoyer
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

function ImportYoutube({ library }: { library: Library }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>('music');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    try {
      await library.addYoutube(url.trim(), name.trim(), kind);
      toast.success('Lien YouTube ajouté');
      setUrl('');
      setName('');
      setOpen(false);
    } catch (e) {
      toast.error('Lien refusé', { description: messageErreur(e) });
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <Youtube />
        Lien YouTube
      </Button>
    );
  return (
    <div className="w-full space-y-2 rounded-xl border border-border bg-surface-2/60 p-3">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        aria-label="Lien YouTube"
        placeholder="https://www.youtube.com/watch?v=…"
        className="h-9"
        autoFocus
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={name}
          maxLength={200}
          onChange={(e) => setName(e.target.value)}
          aria-label="Nom"
          placeholder="Nom affiché"
          className="h-9"
        />
        <SelectField
          value={kind}
          onValueChange={(v) => setKind(v as AssetKind)}
          options={KIND_OPTIONS}
          aria-label="Sorte"
          className="h-9 sm:w-36"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Annuler
        </Button>
        <Button
          size="sm"
          loading={busy}
          disabled={!url.trim() || !name.trim()}
          onClick={() => void add()}
        >
          Ajouter
        </Button>
      </div>
    </div>
  );
}

function AssetRow({
  asset,
  playlists,
  library,
  campaignId,
  previewing,
  onPreview,
}: {
  asset: Asset;
  playlists: Playlist[];
  library: Library;
  campaignId: string;
  previewing: boolean;
  onPreview(): void;
}) {
  const music = useChannel(campaignId, 'music');
  const ambience = useChannel(campaignId, 'ambience');
  const cues = useSoundCues(campaignId);
  const [confirm, setConfirm] = useState(false);
  const ready = asset.status === 'ready';
  const Icon = KIND_ICONS[asset.kind];
  const run = (label: string, p: Promise<unknown>) =>
    p.catch((e) => toast.error(label, { description: messageErreur(e) }));

  return (
    <li className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium" title={asset.name}>
          {asset.name}
        </p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {KIND_LABELS[asset.kind]}
          {asset.source === 'youtube' && <span>· YouTube</span>}
          {asset.durationMs && (
            <span className="tabular-nums">· {formatTime(asset.durationMs)}</span>
          )}
          {asset.status === 'processing' && (
            <span className="inline-flex items-center gap-1">
              · <Loader2 className="size-3 animate-spin" aria-hidden /> Analyse…
            </span>
          )}
          {asset.status === 'rejected' && (
            <span
              className="inline-flex items-center gap-1 text-destructive"
              title={asset.rejectReason ?? ''}
            >
              · <AlertTriangle className="size-3" aria-hidden /> Refusé
            </span>
          )}
        </p>
      </div>
      {ready && asset.kind === 'sfx' && (
        <Button
          variant="secondary"
          size="xs"
          onClick={() => void run('Effet impossible', cues.play(asset))}
          aria-label={`Jouer ${asset.name} pour la table`}
        >
          <AudioLines />
          Jouer
        </Button>
      )}
      {ready && asset.kind !== 'sfx' && (
        <Button
          variant="secondary"
          size="xs"
          onClick={() =>
            void run(
              'Lecture impossible',
              (asset.kind === 'ambience' ? ambience : music).play({ assetId: asset.id }),
            )
          }
          aria-label={`Lancer ${asset.name} pour la table`}
        >
          {asset.kind === 'ambience' ? <Wind /> : <Music />}
          Lancer
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        disabled={!ready}
        aria-label={previewing ? 'Arrêter la préécoute' : `Préécouter ${asset.name} (moi seul)`}
        aria-pressed={previewing}
        onClick={onPreview}
        className={cn(previewing && 'text-primary-strong')}
      >
        {previewing ? <Square /> : <Headphones />}
      </Button>
      <DropdownMenu onOpenChange={(o) => !o && setConfirm(false)}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`Plus d’actions pour ${asset.name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {ready && (
            <>
              <DropdownMenuItem
                onSelect={() => void run('Lecture impossible', music.play({ assetId: asset.id }))}
              >
                <Music /> Lancer en musique
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void run('Lecture impossible', ambience.play({ assetId: asset.id }))
                }
              >
                <Wind /> Lancer en ambiance
              </DropdownMenuItem>
              {asset.kind !== 'sfx' && (
                <DropdownMenuItem onSelect={() => void run('Effet impossible', cues.play(asset))}>
                  <AudioLines /> Jouer comme effet
                </DropdownMenuItem>
              )}
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
                  onSelect={() =>
                    void run(
                      'Ajout impossible',
                      library.updatePlaylist(p.id, { assetIds: [...p.assetIds, asset.id] }),
                    )
                  }
                >
                  <ListPlus /> {p.name}
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={(e) => {
              if (!confirm) {
                e.preventDefault();
                setConfirm(true);
                return;
              }
              void run('Suppression impossible', library.remove(asset.id));
            }}
          >
            <Trash2 /> {confirm ? 'Confirmer la suppression' : 'Supprimer'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

export function LibraryTab({ campaignId, library }: { campaignId: string; library: Library }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<'all' | AssetKind>('all');
  const preview = usePreview();
  const cues = useSoundCues(campaignId);

  const filtered = useMemo(() => {
    const q = query.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    return library.assets
      .filter((a) => kind === 'all' || a.kind === kind)
      .filter((a) => !q || a.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [library.assets, query, kind]);

  const counts = useMemo(() => {
    const c = { all: library.assets.length, music: 0, ambience: 0, sfx: 0 };
    for (const a of library.assets) c[a.kind] += 1;
    return c;
  }, [library.assets]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <ImportFile library={library} />
        <ImportYoutube library={library} />
      </div>
      <div className="flex flex-col gap-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Rechercher un son"
          label="Rechercher un son"
          className="sm:w-full"
        />
        <Chips
          label="Sorte de son"
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: 'all', label: 'Tout', count: counts.all },
            { value: 'music', label: 'Musique', count: counts.music },
            { value: 'ambience', label: 'Ambiance', count: counts.ambience },
            { value: 'sfx', label: 'Effets', count: counts.sfx },
          ]}
        />
      </div>
      {cues.active.length > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-[13px]">
          <span>
            {cues.active.length} effet{cues.active.length > 1 ? 's' : ''} en cours
          </span>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void cues.stopAll().catch(() => undefined)}
          >
            <Square />
            Tout arrêter
          </Button>
        </div>
      )}
      <SectionTitle>
        {filtered.length} son{filtered.length > 1 ? 's' : ''}
      </SectionTitle>
      {library.loading ? (
        <p className="text-[13px] text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-[13px] text-muted-foreground">
          {library.assets.length
            ? 'Aucun son ne correspond.'
            : 'La bibliothèque est vide : envoyez un fichier, collez un lien YouTube ou puisez dans le catalogue.'}
        </p>
      ) : (
        <ul className="-mx-2">
          {filtered.map((a) => (
            <AssetRow
              key={a.id}
              asset={a}
              playlists={library.playlists}
              library={library}
              campaignId={campaignId}
              previewing={preview.playingId === a.id}
              onPreview={() => (preview.playingId === a.id ? preview.stop() : preview.play(a))}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
