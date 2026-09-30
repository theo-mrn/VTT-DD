'use client';

/**
 * Studio du portrait d'un personnage (docs/portraits.md) : une image d'origine (déposée, collée,
 * choisie dans la bibliothèque), deux cadrages (token carré, portrait 3:4), le token réglé
 * (cadre parmi ceux de la bibliothèque, arrondi du carré au cercle, marge), aperçus en direct.
 * L'image est chargée une fois (copie locale) : elle sert au cadrage, aux aperçus et à la
 * fabrication. « Enregistrer » fabrique les images, les envoie et les enregistre avec les
 * réglages, pour rouvrir le Studio tel qu'il était.
 */
import {
  DEFAULT_PORTRAIT_STUDIO,
  type PortraitStudio as Studio,
  type StudioCrop,
} from '@vtt/contracts';
import {
  Ban,
  Circle,
  CloudUpload,
  ImageOff,
  Library,
  Loader2,
  RotateCcw,
  Square,
  UserSquare2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
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
  loadImage,
  type LoadedImage,
} from '@/lib/portraits/compose';
import { MAX_SIDE, prepareImage } from '@/lib/uploads/image';
import { importFile, uploadFile } from '@/lib/uploads/uploader';
import { cn } from '@/lib/utils';
import { DotsBackdrop } from '../combat/backdrop';

type Tab = 'token' | 'portrait';
/** Image d'origine : fichier déposé ici, ou adresse déjà en ligne. */
type Source = { file: File; remote?: undefined } | { remote: string; file?: undefined };
type Loaded =
  | { status: 'loading' }
  | { status: 'ready'; image: LoadedImage; remote: string | null }
  | { status: 'error'; message: string };

export interface StudioResult {
  portraitUrl: string;
  tokenUrl: string;
  studio: Studio;
}

const ASPECT: Record<Tab, number> = { token: 1, portrait: 3 / 4 };
const ACCEPT = 'image/png,image/jpeg,image/webp,image/avif';

/** Cadres de token de la bibliothèque, dans l'ordre de leur numéro. */
function framesOf(assets: readonly Asset[]) {
  const n = (a: Asset) => Number(/(\d+)/.exec(a.name)?.[1] ?? 0);
  return assets
    .filter((a) => a.category === 'Token' && a.type === 'image')
    .sort((a, b) => n(a) - n(b));
}

/** Aperçu CSS d'un cadrage : l'image placée pour ne montrer que la zone gardée. */
function cropStyle(url: string, c: StudioCrop): CSSProperties {
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
  ...rest
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
        <DialogContent className="isolate flex h-[min(100dvh,52rem)] max-w-none select-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[76rem] sm:rounded-[1.75rem]">
          <Body {...rest} onClose={() => onOpenChange(false)} />
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
  const [source, setSource] = useState<Source | null>(firstUrl ? { remote: firstUrl } : null);
  const loaded = useLoadedImage(source, characterId);
  const [tab, setTab] = useState<Tab>('token');
  const [crops, setCrops] = useState<Record<Tab, StudioCrop | null>>({
    token: initial.token,
    portrait: initial.portrait,
  });
  // Change à chaque nouvelle image ou « Recentrer » : le cadrage repart de `crops`
  const [cropKey, setCropKey] = useState(0);
  const [radius, setRadius] = useState(initial.radius);
  const [inset, setInset] = useState(initial.inset);
  const [frame, setFrame] = useState<string | null>(initial.frame);
  const [saving, setSaving] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);

  const reset = () => {
    setCrops({ token: null, portrait: null });
    setCropKey((k) => k + 1);
  };
  const pick = (s: Source) => {
    setSource(s);
    reset();
    setLibrary(false);
  };
  const fromFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(',').includes(file.type)) {
      toast.error('Choisissez une image fixe (PNG, JPEG, WebP, AVIF).');
      return;
    }
    pick({ file });
  };

  const image = loaded.status === 'ready' ? loaded.image : null;
  // Cadrages en vigueur : ceux choisis, sinon centrés
  const effective = image && {
    token: crops.token ?? centeredSquare(image.bitmap.width, image.bitmap.height),
    portrait: crops.portrait ?? centeredPortrait(image.bitmap.width, image.bitmap.height),
  };

  async function save() {
    if (!source || !image || !effective) return;
    try {
      setSaving('Préparation…');
      const frameBitmap = frame ? await loadBitmap(frame) : null;
      const slug =
        name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40) || 'personnage';
      const [portraitFile, tokenFile] = await Promise.all([
        composePortrait(image.bitmap, effective.portrait, slug),
        composeToken(image.bitmap, { token: effective.token, radius, inset }, frameBitmap, slug),
      ]);
      const target = { kind: 'character' as const, id: characterId };
      // L'image d'origine n'est envoyée qu'une fois (déposée ici) ; sinon son adresse est gardée
      let sourceUrl = loaded.status === 'ready' ? loaded.remote : null;
      if (source.file) {
        setSaving('Envoi de l’image d’origine…');
        sourceUrl = await uploadFile(
          target,
          'portrait',
          await prepareImage(source.file, { maxSide: 2400 }),
        );
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
        studio: { source: sourceUrl, ...effective, frame, radius, inset },
      });
      toast.success('Portrait et token enregistrés');
      onClose();
    } catch (err) {
      toast.error('Le portrait n’a pas pu être enregistré', { description: messageErreur(err) });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        fromFile(e.dataTransfer.files?.[0]);
      }}
      onPaste={(e) => fromFile([...e.clipboardData.files][0])}
    >
      <DotsBackdrop />
      <header className="flex items-center gap-3 border-b border-border px-5 py-3.5">
        <span className="grid size-9 place-items-center rounded-xl border border-border-strong bg-card text-primary">
          <UserSquare2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-base">Studio du portrait</DialogTitle>
          <DialogDescription className="truncate text-xs">{name}</DialogDescription>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Fermer">
          <X />
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[1fr_21rem]">
        {/* Cadrage */}
        <section className="flex min-h-0 flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="tablist"
              className="relative flex rounded-xl border border-border bg-background/50 p-1"
            >
              {(['token', 'portrait'] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  type="button"
                  aria-selected={tab === t && !library}
                  onClick={() => {
                    setTab(t);
                    setLibrary(false);
                  }}
                  className={cn(
                    'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                    tab === t && !library
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab === t && !library && (
                    <motion.span
                      layoutId="studio-tab"
                      className="absolute inset-0 -z-10 rounded-lg bg-primary shadow-glow"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
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

          <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-2xl border border-border bg-background">
            <AnimatePresence mode="wait" initial={false}>
              {library ? (
                <Fade key="library">
                  <LibraryGrid onPick={(url) => pick({ remote: url })} />
                </Fade>
              ) : !source ? (
                <Fade key="empty">
                  <Empty icon={<CloudUpload />} label="Déposez ou collez une image" />
                </Fade>
              ) : loaded.status === 'loading' ? (
                <Fade key="loading">
                  <Empty icon={<Loader2 className="animate-spin" />} label="Chargement…" />
                </Fade>
              ) : loaded.status === 'error' ? (
                <Fade key="error">
                  <Empty icon={<ImageOff />} label={loaded.message} />
                </Fade>
              ) : (
                <Fade key={`${tab}-${cropKey}-${loaded.image.url}`}>
                  <CropArea
                    url={loaded.image.url}
                    aspect={ASPECT[tab]}
                    round={tab === 'token' && radius >= 40}
                    initial={crops[tab]}
                    onChange={(c) => setCrops((x) => ({ ...x, [tab]: c }))}
                  />
                </Fade>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Aperçus et réglages de l'onglet */}
        <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-t border-border p-4 [scrollbar-width:thin] sm:p-5 lg:border-l lg:border-t-0">
          {tab === 'token' ? (
            <>
              <TokenPreviews
                url={image?.url ?? null}
                crop={effective?.token ?? null}
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
            </>
          ) : (
            <PortraitPreview
              url={image?.url ?? null}
              crop={effective?.portrait ?? null}
              name={name}
            />
          )}
        </aside>
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Info texte="Revenir aux cadrages centrés">
          <Button variant="ghost" size="sm" disabled={!image || Boolean(saving)} onClick={reset}>
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
          disabled={!image}
          className="min-w-[9rem] shadow-glow"
        >
          Enregistrer
        </Button>
      </footer>
    </div>
  );
}

/**
 * Charge l'image d'origine (copie locale), libérée au changement et au départ. Une image d'un
 * autre site que le navigateur ne peut pas lire (CORS) est d'abord importée sur notre stockage :
 * `remote` donne alors l'adresse de notre copie, gardée comme source du Studio.
 */
function useLoadedImage(source: Source | null, characterId: string): Loaded {
  // Rattaché à sa source : l'image précédente (déjà libérée) n'est jamais rendue
  const [state, setState] = useState<{ source: Source; loaded: Loaded } | null>(null);
  useEffect(() => {
    if (!source) return;
    let alive = true;
    let done: LoadedImage | null = null;
    const load = async (): Promise<{ image: LoadedImage; remote: string | null }> => {
      if (source.file) return { image: await loadImage(source.file), remote: null };
      try {
        return { image: await loadImage(source.remote), remote: source.remote };
      } catch {
        const copy = await importFile(
          { kind: 'character', id: characterId },
          'portrait',
          source.remote,
        );
        return { image: await loadImage(copy.publicUrl), remote: copy.publicUrl };
      }
    };
    load()
      .then(({ image, remote }) => {
        done = image;
        if (alive) setState({ source, loaded: { status: 'ready', image, remote } });
        else {
          URL.revokeObjectURL(image.url);
          image.bitmap.close();
        }
      })
      .catch((err: unknown) => {
        if (alive) setState({ source, loaded: { status: 'error', message: messageErreur(err) } });
      });
    return () => {
      alive = false;
      if (done) {
        URL.revokeObjectURL(done.url);
        done.bitmap.close();
      }
    };
  }, [source, characterId]);
  return state && state.source === source ? state.loaded : { status: 'loading' };
}

function Fade({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0"
    >
      {children}
    </motion.div>
  );
}

function Empty({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="grid h-full place-items-center">
      <div className="flex flex-col items-center gap-2.5 text-center">
        <span className="grid size-12 place-items-center rounded-2xl border border-border-strong bg-card text-primary shadow-surface [&_svg]:size-5">
          {icon}
        </span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
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
        accept={ACCEPT}
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
  // Cadrage enregistré, repris une seule fois au montage
  const [start] = useState(() =>
    initial
      ? {
          x: initial.x * 100,
          y: initial.y * 100,
          width: initial.width * 100,
          height: initial.height * 100,
        }
      : undefined,
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
          objectFit="contain"
          showGrid={false}
          maxZoom={5}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          initialCroppedAreaPercentages={start}
          onCropComplete={(pct) =>
            onChange({
              x: clamp01(pct.x / 100),
              y: clamp01(pct.y / 100),
              width: Math.min(1, Math.max(0.001, pct.width / 100)),
              height: Math.min(1, Math.max(0.001, pct.height / 100)),
            })
          }
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

/** Le token sur une trame de carte, à trois tailles. */
function TokenPreviews({
  url,
  crop,
  radius,
  inset,
  frame,
}: {
  url: string | null;
  crop: StudioCrop | null;
  radius: number;
  inset: number;
  frame: string | null;
}) {
  return (
    <div className="relative isolate flex h-36 items-center justify-center gap-5 overflow-hidden rounded-2xl border border-border bg-surface-2">
      <span aria-hidden className="absolute inset-0 -z-10 bg-dots opacity-70" />
      {[36, 60, 100].map((size) => (
        <div key={size} className="relative shrink-0" style={{ width: size, height: size }}>
          {url && crop && (
            <div
              className="absolute"
              style={{ inset: `${inset}%`, borderRadius: `${radius}%`, ...cropStyle(url, crop) }}
            />
          )}
          {frame && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={frame}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 size-full"
            />
          )}
        </div>
      ))}
    </div>
  );
}

/** Le portrait tel que la fiche et les listes l'affichent. */
function PortraitPreview({
  url,
  crop,
  name,
}: {
  url: string | null;
  crop: StudioCrop | null;
  name: string;
}) {
  const style = url && crop ? cropStyle(url, crop) : undefined;
  return (
    <div className="flex flex-col items-center gap-5 pt-2">
      <div
        className="aspect-[3/4] w-48 rounded-xl bg-surface-3 shadow-elevated ring-1 ring-white/10"
        style={style}
      />
      <div className="flex w-full items-center gap-3 rounded-xl border border-border bg-card/60 p-2.5">
        <div className="size-10 shrink-0 rounded-lg bg-surface-3" style={style} />
        <span className="truncate text-sm font-medium">{name}</span>
      </div>
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
  icon?: ReactNode;
  value: number;
  max: number;
  onChange(v: number): void;
  format(v: number): string;
}) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">{label}</span>
        {icon && <span className="text-subtle [&_svg]:size-3.5">{icon}</span>}
        <span className="ml-auto tabular-nums text-muted-foreground">{format(value)}</span>
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
    <div className="space-y-2.5">
      <div className="flex items-center text-xs">
        <span className="font-medium">Cadre</span>
        <span className="ml-auto tabular-nums text-subtle">{frames.length}</span>
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
              draggable={false}
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
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'grid aspect-square place-items-center rounded-xl border bg-background/40 p-1 transition-[border-color,box-shadow,transform] duration-150 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selected ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
      )}
    >
      {children}
    </button>
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
            className="relative aspect-[3/4] overflow-hidden rounded-xl border border-border transition-[border-color,transform] hover:scale-[1.02] hover:border-primary/60"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={a.path}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
