'use client';

/**
 * « Ajouter un son » : une seule fenêtre pour un fichier (envoyé au stockage, analysé par le
 * serveur) ou un lien YouTube, avec un nom et un type expliqué (musique, ambiance, effet).
 */
import type { AssetKind } from '@vtt/contracts';
import { FileAudio, Upload, Youtube } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { toast } from 'sonner';
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
import { ACCEPTED_AUDIO, audioContentType, type useAudioLibrary } from '@/lib/audio';
import { cn } from '@/lib/utils';
import { KIND_HINTS, KIND_ICONS, KIND_LABELS, Segmented } from './parts';

type Library = ReturnType<typeof useAudioLibrary>;
type Source = 'file' | 'youtube';

const baseName = (name: string) =>
  name
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

export function AddSoundDialog({
  library,
  open,
  onOpenChange,
  defaultKind = 'music',
}: {
  library: Library;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Type proposé d'abord (l'onglet de la bibliothèque ouvert). */
  defaultKind?: AssetKind;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<Source>('file');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AssetKind>(defaultKind);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [survol, setSurvol] = useState(false);

  const reset = () => {
    setFile(null);
    setUrl('');
    setName('');
    setProgress(null);
    setBusy(false);
    setSource('file');
    setKind(defaultKind);
    if (input.current) input.current.value = '';
  };
  const fermer = (o: boolean) => {
    if (busy) return;
    onOpenChange(o);
    if (!o) reset();
  };

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
  const deposer = (e: DragEvent) => {
    e.preventDefault();
    setSurvol(false);
    pick(e.dataTransfer.files[0]);
  };

  const pret = name.trim().length > 0 && (source === 'file' ? !!file : url.trim().length > 0);

  async function ajouter() {
    if (!pret) return;
    setBusy(true);
    try {
      if (source === 'file') {
        setProgress(0);
        await library.upload(file!, { name: name.trim(), kind }, setProgress);
        toast.success(`${name.trim()} ajouté`, {
          description: 'Analyse du fichier en cours : il sera jouable dans un instant.',
        });
      } else {
        await library.addYoutube(url.trim(), name.trim(), kind);
        toast.success(`${name.trim()} ajouté`);
      }
      setBusy(false);
      onOpenChange(false);
      reset();
    } catch (e) {
      toast.error('Ajout impossible', { description: messageErreur(e) });
      setBusy(false);
      setProgress(null);
    }
  }

  const KindIcon = KIND_ICONS[kind];

  return (
    <Dialog open={open} onOpenChange={fermer}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un son</DialogTitle>
          <DialogDescription>
            Il rejoint la bibliothèque de la campagne, visible par vous seul.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <Segmented
            label="Provenance"
            value={source}
            onChange={(v) => setSource(v as Source)}
            options={[
              { value: 'file', label: 'Fichier audio', icon: Upload },
              { value: 'youtube', label: 'Lien YouTube', icon: Youtube },
            ]}
          />

          {source === 'file' ? (
            <div>
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
                onDrop={deposer}
                disabled={busy}
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
                    <span className="text-sm font-medium">
                      Déposez un fichier ou cliquez pour choisir
                    </span>
                    <span className="text-xs text-muted-foreground">
                      mp3, m4a, ogg, opus, wav, flac…
                    </span>
                  </>
                )}
              </button>
              {progress !== null && (
                <Progress
                  className="mt-3"
                  valeur={Math.round(progress * 100)}
                  label="Envoi du fichier"
                />
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="son-lien">Lien de la vidéo</Label>
              <Input
                id="son-lien"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=…"
                autoFocus
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="son-nom">Nom</Label>
            <Input
              id="son-nom"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
              placeholder="Taverne animée, Combat épique…"
            />
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Type</p>
            <Segmented
              label="Type de son"
              value={kind}
              onChange={(v) => setKind(v as AssetKind)}
              options={(['music', 'ambience', 'sfx'] as const).map((k) => ({
                value: k,
                label: KIND_LABELS[k],
                icon: KIND_ICONS[k],
              }))}
            />
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <KindIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {KIND_HINTS[kind]}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => fermer(false)}>
            Annuler
          </Button>
          <Button disabled={!pret} loading={busy} onClick={() => void ajouter()}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
