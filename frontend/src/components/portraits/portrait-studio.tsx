'use client';

/**
 * Studio du portrait d'un personnage (docs/portraits.md) : une image d'origine (déposée, collée,
 * choisie dans la bibliothèque), deux cadrages (portrait 3:4, token carré), le token réglé
 * (cadre parmi ceux de la bibliothèque, arrondi du carré au cercle, marge), aperçus en direct
 * aux tailles de la carte et de la fiche. « Enregistrer » fabrique les images dans le
 * navigateur, les envoie au stockage et les enregistre avec les réglages, pour y revenir.
 */
import {
  DEFAULT_PORTRAIT_STUDIO,
  type PortraitStudio as Studio,
  type StudioCrop,
} from '@vtt/contracts';
import { Ban, CloudUpload, Library, RotateCcw, Square, Circle, UserSquare2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { messageErreur } from '@/lib/api';
import { portraitsParDossier, useAssets, type Asset } from '@/lib/assets';
import {
  centeredPortrait,
  centeredSquare,
  composePortrait,
  composeToken,
  loadBitmap,
} from '@/lib/portraits/compose';
import { MAX_SIDE, prepareImage } from '@/lib/uploads/image';
import { uploadFile } from '@/lib/uploads/uploader';
import { cn } from '@/lib/utils';
import { DotsBackdrop } from '../combat/backdrop';

type Tab = 'token' | 'portrait';
type Source = { file: File; url: string } | { url: string; file?: undefined };

export interface StudioResult {
  portraitUrl: string;
  tokenUrl: string;
  studio: Studio;
}

const ASPECT: Record<Tab, number> = { token: 1, portrait: 3 / 4 };

/** Cadres de token de la bibliothèque, dans l'ordre de leur numéro. */
function framesOf(assets: readonly Asset[]) {
  const n = (a: Asset) => Number(/(\d+)/.exec(a.name)?.[1] ?? 0);
  return assets
    .filter((a) => a.category === 'Token' && a.type === 'image')
    .sort((a, b) => n(a) - n(b));
}

/** Aperçu CSS d'un cadrage : l'image placée pour ne montrer que la zone gardée. */
function cropStyle(url: string, crop: StudioCrop | null): CSSProperties {
  const c = crop ?? { x: 0, y: 0, width: 1, height: 1 };
  const pos = (start: number, size: number) => (size >= 1 ? 0 : (start / (1 - size)) * 100);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${100 / c.width}% ${100 / c.height}%`,
    backgroundPosition: `${pos(c.x, c.width)}% ${pos(c.y, c.height)}%`,
    backgroundRepeat: 'no-repeat',
  };
}

export function PortraitStudio({
  open,
  onOpenChange,
  characterId,
  name,
  current,
  onSave,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  characterId: string;
  name: string;
  /** Ce qui est enregistré aujourd'hui. */
  current: { portraitUrl: string | null; studio: Studio | null };
  /** Enregistre les images envoyées et les réglages (PATCH du personnage). */
  onSave(r: StudioResult): Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open && (
        <DialogContent className="isolate flex h-[min(100dvh,52rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[78rem] sm:rounded-[1.75rem]">
          <Body
            characterId={characterId}
            name={name}
            current={current}
            onSave={onSave}
            onClose={() => onOpenChange(false)}
          />
        </DialogContent>
      )}
    </Dialog>
  );
}

function Body({
  characterId,
  name,
  current,
  onSave,
  onClose,
}: {
  characterId: string;
  name: string;
  current: { portraitUrl: string | null; studio: Studio | null };
  onSave(r: StudioResult): Promise<void>;
  onClose(): void;
}) {
  const initial = current.studio ?? DEFAULT_PORTRAIT_STUDIO;
  const firstUrl = initial.source ?? current.portraitUrl;
  const [source, setSource] = useState<Source | null>(firstUrl ? { url: firstUrl } : null);
  const [tab, setTab] = useState<Tab>('token');
  const [crops, setCrops] = useState<Record<Tab, StudioCrop | null>>({
    token: initial.token,
    portrait: initial.portrait,
  });
  const [radius, setRadius] = useState(initial.radius);
  const [inset, setInset] = useState(initial.inset);
  const [frame, setFrame] = useState<string | null>(initial.frame);
  const [saving, setSaving] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);
  // Une nouvelle image repart des cadrages par défaut (réglés à son chargement)
  const [fresh, setFresh] = useState(false);

  const pick = (s: Source) => {
    setSource(s);
    setCrops({ token: null, portrait: null });
    setFresh(true);
    setLibrary(false);
  };

  // Aperçus locaux libérés au départ
  const objectUrls = useRef(new Set<string>());
  useEffect(() => {
    const all = objectUrls.current;
    return () => all.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const fromFile = (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/') || file.type === 'image/gif') {
      if (file) toast.error('Choisissez une image fixe (PNG, JPEG, WebP, AVIF).');
      return;
    }
    const url = URL.createObjectURL(file);
    objectUrls.current.add(url);
    pick({ file, url });
  };

  async function save() {
    if (!source) return;
    try {
      setSaving('Préparation des images…');
      const bitmap = await loadBitmap(source.file ?? source.url);
      const token = crops.token ?? centeredSquare(bitmap.width, bitmap.height);
      const portrait = crops.portrait ?? centeredPortrait(bitmap.width, bitmap.height);
      const frameBitmap = frame ? await loadBitmap(frame) : null;
      const slug =
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 40) || 'personnage';
      const [portraitFile, tokenFile] = await Promise.all([
        composePortrait(bitmap, portrait, slug),
        composeToken(bitmap, { token, radius, inset }, frameBitmap, slug),
      ]);
      const target = { kind: 'character' as const, id: characterId };
      // L'image d'origine n'est envoyée qu'une fois (déposée ici) ; sinon son adresse est gardée
      let sourceUrl = source.url;
      if (source.file) {
        setSaving('Envoi de l’image d’origine…');
        const ready = await prepareImage(source.file, { maxSide: 2400 });
        sourceUrl = await uploadFile(target, 'portrait', ready);
      }
      setSaving('Envoi du portrait et du token…');
      const [portraitUrl, tokenUrl] = await Promise.all([
        uploadFile(
          target,
          'portrait',
          await prepareImage(portraitFile, { maxSide: MAX_SIDE.portrait }),
        ),
        uploadFile(target, 'token', tokenFile),
      ]);
      setSaving('Enregistrement…');
      await onSave({
        portraitUrl,
        tokenUrl,
        studio: { source: sourceUrl, portrait, token, frame, radius, inset },
      });
      toast.success('Portrait et token enregistrés');
      onClose();
    } catch (err) {
      toast.error('Le portrait n’a pas pu être enregistré', { description: messageErreur(err) });
    } finally {
      setSaving(null);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    fromFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onPaste={(e) => fromFile([...e.clipboardData.files][0])}
    >
      <DotsBackdrop />
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid size-9 place-items-center rounded-xl border border-border-strong bg-card text-primary">
          <UserSquare2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate font-display text-lg">Studio du portrait</DialogTitle>
          <DialogDescription className="truncate text-xs">{name}</DialogDescription>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_22rem]">
        {/* Cadrage */}
        <section className="flex min-h-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              className="flex rounded-xl border border-border bg-background/50 p-1"
            >
              {(['token', 'portrait'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors',
                    tab === t
                      ? 'bg-primary text-primary-foreground shadow-glow'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t === 'token' ? 'Token' : 'Portrait'}
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <SourceButtons
              onFile={fromFile}
              onLibrary={() => setLibrary((v) => !v)}
              libraryOpen={library}
            />
          </div>

          <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-2xl border border-border bg-background/80">
            <AnimatePresence mode="wait" initial={false}>
              {library ? (
                <motion.div
                  key="library"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <LibraryGrid onPick={(url) => pick({ url })} />
                </motion.div>
              ) : source ? (
                <motion.div
                  key={`${tab}-${source.url}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0"
                >
                  <CropArea
                    url={source.url}
                    aspect={ASPECT[tab]}
                    round={tab === 'token' && radius >= 40}
                    initial={fresh ? null : crops[tab]}
                    onChange={(c) => setCrops((x) => ({ ...x, [tab]: c }))}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="absolute inset-0 grid place-items-center"
                >
                  <div className="flex flex-col items-center gap-2 text-center">
                    <span className="grid size-12 place-items-center rounded-2xl border border-border-strong bg-card text-primary shadow-surface">
                      <CloudUpload className="size-5" aria-hidden />
                    </span>
                    <span className="text-sm font-medium">Déposez ou collez une image</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Réglages du token et aperçus */}
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto border-t border-border p-4 sm:p-5 lg:border-l lg:border-t-0 [scrollbar-width:thin]">
          <Previews
            url={source?.url ?? null}
            token={crops.token}
            portrait={crops.portrait}
            radius={radius}
            inset={inset}
            frame={frame}
          />
          <SliderRow
            label="Arrondi"
            icon={radius >= 40 ? <Circle /> : <Square />}
            value={radius}
            max={50}
            onChange={setRadius}
            format={(v) => (v >= 50 ? 'Cercle' : v === 0 ? 'Carré' : `${Math.round(v)} %`)}
          />
          <SliderRow
            label="Marge"
            value={inset}
            max={30}
            onChange={setInset}
            format={(v) => `${Math.round(v)} %`}
          />
          <FrameGallery value={frame} onChange={setFrame} />
        </aside>
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Info texte="Revenir aux cadrages centrés">
          <Button
            variant="ghost"
            size="sm"
            disabled={!source || Boolean(saving)}
            onClick={() => {
              setCrops({ token: null, portrait: null });
              setFresh(true);
            }}
          >
            <RotateCcw /> Recentrer
          </Button>
        </Info>
        <span className="flex-1" />
        <AnimatePresence>
          {saving && (
            <motion.span
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
              aria-live="polite"
            >
              {saving}
            </motion.span>
          )}
        </AnimatePresence>
        <Button variant="ghost" onClick={onClose} disabled={Boolean(saving)}>
          Annuler
        </Button>
        <Button
          onClick={() => void save()}
          loading={Boolean(saving)}
          disabled={!source}
          className="min-w-[9rem] shadow-glow"
        >
          Enregistrer
        </Button>
      </footer>
    </div>
  );
}

function SourceButtons({
  onFile,
  onLibrary,
  libraryOpen,
}: {
  onFile(f: File | undefined): void;
  onLibrary(): void;
  libraryOpen: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1.5">
      <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
        <CloudUpload /> Importer
      </Button>
      <Button
        variant={libraryOpen ? 'default' : 'secondary'}
        size="sm"
        aria-pressed={libraryOpen}
        onClick={onLibrary}
      >
        <Library /> Bibliothèque
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="sr-only"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Cadrage : glisser pour placer, molette ou curseur pour zoomer. */
function CropArea({
  url,
  aspect,
  round,
  initial,
  onChange,
}: {
  url: string;
  aspect: number;
  round: boolean;
  initial: StudioCrop | null;
  onChange(c: StudioCrop): void;
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const start = useMemo(
    () =>
      initial
        ? {
            x: initial.x * 100,
            y: initial.y * 100,
            width: initial.width * 100,
            height: initial.height * 100,
          }
        : undefined,
    // Seulement à l'ouverture de ce cadrage
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [url, aspect],
  );
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="relative min-h-0 flex-1">
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          cropShape={round ? 'round' : 'rect'}
          showGrid={false}
          maxZoom={5}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          {...(start ? { initialCroppedAreaPercentages: start } : {})}
          onCropComplete={(pct) =>
            onChange({
              x: clamp01(pct.x / 100),
              y: clamp01(pct.y / 100),
              width: Math.min(1, Math.max(0.001, pct.width / 100)),
              height: Math.min(1, Math.max(0.001, pct.height / 100)),
            })
          }
          mediaProps={{ crossOrigin: 'anonymous' }}
        />
      </div>
      <div className="flex items-center gap-3 border-t border-border bg-card/80 px-4 py-2.5 backdrop-blur">
        <span className="text-xs text-muted-foreground">Zoom</span>
        <Slider
          value={[zoom]}
          min={1}
          max={5}
          step={0.01}
          onValueChange={(v) => setZoom(v[0] ?? 1)}
          aria-label="Zoom"
          className="flex-1"
        />
      </div>
    </div>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Aperçus : le token sur la carte (trois tailles), le portrait de la fiche. */
function Previews({
  url,
  token,
  portrait,
  radius,
  inset,
  frame,
}: {
  url: string | null;
  token: StudioCrop | null;
  portrait: StudioCrop | null;
  radius: number;
  inset: number;
  frame: string | null;
}) {
  const tokenAt = (size: number) => (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {url && (
        <div
          className="absolute overflow-hidden"
          style={{
            inset: `${inset}%`,
            borderRadius: `${radius}%`,
            ...cropStyle(url, token),
          }}
        />
      )}
      {frame && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={frame} alt="" className="pointer-events-none absolute inset-0 size-full" />
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <div className="relative isolate flex items-end justify-center gap-3 overflow-hidden rounded-2xl border border-border bg-surface-3/60 p-3">
        <span aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-80" />
        {tokenAt(40)}
        {tokenAt(64)}
        {tokenAt(112)}
      </div>
      <div
        className="w-20 overflow-hidden rounded-xl border border-border bg-surface-3/60"
        style={{ aspectRatio: '3 / 4', ...(url ? cropStyle(url, portrait) : {}) }}
        aria-label="Aperçu du portrait"
      />
    </div>
  );
}

function SliderRow({
  label,
  icon,
  value,
  max,
  onChange,
  format,
}: {
  label: string;
  icon?: React.ReactNode;
  value: number;
  max: number;
  onChange(v: number): void;
  format(v: number): string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {icon && <span className="text-subtle [&_svg]:size-3.5">{icon}</span>}
        <span className="ml-auto font-mono tabular-nums text-muted-foreground">
          {format(value)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={max}
        step={1}
        onValueChange={(v) => onChange(v[0] ?? 0)}
        aria-label={label}
      />
    </div>
  );
}

/** Galerie des cadres de la bibliothèque, chargés à mesure du défilement. */
function FrameGallery({
  value,
  onChange,
}: {
  value: string | null;
  onChange(v: string | null): void;
}) {
  const assets = useAssets();
  const frames = useMemo(() => framesOf(assets.data ?? []), [assets.data]);
  return (
    <div className="space-y-2">
      <div className="flex items-center text-xs">
        <span className="font-medium">Cadre</span>
        <span className="ml-auto text-subtle tabular-nums">{frames.length}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <FrameTile selected={value === null} onClick={() => onChange(null)} label="Aucun cadre">
          <Ban className="size-5 text-subtle" aria-hidden />
        </FrameTile>
        {frames.map((f) => (
          <FrameTile
            key={f.path}
            selected={value === f.path}
            onClick={() => onChange(f.path)}
            label={f.name.replace(/\.[^.]+$/, '')}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.path}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-contain"
            />
          </FrameTile>
        ))}
      </div>
    </div>
  );
}

function FrameTile({
  selected,
  onClick,
  label,
  children,
}: {
  selected: boolean;
  onClick(): void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Info texte={label}>
      <button
        type="button"
        aria-pressed={selected}
        aria-label={label}
        onClick={onClick}
        className={cn(
          'grid aspect-square place-items-center rounded-xl border bg-background/40 p-1 transition-[border-color,box-shadow,transform] duration-150 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          selected ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
        )}
      >
        {children}
      </button>
    </Info>
  );
}

/** Portraits de la bibliothèque, par dossier. */
function LibraryGrid({ onPick }: { onPick(url: string): void }) {
  const assets = useAssets();
  const folders = useMemo(() => portraitsParDossier(assets.data ?? []), [assets.data]);
  const names = [...folders.keys()].sort((a, b) => a.localeCompare(b, 'fr'));
  const [folder, setFolder] = useState<string | null>(null);
  const active = folder ?? names[0] ?? null;
  const list = active ? (folders.get(active) ?? []) : [];
  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setFolder(n)}
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors',
              n === active
                ? 'border-primary/50 bg-primary/15 text-primary-strong'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(6rem,1fr))] content-start gap-2 overflow-y-auto p-3 [scrollbar-width:thin]">
        {list.map((a) => (
          <button
            key={a.path}
            type="button"
            onClick={() => onPick(a.path)}
            className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-border transition-[border-color,transform] hover:scale-[1.02] hover:border-primary/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.path}
              alt=""
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
