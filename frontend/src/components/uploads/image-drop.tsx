'use client';

/**
 * Zone d'envoi d'une image ou d'une vidéo, commune à toute l'app (docs/uploads.md) :
 * glisser-déposer, clic pour choisir, coller une image (presse-papiers) ou une adresse web,
 * recadrage au format de l'usage (portrait, avatar…), progression de l'envoi avec
 * annulation, erreurs claires. Le fichier part directement au stockage (Uppy, route commune
 * `POST …/uploads`), compressé en WebP ; `onChange` reçoit son adresse publique.
 */
import {
  UPLOAD_EXTENSIONS,
  UPLOAD_USAGES,
  type UploadUsage,
  type UploadUsageId,
} from '@vtt/contracts';
import { CloudUpload, Crop, ImageOff, Link2, Loader2, RefreshCw, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { fetchImage, isProcessable, MAX_SIDE, type CropArea } from '@/lib/uploads/image';
import { prepareUpload } from '@/lib/uploads/prepare';
import { uploadFile, type UploadProgress, type UploadTarget } from '@/lib/uploads/uploader';
import { cn } from '@/lib/utils';
import { DotsBackdrop } from '../combat/backdrop';

type Phase =
  | { kind: 'idle' }
  | { kind: 'crop'; file: File; src: string }
  | {
      kind: 'upload';
      name: string;
      preview: string | null;
      /** Conversion d'une vidéo avant l'envoi, de 0 à 1 ; null : pas de conversion en cours. */
      encoding: number | null;
      progress: UploadProgress | null;
    }
  | { kind: 'error'; message: string; retry: File | null };

const MB = 1024 * 1024;
/** Adresse web, ou chemin de la bibliothèque du site (« /bibliotheque/… »). */
const ADDRESS = /^(https?:\/\/\S+|\/[^/\s]\S*)$/i;
const fmtSize = (n: number) =>
  n >= MB ? `${(n / MB).toFixed(1)} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;

export function ImageDrop({
  target,
  usage,
  value,
  onChange,
  className,
  label,
  cropAspect,
  disabled = false,
}: {
  target: UploadTarget | null;
  usage: UploadUsageId;
  value: string | null;
  onChange(url: string | null): void;
  className?: string;
  /** Libellé accessible (défaut : celui de l'usage). */
  label?: string;
  /** Format du recadrage ; défaut : celui de l'usage (null : pas de recadrage). */
  cropAspect?: number | null;
  disabled?: boolean;
}) {
  const u: UploadUsage = UPLOAD_USAGES[usage];
  const aspect = cropAspect === undefined ? u.aspect : cropAspect;
  const name = label ?? u.label;
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [dragging, setDragging] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const busy = phase.kind === 'upload';
  const accept = u.types.join(',');
  const video = value ? /\.(webm|mp4)(\?|$)/i.test(value) : false;

  // Aperçus locaux libérés quand ils changent ou au départ du composant
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const all = previews.current;
    return () => {
      abort.current?.abort();
      all.forEach((p) => URL.revokeObjectURL(p));
    };
  }, []);
  const objectUrl = (f: Blob) => {
    const p = URL.createObjectURL(f);
    previews.current.add(p);
    return p;
  };

  async function send(file: File, crop: CropArea | null = null) {
    if (!target) return setPhase({ kind: 'error', message: 'Envoi impossible ici', retry: null });
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({
      kind: 'upload',
      name: file.name,
      preview: file.type.startsWith('image/') ? objectUrl(file) : null,
      encoding: null,
      progress: null,
    });
    try {
      const ready = await prepareUpload(file, usage, {
        crop,
        signal: ctrl.signal,
        onEncode: (encoding) => setPhase((p) => (p.kind === 'upload' ? { ...p, encoding } : p)),
      });
      setPhase((p) => (p.kind === 'upload' ? { ...p, encoding: null } : p));
      const publicUrl = await uploadFile(target, usage, ready, {
        signal: ctrl.signal,
        onProgress: (progress) => setPhase((p) => (p.kind === 'upload' ? { ...p, progress } : p)),
      });
      onChange(publicUrl);
      setPhase({ kind: 'idle' });
    } catch (err) {
      if (ctrl.signal.aborted) return setPhase({ kind: 'idle' });
      setPhase({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Envoi impossible',
        retry: file,
      });
    } finally {
      abort.current = null;
    }
  }

  /** Un fichier choisi, déposé ou collé : recadrage d'abord si l'usage en a un. */
  function take(file: File | null | undefined) {
    if (!file || disabled || busy) return;
    if (!(u.types as readonly string[]).includes(file.type))
      return setPhase({
        kind: 'error',
        message: `Format non accepté (${u.types.map((t) => UPLOAD_EXTENSIONS[t].toUpperCase()).join(', ')})`,
        retry: null,
      });
    if (aspect !== null && isProcessable(file.type))
      return setPhase({ kind: 'crop', file, src: objectUrl(file) });
    void send(file);
  }

  async function fromUrl() {
    const address = url.trim();
    if (!ADDRESS.test(address)) return;
    setUrlMode(false);
    setUrl('');
    // Chemin de la bibliothèque du site : gardé tel quel
    if (address.startsWith('/')) return onChange(address);
    const file = await fetchImage(address);
    // Le site refuse le téléchargement (CORS) : l'adresse est gardée telle quelle
    if (file) take(file);
    else onChange(address);
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    take(e.dataTransfer.files?.[0]);
  };
  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files][0];
    if (file) {
      e.preventDefault();
      return take(file);
    }
    const text = e.clipboardData.getData('text').trim();
    if (/^https?:\/\/\S+$/i.test(text)) {
      e.preventDefault();
      setUrl(text);
      setUrlMode(true);
    }
  };

  const ratio = aspect ?? (value ? undefined : 16 / 9);

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label={`${name} : glisser une image, coller, ou choisir un fichier`}
        aria-disabled={disabled || undefined}
        onClick={() => !busy && !disabled && input.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !busy) {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onPaste={onPaste}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
        }}
        onDrop={onDrop}
        style={ratio ? { aspectRatio: String(ratio) } : undefined}
        className={cn(
          'group relative isolate grid min-h-32 w-full cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed text-center transition-[border-color,box-shadow,background-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          dragging
            ? 'border-primary bg-primary/10 shadow-glow'
            : value
              ? 'border-transparent'
              : 'border-border-strong bg-surface/40 hover:border-primary/60 hover:bg-surface/70',
          disabled && 'pointer-events-none opacity-60',
        )}
      >
        {!value && <DotsBackdrop />}
        {value &&
          (video ? (
            <video
              src={value}
              muted
              loop
              autoPlay
              playsInline
              className="absolute inset-0 -z-10 size-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
          ))}

        <AnimatePresence mode="wait" initial={false}>
          {busy ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 grid place-items-center bg-background/85"
            >
              {phase.preview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={phase.preview}
                  alt=""
                  className="absolute inset-0 -z-10 size-full object-cover opacity-40"
                />
              )}
              <UploadMeter
                progress={phase.progress}
                encoding={phase.encoding}
                onCancel={() => abort.current?.abort()}
              />
            </motion.div>
          ) : !value ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none flex flex-col items-center gap-2 px-4 py-6"
            >
              <motion.span
                animate={dragging ? { y: -4, scale: 1.08 } : { y: 0, scale: 1 }}
                className="grid size-11 place-items-center rounded-2xl border border-border-strong bg-card text-primary shadow-surface"
              >
                <CloudUpload className="size-5" aria-hidden />
              </motion.span>
              <span className="text-sm font-medium">{dragging ? 'Déposez ici' : name}</span>
              <span className="text-[11px] text-subtle">
                {u.types.map((t) => UPLOAD_EXTENSIONS[t].toUpperCase()).join(' · ')} ·{' '}
                {fmtSize(u.maxBytes)}
              </span>
            </motion.div>
          ) : (
            <motion.div
              key="value"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-end justify-end gap-1 bg-gradient-to-t from-background/70 via-transparent to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            >
              <span className="mr-auto self-end rounded-lg bg-background/80 px-2 py-1 text-[11px] font-medium">
                Remplacer
              </span>
              <Info texte="Retirer">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  aria-label={`Retirer ${name.toLowerCase()}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(null);
                  }}
                >
                  <Trash2 />
                </Button>
              </Info>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          ref={input}
          id={inputId}
          type="file"
          accept={accept}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            take(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      {/* Adresse web, ou erreur de l'envoi */}
      <div className="flex min-h-8 items-center gap-2">
        {phase.kind === 'error' ? (
          <p
            role="alert"
            className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-destructive"
          >
            <ImageOff className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{phase.message}</span>
            {phase.retry && (
              <Button
                type="button"
                size="xs"
                variant="ghost"
                onClick={() => void send(phase.retry!)}
              >
                <RefreshCw /> Réessayer
              </Button>
            )}
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Fermer"
              onClick={() => setPhase({ kind: 'idle' })}
            >
              <X />
            </Button>
          </p>
        ) : urlMode ? (
          <form
            className="flex flex-1 items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              void fromUrl();
            }}
          >
            <Input
              autoFocus
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              aria-label="Adresse de l’image"
              className="h-8 text-xs"
            />
            <Button type="submit" size="xs" disabled={!ADDRESS.test(url.trim())}>
              Ajouter
            </Button>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label="Annuler"
              onClick={() => setUrlMode(false)}
            >
              <X />
            </Button>
          </form>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="text-muted-foreground"
            disabled={disabled || busy}
            onClick={() => setUrlMode(true)}
          >
            <Link2 /> Coller une adresse
          </Button>
        )}
      </div>

      <CropDialog
        phase={phase}
        aspect={aspect}
        title={name}
        onCancel={() => setPhase({ kind: 'idle' })}
        onDone={(file, area) => void send(file, area)}
      />
    </div>
  );
}

/** Progression de l'envoi : anneau, pourcentage, octets, annuler. */
function UploadMeter({
  progress,
  encoding,
  onCancel,
}: {
  progress: UploadProgress | null;
  /** Conversion d'une vidéo avant l'envoi (0 à 1). */
  encoding: number | null;
  onCancel(): void;
}) {
  const p = progress?.progress ?? encoding ?? 0;
  const shown = progress !== null || encoding !== null;
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative grid size-16 place-items-center">
        <svg viewBox="0 0 52 52" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r={r} fill="none" strokeWidth="4" className="stroke-border" />
          <motion.circle
            cx="26"
            cy="26"
            r={r}
            fill="none"
            strokeWidth="4"
            strokeLinecap="round"
            className="stroke-primary"
            strokeDasharray={c}
            animate={{ strokeDashoffset: c * (1 - p) }}
            transition={{ duration: 0.2 }}
          />
        </svg>
        {shown ? (
          <span className="font-mono text-sm font-bold tabular-nums">{Math.round(p * 100)}%</span>
        ) : (
          <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
        )}
      </div>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums" aria-live="polite">
        {progress
          ? `${fmtSize(progress.bytesUploaded)} / ${fmtSize(progress.bytesTotal)}`
          : encoding !== null
            ? 'Conversion…'
            : 'Préparation…'}
      </span>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        onClick={(e) => {
          e.stopPropagation();
          onCancel();
        }}
      >
        <X /> Annuler
      </Button>
    </div>
  );
}

/** Recadrage au format de l'usage : glisser pour cadrer, molette ou curseur pour zoomer. */
function CropDialog({
  phase,
  aspect,
  title,
  onCancel,
  onDone,
}: {
  phase: Phase;
  aspect: number | null;
  title: string;
  onCancel(): void;
  onDone(file: File, area: CropArea): void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const open = phase.kind === 'crop';
  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      {phase.kind === 'crop' && (
        <DialogContent className="isolate gap-0 overflow-hidden p-0 sm:max-w-lg">
          <DotsBackdrop />
          <div className="flex items-center gap-2 px-5 pb-3 pt-5">
            <Crop className="size-4 text-primary" aria-hidden />
            <DialogTitle className="text-base">Recadrer : {title.toLowerCase()}</DialogTitle>
            <DialogDescription className="sr-only">
              Glissez pour cadrer, zoomez avec la molette ou le curseur.
            </DialogDescription>
          </div>
          <div className="relative h-80 bg-background">
            <Cropper
              image={phase.src}
              crop={crop}
              zoom={zoom}
              aspect={aspect ?? 1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, px) => setArea(px)}
              showGrid={false}
              objectFit="contain"
            />
          </div>
          <div className="flex items-center gap-3 px-5 py-4">
            <Slider
              value={[zoom]}
              min={1}
              max={4}
              step={0.01}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              aria-label="Zoom"
              className="flex-1"
            />
            <Button type="button" variant="ghost" onClick={onCancel}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!area}
              onClick={() =>
                area &&
                onDone(phase.file, {
                  x: Math.round(area.x),
                  y: Math.round(area.y),
                  width: Math.round(area.width),
                  height: Math.round(area.height),
                })
              }
            >
              Envoyer
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
