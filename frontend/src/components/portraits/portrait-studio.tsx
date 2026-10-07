'use client';

/**
 * Studio du portrait d'un personnage (docs/portraits.md) : une image d'origine (déposée, collée,
 * choisie dans la bibliothèque), deux cadrages (token carré, portrait 3:4), le token réglé
 * (cadre parmi ceux de la bibliothèque, arrondi du carré au cercle, marge), aperçus en direct.
 * Cadres verrouillés selon les droits du service billing (gratuits, achetés, ou tous en premium),
 * achetés depuis la galerie par Stripe Checkout.
 * L'image est chargée une fois (copie locale) : elle sert au cadrage, aux aperçus et à la
 * fabrication. « Enregistrer » fabrique les images, les envoie et les enregistre avec les
 * réglages, pour rouvrir le Studio tel qu'il était.
 */
import { useTranslations } from 'next-intl';
import { formatter, translate } from '@/i18n/runtime';
import {
  DEFAULT_PORTRAIT_STUDIO,
  PAGES_FRONT,
  type PortraitStudio as Studio,
  type StudioCrop,
} from '@vtt/contracts';
import {
  Ban,
  Circle,
  CloudUpload,
  Crown,
  ImageOff,
  Link2,
  Library,
  Loader2,
  Lock,
  RotateCcw,
  ShoppingCart,
  Square,
  Unlink2,
  UserSquare2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Cropper from 'react-easy-crop';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { Info } from '@/components/ui/tooltip';
import { acheter, lireCadres, montant } from '@/lib/abonnement';
import { messageErreur } from '@/lib/api';
import { portraitsParDossier, useAssets, vignette, type Asset } from '@/lib/assets';
import {
  centeredPortrait,
  centeredSquare,
  composePortrait,
  composeToken,
  loadBitmap,
  loadImage,
  portraitFromToken,
  type LoadedImage,
} from '@/lib/portraits/compose';
import { MAX_SIDE, prepareImage } from '@/lib/uploads/image';
import { importFile, uploadFile } from '@/lib/uploads/uploader';
import { useRessource } from '@/lib/ressource';
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
    .filter((a) => a.category === 'Token' && a.type === 'image') // i18n-ignore : catégorie de la bibliothèque
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
}: Readonly<{
  open: boolean;
  onOpenChange(open: boolean): void;
  characterId: string;
  name: string;
  /** Ce qui est enregistré aujourd'hui. */
  current: { portraitUrl: string | null; studio: Studio | null };
  /** Enregistre les images envoyées et les réglages (PATCH du personnage). */
  onSave(r: StudioResult): Promise<void>;
}>) {
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

/** Zone de recadrage : bibliothèque, invitation à déposer, chargement, échec, ou l'image. */
function zoneOf(
  library: boolean,
  hasSource: boolean,
  status: string,
): 'library' | 'empty' | 'loading' | 'error' | 'crop' {
  if (library) return 'library';
  if (!hasSource) return 'empty';
  if (status === 'loading') return 'loading';
  return status === 'error' ? 'error' : 'crop';
}

function Body({
  characterId,
  name,
  current,
  onSave,
  onClose,
}: Readonly<{
  characterId: string;
  name: string;
  current: { portraitUrl: string | null; studio: Studio | null };
  onSave(r: StudioResult): Promise<void>;
  onClose(): void;
}>) {
  const t = useTranslations();
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
  // Le portrait suit le token jusqu'à ce qu'on le règle à part (docs/portraits.md)
  const [follows, setFollows] = useState(initial.portraitFollowsToken ?? true);
  const [radius, setRadius] = useState(initial.radius);
  const [inset, setInset] = useState(initial.inset);
  const [frame, setFrame] = useState<string | null>(initial.frame);
  const [saving, setSaving] = useState<string | null>(null);
  const [library, setLibrary] = useState(false);

  const reset = () => {
    setCrops({ token: null, portrait: null });
    setFollows(true);
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
      toast.error(t('portraits.fixedImage'));
      return;
    }
    pick({ file });
  };

  const image = loaded.status === 'ready' ? loaded.image : null;
  // Cadrages en vigueur : ceux choisis, sinon par défaut ; le portrait tiré du token s'il le suit
  const effective = image && effectiveCrops(image.bitmap, crops, follows);

  async function save() {
    if (!source || !image || !effective) return;
    try {
      setSaving(t('portraits.preparing'));
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
        setSaving(t('portraits.uploadingOriginal'));
        sourceUrl = await uploadFile(
          target,
          'portrait',
          await prepareImage(source.file, { maxSide: 2400 }),
        );
      }
      setSaving(t('portraits.uploadingBoth'));
      const [portraitUrl, tokenUrl] = await Promise.all([
        uploadFile(
          target,
          'portrait',
          await prepareImage(portraitFile, { maxSide: MAX_SIDE.portrait }),
        ),
        uploadFile(target, 'token', tokenFile),
      ]);
      setSaving(t('common.states.saving'));
      await onSave({
        portraitUrl,
        tokenUrl,
        studio: {
          source: sourceUrl,
          ...effective,
          portraitFollowsToken: follows,
          frame,
          radius,
          inset,
        },
      });
      toast.success(t('portraits.saved'));
      onClose();
    } catch (err) {
      toast.error(t('portraits.saveFailed'), { description: messageErreur(err) });
    } finally {
      setSaving(null);
    }
  }

  // Zone de recadrage : bibliothèque, invitation à déposer, chargement, échec, ou l'image
  const zone = zoneOf(library, source !== null, loaded.status);

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
          <DialogTitle className="truncate text-base">{t('portraits.title')}</DialogTitle>
          <DialogDescription className="truncate text-xs">{name}</DialogDescription>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t('common.actions.close')}
        >
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
              {(['token', 'portrait'] as const).map((id) => (
                <button
                  key={id}
                  role="tab"
                  type="button"
                  aria-selected={tab === id && !library}
                  onClick={() => {
                    setTab(id);
                    setLibrary(false);
                  }}
                  className={cn(
                    'relative rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
                    tab === id && !library
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {tab === id && !library && (
                    <motion.span
                      layoutId="studio-tab"
                      className="absolute inset-0 -z-10 rounded-lg bg-primary shadow-glow"
                      transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                    />
                  )}
                  {id === 'token' ? t('portraits.token') : t('portraits.portrait')}
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
              {zone === 'library' && (
                <Fade key="library">
                  <LibraryGrid onPick={(url) => pick({ remote: url })} />
                </Fade>
              )}
              {zone === 'empty' && (
                <Fade key="empty">
                  <Empty icon={<CloudUpload />} label={t('portraits.drop')} />
                </Fade>
              )}
              {zone === 'loading' && (
                <Fade key="loading">
                  <Empty
                    icon={<Loader2 className="animate-spin" />}
                    label={t('common.states.loading')}
                  />
                </Fade>
              )}
              {loaded.status === 'error' && zone === 'error' && (
                <Fade key="error">
                  <Empty icon={<ImageOff />} label={loaded.message} />
                </Fade>
              )}
              {loaded.status === 'ready' && zone === 'crop' && (
                <Fade key={`${tab}-${cropKey}-${loaded.image.url}`}>
                  <CropArea
                    url={loaded.image.url}
                    aspect={ASPECT[tab]}
                    token={tab === 'token' ? { radius, inset, frame } : null}
                    initial={effective?.[tab] ?? crops[tab]}
                    onChange={(c) => setCrops((x) => ({ ...x, [tab]: c }))}
                    onInteract={tab === 'portrait' ? () => setFollows(false) : undefined}
                  />
                </Fade>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Aperçus et réglages de l'onglet */}
        <aside className="min-h-0 space-y-5 overflow-y-auto border-t border-border p-4 [scrollbar-width:thin] sm:p-5 lg:border-l lg:border-t-0">
          {tab === 'token' ? (
            <>
              <SliderRow
                label={t('portraits.rounding')}
                icon={radius >= 40 ? <Circle /> : <Square />}
                value={radius}
                max={50}
                onChange={setRadius}
                format={formatArrondi}
              />
              <SliderRow
                label={t('portraits.margin')}
                value={inset}
                max={30}
                onChange={setInset}
                format={(v) => `${Math.round(v)} %`}
              />
              <FrameGallery value={frame} onChange={setFrame} />
            </>
          ) : (
            <>
              <FollowToggle
                follows={follows}
                onFollow={() => {
                  setFollows(true);
                  setCropKey((k) => k + 1);
                }}
              />
              <PortraitPreview
                url={image?.url ?? null}
                crop={effective?.portrait ?? null}
                name={name}
              />
            </>
          )}
        </aside>
      </div>

      <footer className="flex items-center gap-2 border-t border-border px-5 py-3">
        <Info texte={t('portraits.recenter')}>
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
          {t('common.actions.cancel')}
        </Button>
        <Button
          onClick={() => void save()}
          loading={Boolean(saving)}
          disabled={!image}
          className="min-w-[9rem] shadow-glow"
        >
          {t('common.actions.save')}
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

function Fade({ children }: Readonly<{ children: ReactNode }>) {
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

function Empty({ icon, label }: Readonly<{ icon: ReactNode; label: string }>) {
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
}: Readonly<{
  onFile(f: File | undefined): void;
  onLibrary(): void;
  libraryOpen: boolean;
}>) {
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

/** Réglages du token montrés dans le cadrage (absent : cadrage du portrait). */
interface TokenLook {
  radius: number;
  inset: number;
  frame: string | null;
}

/**
 * Cadrage : glisser pour placer, molette ou curseur pour zoomer. Pour le token, le cadrage est
 * l'aperçu : la zone gardée prend l'arrondi choisi, le cadre est posé autour à la taille de la
 * marge (comme l'image fabriquée, docs/portraits.md).
 */
function CropArea({
  url,
  aspect,
  token,
  initial,
  onChange,
  onInteract,
}: Readonly<{
  url: string;
  aspect: number;
  token: TokenLook | null;
  initial: StudioCrop | null;
  onChange(c: StudioCrop): void;
  /** Geste de l'utilisateur (glisser, molette, clavier, zoom) : pas les réglages appliqués. */
  onInteract?: () => void;
}>) {
  const t = useTranslations();
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
  const box = useRef<HTMLDivElement>(null);
  const [area, setArea] = useState<{ w: number; h: number } | null>(null);
  const [media, setMedia] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e) setArea({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Token : zone gardée assez petite pour que le cadre (plus grand de la marge) tienne à l'écran
  let side: number | null = null;
  if (token && area && media) {
    const scale = Math.min(area.w / media.w, area.h / media.h);
    const fit = Math.min(media.w * scale, media.h * scale);
    const room = Math.min(area.w, area.h) * 0.92 * (1 - (2 * token.inset) / 100);
    side = Math.max(40, Math.min(fit, room));
  }
  const frameSide = side && token ? side / (1 - (2 * token.inset) / 100) : null;

  return (
    <div className="absolute inset-0 flex flex-col">
      <div
        ref={box}
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDownCapture={onInteract}
        onWheelCapture={onInteract}
        onKeyDownCapture={onInteract}
      >
        <Cropper
          image={url}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          objectFit="contain"
          showGrid={false}
          maxZoom={5}
          {...(side ? { cropSize: { width: side, height: side } } : {})}
          style={{
            cropAreaStyle: {
              border: 'none',
              borderRadius: token ? `${token.radius}%` : undefined,
              color: 'rgb(0 0 0 / 0.62)',
            },
          }}
          onMediaLoaded={(m) => setMedia({ w: m.naturalWidth, h: m.naturalHeight })}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          initialCroppedAreaPercentages={start}
          // Chaque changement, y compris le cadrage enregistré appliqué au chargement :
          // onCropComplete signale d'abord un cadrage centré, puis rien quand il est appliqué
          onCropAreaChange={(pct) =>
            onChange({
              x: clamp01(pct.x / 100),
              y: clamp01(pct.y / 100),
              width: Math.min(1, Math.max(0.001, pct.width / 100)),
              height: Math.min(1, Math.max(0.001, pct.height / 100)),
            })
          }
        />
        {token?.frame && frameSide && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={vignette(token.frame, 1024)}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2"
            style={{ width: frameSide, height: frameSide }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 border-t border-border bg-card/80 px-4 py-2.5 backdrop-blur">
        <span className="text-xs text-muted-foreground">{t('portraits.zoom')}</span>
        <Slider
          value={[zoom]}
          min={1}
          max={5}
          step={0.01}
          onValueChange={(v) => {
            onInteract?.();
            setZoom(v[0] ?? 1);
          }}
          aria-label={t('portraits.zoom')}
          className="flex-1"
        />
      </div>
    </div>
  );
}

/** Cadrages en vigueur : ceux choisis, sinon par défaut ; le portrait tiré du token s'il le suit. */
function effectiveCrops(
  bitmap: { width: number; height: number },
  crops: Record<Tab, StudioCrop | null>,
  follows: boolean,
): Record<Tab, StudioCrop> {
  const { width: w, height: h } = bitmap;
  const token = crops.token ?? centeredSquare(w, h);
  const portrait = follows
    ? portraitFromToken(token, w, h)
    : (crops.portrait ?? centeredPortrait(w, h));
  return { token, portrait };
}

/** Le portrait suit le token, ou est réglé à part (un geste dans le cadrage l'en détache). */
function FollowToggle({ follows, onFollow }: Readonly<{ follows: boolean; onFollow(): void }>) {
  const t = useTranslations();
  return (
    <Info texte={follows ? t('portraits.follows') : t('portraits.follow')}>
      <Button
        variant={follows ? 'secondary' : 'ghost'}
        size="sm"
        aria-pressed={follows}
        disabled={follows}
        onClick={onFollow}
        className="w-full justify-start"
      >
        {follows ? <Link2 /> : <Unlink2 />}
        {follows ? t('portraits.followsShort') : t('portraits.separate')}
      </Button>
    </Info>
  );
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Le portrait tel que la fiche et les listes l'affichent. */
function PortraitPreview({
  url,
  crop,
  name,
}: Readonly<{
  url: string | null;
  crop: StudioCrop | null;
  name: string;
}>) {
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
}: Readonly<{
  label: string;
  icon?: ReactNode;
  value: number;
  max: number;
  onChange(v: number): void;
  format(v: number): string;
}>) {
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

/** Nom du fichier d'un cadre sans extension : son identifiant au catalogue (`Token3`). */
const frameId = (a: Asset) => a.name.replace(/\.[^.]+$/, '');

/**
 * Galerie des cadres de la bibliothèque, chargés à mesure du défilement. Un cadre verrouillé
 * propose son achat (catalogue) ou le premium (cadre hors catalogue).
 */
function FrameGallery({
  value,
  onChange,
}: Readonly<{
  value: string | null;
  onChange(v: string | null): void;
}>) {
  const t = useTranslations();
  const assets = useAssets();
  const frames = useMemo(() => framesOf(assets.data ?? []), [assets.data]);
  const rights = useRessource('cadres-jetons', lireCadres);
  const catalog = useMemo(
    () => new Map((rights.donnees?.frames ?? []).map((f) => [f.id, f])),
    [rights.donnees],
  );
  const [offer, setOffer] = useState<string | null>(null);
  // Le cadre déjà enregistré reste utilisable, possédé ou non
  const locked = (f: Asset) =>
    f.path !== value && !rights.donnees?.all && !catalog.get(frameId(f))?.owned;
  const offered = offer ? (catalog.get(offer) ?? null) : null;
  return (
    <div className="space-y-2.5">
      <div className="flex items-center text-xs">
        <span className="font-medium">{t('portraits.frame')}</span>
        <span className="ml-auto tabular-nums text-subtle">{frames.length}</span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        <FrameTile
          selected={value === null}
          onClick={() => {
            setOffer(null);
            onChange(null);
          }}
          label={t('portraits.noFrame')}
        >
          <Ban className="size-5 text-subtle" aria-hidden />
        </FrameTile>
        {frames.map((f) => {
          const id = frameId(f);
          const item = catalog.get(id);
          const lock = locked(f);
          let label = item?.name ?? id;
          if (lock) label += item ? ` · ${montant(item.price)}` : ' · Premium';
          return (
            <FrameTile
              key={f.path}
              selected={value === f.path || (lock && offer === id)}
              onClick={() => {
                setOffer(lock ? id : null);
                if (!lock) onChange(f.path);
              }}
              label={label}
              locked={lock}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={vignette(f.path, 128)}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="size-full object-contain"
              />
            </FrameTile>
          );
        })}
      </div>
      {offer && <FrameOffer id={offer} item={offered} />}
    </div>
  );
}

/** Achat d'un cadre verrouillé, ou premium s'il n'est pas vendu à l'unité. */
function FrameOffer({
  id,
  item,
}: Readonly<{ id: string; item: { name: string; price: number } | null }>) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);
  const buy = async () => {
    setPending(true);
    try {
      await acheter(`token_${id}`);
    } catch (err) {
      toast.error(messageErreur(err));
      setPending(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-background/40 p-2 pl-3 text-sm">
      <span className="min-w-0 flex-1 truncate font-medium">{item?.name ?? id}</span>
      {item ? (
        <Button size="sm" onClick={buy} loading={pending}>
          {!pending && <ShoppingCart aria-hidden />}
          {montant(item.price)}
        </Button>
      ) : (
        <Button size="sm" asChild>
          <Link href={PAGES_FRONT.abonnement}>
            <Crown aria-hidden />
            {t('portraits.premium')}
          </Link>
        </Button>
      )}
    </div>
  );
}

function FrameTile({
  selected,
  onClick,
  label,
  locked = false,
  children,
}: Readonly<{
  selected: boolean;
  onClick(): void;
  label: string;
  locked?: boolean;
  children: ReactNode;
}>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'relative grid aspect-square place-items-center rounded-xl border bg-background/40 p-1 transition-[border-color,box-shadow,transform] duration-150 hover:scale-[1.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        selected ? 'border-primary shadow-glow' : 'border-border hover:border-border-strong',
        locked && '[&>img]:opacity-40 [&>img]:grayscale',
      )}
    >
      {children}
      {locked && (
        <Lock className="absolute bottom-1 right-1 size-3 text-muted-foreground" aria-hidden />
      )}
    </button>
  );
}

/** Portraits de la bibliothèque, par dossier. */
function LibraryGrid({ onPick }: Readonly<{ onPick(url: string): void }>) {
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
              src={vignette(a.path, 240)}
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

/** Arrondi du token : cercle, carré, ou pourcentage. */
function formatArrondi(v: number): string {
  if (v >= 50) return translate('portraits.circle');
  return v === 0 ? translate('portraits.square') : formatter().number(v / 100, 'percent');
}
