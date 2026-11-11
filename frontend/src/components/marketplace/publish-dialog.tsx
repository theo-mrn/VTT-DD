'use client';

/**
 * Publier une scène sur la marketplace : campagne, scène (vignettes), titre et résumé déjà
 * remplis, couverture tirée de la scène, attestation, Publier. Tout le reste (fiche, version,
 * contenu, revue) se fait d'un coup (lib/marketplace/publish.ts).
 */
import type { MapScene } from '@vtt/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, ImagePlus, Map as MapIcon, Upload, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Message } from '@/components/compte/elements';
import { Illustration } from '@/components/commun/illustration';
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
import { Skeleton } from '@/components/ui/skeleton';
import { api, messageErreur } from '@/lib/api';
import { useCampagnes } from '@/lib/campagnes';
import { marketplaceKeys } from '@/lib/marketplace/api';
import { publishCharacter, publishScene, type PublishStep } from '@/lib/marketplace/publish';
import { usePersonnages } from '@/lib/personnages';
import { useProfil } from '@/lib/session';
import { cn } from '@/lib/utils';

const VIDEO = /\.(webm|mp4)(\?|$)/i;

type Kind = 'scene' | 'character';

/** Ce qui va être publié : identifiant, nom, résumé et image proposés. */
interface Picked {
  id: string;
  name: string;
  summary: string;
  image: string | null;
  /** Système du personnage. */
  systemId?: string;
}

export function PublishDialog({
  open,
  onOpenChange,
}: Readonly<{ open: boolean; onOpenChange(open: boolean): void }>) {
  const t = useTranslations('marketplace.publish');
  const tc = useTranslations('common.actions');
  const profil = useProfil();
  const qc = useQueryClient();
  const router = useRouter();
  const campaigns = useCampagnes();
  const mine = campaigns.data ?? [];
  const [kind, setKind] = useState<Kind>('scene');
  const [campaignId, setCampaignId] = useState('');
  const [picked, setPicked] = useState<Picked | null>(null);
  const characters = usePersonnages();
  const campaign = mine.find((c) => c.id === campaignId) ?? null;
  const isGm = campaign?.role === 'gm';
  const myCharacters = useMemo(
    () =>
      (characters.data ?? []).filter(
        (c) => !c.inCreation && c.ownerId === profil.id && c.roomId === campaignId,
      ),
    [characters.data, profil.id, campaignId],
  );
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [cover, setCover] = useState<File | null>(null);
  const [attested, setAttested] = useState(false);
  const [step, setStep] = useState<PublishStep | null>(null);
  const [error, setError] = useState<string | null>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const scenes = useQuery({
    queryKey: ['marketplace', 'publish', 'scenes', campaignId],
    enabled: open && Boolean(campaignId) && isGm,
    queryFn: async () =>
      (await api<{ items: MapScene[] }>(`/v1/campaigns/${encodeURIComponent(campaignId)}/maps`))
        .items,
  });

  const coverPreview = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => void (coverPreview && URL.revokeObjectURL(coverPreview)), [coverPreview]);
  const coverUrl = coverPreview ?? picked?.image ?? null;

  function pick(p: Picked) {
    setPicked(p);
    setTitle(p.name.slice(0, 80));
    setSummary(p.summary.trim().slice(0, 160));
    setCover(null);
    setError(null);
  }

  function reset() {
    setPicked(null);
    setTitle('');
    setSummary('');
    setCover(null);
    setAttested(false);
    setError(null);
  }

  async function publish() {
    if (!picked) return;
    setError(null);
    const common = {
      profil,
      title: title.trim(),
      summary: summary.trim(),
      cover,
      onStep: setStep,
    };
    try {
      const { listingId } =
        kind === 'scene'
          ? await publishScene({ ...common, campaignId, sceneId: picked.id })
          : await publishCharacter({
              ...common,
              characterId: picked.id,
              systemId: picked.systemId!,
            });
      await qc.invalidateQueries({ queryKey: marketplaceKeys.all });
      toast.success(t('done'));
      reset();
      setCampaignId('');
      onOpenChange(false);
      router.push(`/marketplace/${listingId}`);
    } catch (e) {
      setError(messageErreur(e));
    } finally {
      setStep(null);
    }
  }

  const busy = step !== null;
  const ready =
    picked && title.trim().length >= 3 && summary.trim().length > 0 && coverUrl && attested;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="flex max-h-[min(92dvh,860px)] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {campaign && (
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('back')}
                disabled={busy}
                onClick={() => {
                  setCampaignId('');
                  reset();
                }}
              >
                <ArrowLeft />
              </Button>
            )}
            <span className="truncate">{campaign ? campaign.name : t('chooseCampaign')}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">{t('action')}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {!campaign &&
            (campaigns.isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />
                ))}
              </div>
            ) : mine.length === 0 ? (
              <Message>{t('noCampaign')}</Message>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {mine.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCampaignId(c.id);
                      setKind(c.role === 'gm' ? 'scene' : 'character');
                      reset();
                    }}
                    data-ambiance={c.ambiance}
                    className="group relative overflow-hidden rounded-2xl border border-border text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Illustration
                      largeur={360}
                      src={c.coverUrl}
                      graine={c.name || c.id}
                      className="aspect-[4/3] w-full"
                      classeImage="transition-transform duration-500 group-hover:scale-[1.05]"
                      voile
                    >
                      <span className="absolute inset-x-3 bottom-2.5 truncate font-semibold text-white drop-shadow">
                        {c.name}
                      </span>
                    </Illustration>
                  </button>
                ))}
              </div>
            ))}

          {campaign && (
            <div className={cn('grid gap-2', isGm ? 'grid-cols-2' : 'grid-cols-1')}>
              {isGm && (
                <KindTab
                  active={kind === 'scene'}
                  disabled={busy}
                  icon={<MapIcon />}
                  label={t('kinds.scene')}
                  onClick={() => {
                    setKind('scene');
                    reset();
                  }}
                />
              )}
              <KindTab
                active={kind === 'character'}
                disabled={busy}
                icon={<UserRound />}
                label={t('kinds.character')}
                onClick={() => {
                  setKind('character');
                  reset();
                }}
              />
            </div>
          )}

          {campaign && kind === 'scene' && (
            <>
              {scenes.isLoading && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => (
                    <Skeleton key={i} className="aspect-video rounded-xl" />
                  ))}
                </div>
              )}
              {scenes.data?.length === 0 && <Message>{t('noScene')}</Message>}
              {!!scenes.data?.length && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {scenes.data.map((s) => {
                    const active = picked?.id === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={busy}
                        aria-pressed={active}
                        onClick={() =>
                          pick({
                            id: s.id,
                            name: s.name,
                            summary: s.description,
                            image:
                              s.backgroundUrl && !VIDEO.test(s.backgroundUrl)
                                ? s.backgroundUrl
                                : null,
                          })
                        }
                        className={cn(
                          'group relative overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-primary ring-2 ring-primary'
                            : 'border-border hover:border-border-strong',
                        )}
                      >
                        <Illustration
                          largeur={320}
                          src={
                            s.backgroundUrl && !VIDEO.test(s.backgroundUrl) ? s.backgroundUrl : null
                          }
                          graine={s.name || s.id}
                          className="aspect-video w-full"
                          voile
                        >
                          <span className="absolute inset-x-2 bottom-1.5 truncate text-[13px] font-medium text-white drop-shadow">
                            {s.name}
                          </span>
                          {active && (
                            <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="size-3.5" strokeWidth={3} />
                            </span>
                          )}
                        </Illustration>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {campaign &&
            kind === 'character' &&
            (characters.isLoading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
                ))}
              </div>
            ) : myCharacters.length === 0 ? (
              <Message>{t('noCharacter')}</Message>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {myCharacters.map((c) => {
                  const active = picked?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy}
                      aria-pressed={active}
                      onClick={() =>
                        pick({
                          id: c.id,
                          name: c.name,
                          summary: c.summary.tagline || c.concept,
                          image: c.portraitUrl,
                          systemId: c.system.id,
                        })
                      }
                      className={cn(
                        'group relative overflow-hidden rounded-xl border text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary ring-2 ring-primary'
                          : 'border-border hover:border-border-strong',
                      )}
                    >
                      <Illustration
                        largeur={240}
                        src={c.portraitUrl}
                        graine={c.name || c.id}
                        position="top"
                        className="aspect-[3/4] w-full"
                        voile
                      >
                        <span className="absolute inset-x-2 bottom-1.5">
                          <span className="block truncate text-[13px] font-medium text-white drop-shadow">
                            {c.name}
                          </span>
                          <span className="block truncate text-[11px] text-white/70">
                            {c.summary.tagline}
                          </span>
                        </span>
                        {active && (
                          <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-3.5" strokeWidth={3} />
                          </span>
                        )}
                      </Illustration>
                    </button>
                  );
                })}
              </div>
            ))}

          {picked && (
            <div className="grid gap-4 border-t border-border pt-5 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <div className="space-y-1.5">
                <Label>{t('cover')}</Label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => coverInput.current?.click()}
                  className="group relative block aspect-video w-full overflow-hidden rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={coverUrl} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="flex size-full items-center justify-center bg-surface-2 px-3 text-center text-xs text-muted-foreground">
                      {t('noCover')}
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-black/55 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                    <ImagePlus className="size-3.5" />
                    {t('changeCover')}
                  </span>
                </button>
                <input
                  ref={coverInput}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) setCover(f);
                  }}
                />
              </div>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="publish-title">{t('name')}</Label>
                  <Input
                    id="publish-title"
                    value={title}
                    minLength={3}
                    maxLength={80}
                    disabled={busy}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="publish-summary">{t('summary')}</Label>
                  <Input
                    id="publish-summary"
                    value={summary}
                    maxLength={160}
                    disabled={busy}
                    onChange={(e) => setSummary(e.target.value)}
                  />
                </div>
                <label className="flex items-start gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={attested}
                    disabled={busy}
                    onChange={(e) => setAttested(e.target.checked)}
                  />
                  {t('attest')}
                </label>
              </div>
            </div>
          )}

          {error && <Message>{error}</Message>}
        </div>

        <DialogFooter className="items-center">
          {step && (
            <span className="mr-auto text-xs text-muted-foreground">{t(`steps.${step}`)}</span>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            {tc('cancel')}
          </Button>
          <Button disabled={!ready} loading={busy} onClick={() => void publish()}>
            {t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Publier » et sa fenêtre. */
export function PublishButton({ className }: Readonly<{ className?: string }>) {
  const t = useTranslations('marketplace.publish');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)}>
        <Upload />
        {t('action')}
      </Button>
      <PublishDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

function KindTab({
  active,
  disabled,
  icon,
  label,
  onClick,
}: Readonly<{
  active: boolean;
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick(): void;
}>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors [&_svg]:size-4',
        active
          ? 'border-primary/50 bg-primary/10 text-primary-strong'
          : 'border-border text-muted-foreground hover:border-border-strong hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
