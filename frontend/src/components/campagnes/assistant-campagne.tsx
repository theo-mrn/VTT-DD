'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  ImageOff,
  ImagePlus,
  Info as IconeInfo,
  Lock,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CarteChoix } from '@/components/commun/carte-choix';
import { Illustration } from '@/components/commun/illustration';
import { AvatarJoueur, Interrupteur, Message } from '@/components/compte/elements';
import { EnTeteFocus, ProgressionEtapes } from '@/components/shell/cadre-focus';
import { CarteSysteme, CarteSystemeSquelette } from '@/components/systemes/carte-systeme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAmis } from '@/lib/amis';
import { messageErreur } from '@/lib/api';
import {
  LONGUEUR_ACCROCHE,
  LONGUEUR_DESCRIPTION,
  useCreerCampagne,
  type Campagne,
  type NouvelleCampagne,
} from '@/lib/campagnes';
import { TYPES_IMAGE, verifierImage } from '@/lib/profil';
import { onboardingFini, onboardingTermine, RETOUR_ONBOARDING } from '@/lib/onboarding';
import { useProfil, useSession } from '@/lib/session';
import { useSystemes } from '@/lib/systemes';
import { cn } from '@/lib/utils';
import { CarteCampagne } from './carte-campagne';
import { AMBIANCES, COUVERTURES, ETIQUETTES } from './elements';

const ETAPES = ['story', 'rules', 'ambiance', 'table'] as const;

const ETIQUETTES_MAX = 4;

/** Assistant de création d'une campagne, avec l'aperçu de la carte en direct. */
export function AssistantCampagne() {
  const t = useTranslations('campaigns.wizard');
  const profil = useProfil();
  const router = useRouter();
  const { modifierPreferences } = useSession();
  // Lancé depuis l'onboarding : quitter y ramène, créer la campagne le termine
  const depuisOnboarding = useSearchParams().get('depuis') === 'bienvenue';
  const creer = useCreerCampagne();
  const [etape, setEtape] = useState(0);
  const [sens, setSens] = useState(1);
  const [b, setB] = useState<NouvelleCampagne>({
    name: '',
    pitch: '',
    description: '',
    coverUrl: COUVERTURES[0]!.url,
    couverture: null,
    system: '',
    ambiance: 'or',
    visibility: 'private',
    freeCreation: true,
    tags: [],
    invite: [],
  });
  const maj = (m: Partial<NouvelleCampagne>) => setB((x) => ({ ...x, ...m }));

  const valide = [b.name.trim().length >= 3, b.system !== '', true, true];
  const derniere = etape === ETAPES.length - 1;

  function aller(i: number) {
    setSens(i > etape ? 1 : -1);
    setEtape(i);
  }

  async function terminer() {
    try {
      const c = await creer.mutateAsync({ ...b, name: b.name.trim(), pitch: b.pitch.trim() });
      // Avant la navigation : sinon le cadre de l'app renverrait vers /bienvenue
      if (!onboardingTermine(profil)) await modifierPreferences({ onboarding: onboardingFini() });
      router.replace(`/campagnes/${c.id}?bienvenue=1`);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  const apercuImage = useApercuFichier(b.couverture);

  // Aperçu : la carte telle qu'elle apparaîtra, avec le créateur comme MJ
  const apercu: Pick<
    Campagne,
    | 'id'
    | 'name'
    | 'pitch'
    | 'coverUrl'
    | 'system'
    | 'ambiance'
    | 'members'
    | 'memberCount'
    | 'playerCount'
    | 'nextSession'
    | 'role'
  > = {
    id: 'apercu',
    name: b.name,
    pitch: b.pitch,
    coverUrl: apercuImage ?? b.coverUrl,
    system: b.system,
    ambiance: b.ambiance,
    role: 'gm',
    memberCount: 1,
    playerCount: 0,
    nextSession: null,
    members: [
      {
        userId: profil.id,
        name: profil.name,
        avatarUrl: profil.avatarUrl,
        role: 'gm',
        characterId: null,
      },
    ],
  };

  return (
    <div className="flex min-h-dvh flex-col" data-ambiance={b.ambiance}>
      <EnTeteFocus
        centre={
          <ProgressionEtapes
            etapes={ETAPES.map((id) => ({ id, nom: t(`steps.${id}`) }))}
            courante={etape}
            onAller={(i) => (i < etape || valide.slice(0, i).every(Boolean)) && aller(i)}
          />
        }
        quitter={{ href: depuisOnboarding ? RETOUR_ONBOARDING : '/campagnes' }}
      />
      <div className="relative flex-1">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-halo" />
        <div className="relative mx-auto grid w-full max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:py-14">
          <main className="min-w-0">
            <AnimatePresence mode="wait" custom={sens}>
              <motion.section
                key={etape}
                custom={sens}
                initial={{ opacity: 0, x: sens * 32 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: sens * -32 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                {etape === 0 && <EtapeHistoire b={b} maj={maj} />}
                {etape === 1 && <EtapeRegles b={b} maj={maj} />}
                {etape === 2 && <EtapeAmbiance b={b} maj={maj} />}
                {etape === 3 && <EtapeTable b={b} maj={maj} />}
              </motion.section>
            </AnimatePresence>

            <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button
                variant="ghost"
                onClick={() => aller(etape - 1)}
                className={cn(etape === 0 && 'invisible')}
              >
                <ArrowLeft />
                {t('back')}
              </Button>
              {derniere ? (
                <Button size="lg" onClick={() => void terminer()} loading={creer.isPending}>
                  <Check />
                  {t('create')}
                </Button>
              ) : (
                <Button size="lg" onClick={() => aller(etape + 1)} disabled={!valide[etape]}>
                  {t('continue')}
                  <ArrowRight />
                </Button>
              )}
            </div>
          </main>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-subtle">
                {t('preview')}
              </p>
              <CarteCampagne campagne={apercu} role="gm" />
              <ul className="space-y-2 rounded-2xl border border-border bg-card p-4 text-[13px] shadow-surface">
                <Recap ok={valide[0]!} label={t('recap.title')} />
                <Recap ok={valide[1]!} label={t('recap.system')} />
                <Recap
                  ok={b.coverUrl !== null || b.couverture !== null}
                  label={t('recap.cover')}
                  facultatif
                />
                <Recap ok={b.invite.length > 0} label={t('recap.invites')} facultatif />
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** URL locale d'aperçu d'un fichier choisi (libérée quand il change). */
function useApercuFichier(fichier: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!fichier) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(fichier);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [fichier]);
  return url;
}

function Recap({
  ok,
  label,
  facultatif,
}: Readonly<{ ok: boolean; label: string; facultatif?: boolean }>) {
  const t = useTranslations('campaigns.wizard.recap');
  return (
    <li className="flex items-center gap-2.5">
      <span
        className={cn(
          'flex size-4 items-center justify-center rounded-full border',
          ok ? 'border-primary bg-primary text-primary-foreground' : 'border-border-strong',
        )}
      >
        {ok && <Check className="size-2.5" strokeWidth={3} />}
      </span>
      <span className={ok ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
      {facultatif && <span className="ml-auto text-[11px] text-subtle">{t('optional')}</span>}
    </li>
  );
}

function TitreEtape({
  surtitre,
  titre,
  description,
}: Readonly<{
  surtitre: string;
  titre: ReactNode;
  description?: ReactNode;
}>) {
  return (
    <div className="mb-8 space-y-2">
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-primary">{surtitre}</p>
      <h1 className="text-balance text-3xl font-semibold tracking-tight">{titre}</h1>
      {description && (
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

interface PropsEtape {
  b: NouvelleCampagne;
  maj: (m: Partial<NouvelleCampagne>) => void;
}

// ─── 1. L'histoire ───────────────────────────────────────────────────────────

function EtapeHistoire({ b, maj }: Readonly<PropsEtape>) {
  const t = useTranslations('campaigns');
  const basculer = (tag: string) => {
    if (b.tags.includes(tag)) maj({ tags: b.tags.filter((x) => x !== tag) });
    else if (b.tags.length < ETIQUETTES_MAX) maj({ tags: [...b.tags, tag] });
  };
  return (
    <>
      <TitreEtape
        surtitre={t('wizard.story.eyebrow')}
        titre={t('wizard.story.title')}
        description={t('wizard.story.lead')}
      />
      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="c-nom">{t('wizard.story.name')}</Label>
          <Input
            id="c-nom"
            autoFocus
            maxLength={80}
            value={b.name}
            onChange={(e) => maj({ name: e.target.value })}
            placeholder={t('wizard.story.namePlaceholder')}
            className="h-12 text-lg font-medium"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="c-accroche">{t('wizard.story.pitch')}</Label>
            <span className="text-xs tabular text-subtle">
              {t('wizard.story.count', { length: b.pitch.length, max: LONGUEUR_ACCROCHE })}
            </span>
          </div>
          <Input
            id="c-accroche"
            maxLength={LONGUEUR_ACCROCHE}
            value={b.pitch}
            onChange={(e) => maj({ pitch: e.target.value })}
            placeholder={t('wizard.story.pitchPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="c-description">{t('wizard.story.description')}</Label>
          <Textarea
            id="c-description"
            maxLength={LONGUEUR_DESCRIPTION}
            value={b.description}
            onChange={(e) => maj({ description: e.target.value })}
            placeholder={t('wizard.story.descriptionPlaceholder')}
            className="min-h-[140px]"
          />
        </div>
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>{t('wizard.story.genres')}</Label>
            <span className="text-xs text-subtle">
              {t('wizard.story.genresMax', { max: ETIQUETTES_MAX })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {ETIQUETTES.map((tag) => {
              const actif = b.tags.includes(tag.valeur);
              return (
                <button
                  key={tag.valeur}
                  type="button"
                  aria-pressed={actif}
                  onClick={() => basculer(tag.valeur)}
                  className={cn(
                    'h-8 rounded-full border px-3.5 text-[13px] transition-all',
                    actif
                      ? 'border-primary/50 bg-primary/15 text-primary-strong'
                      : 'border-border-strong text-muted-foreground hover:border-subtle hover:text-foreground',
                  )}
                >
                  {t(`tags.${tag.cle}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 2. Les règles ───────────────────────────────────────────────────────────

function EtapeRegles({ b, maj }: Readonly<PropsEtape>) {
  const t = useTranslations('campaigns.wizard.rules');
  const systemes = useSystemes();
  return (
    <>
      <TitreEtape surtitre={t('eyebrow')} titre={t('title')} description={t('lead')} />
      <div
        role="radiogroup"
        aria-label={t('system')}
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        {systemes.isLoading &&
          Array.from({ length: 3 }, (_, i) => <CarteSystemeSquelette key={i} />)}
        {systemes.data?.map((s) => (
          <CarteSysteme
            key={s.id}
            systeme={s}
            choisie={b.system === s.id}
            onChoisir={() => maj({ system: s.id })}
          />
        ))}
      </div>
      <p className="mt-5 flex items-start gap-2 text-[13px] text-subtle">
        <IconeInfo className="mt-0.5 size-4 shrink-0" />
        {t('final')}
      </p>
    </>
  );
}

// ─── 3. L'ambiance ───────────────────────────────────────────────────────────

function EtapeAmbiance({ b, maj }: Readonly<PropsEtape>) {
  const t = useTranslations('campaigns');
  const champ = useRef<HTMLInputElement>(null);
  const [erreurImage, setErreurImage] = useState<string | null>(null);
  const apercuImport = useApercuFichier(b.couverture);

  // Envoyée au stockage une fois la campagne créée (l'envoi demande la campagne)
  function importer(e: ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    e.target.value = '';
    if (!fichier) return;
    const probleme = verifierImage(fichier);
    setErreurImage(probleme);
    if (!probleme) maj({ couverture: fichier, coverUrl: null });
  }

  return (
    <>
      <TitreEtape
        surtitre={t('wizard.ambiance.eyebrow')}
        titre={t('wizard.ambiance.title')}
        description={t('wizard.ambiance.lead')}
      />
      <div className="space-y-8">
        <div>
          <Label className="mb-3 block">{t('wizard.ambiance.cover')}</Label>
          <div
            role="radiogroup"
            aria-label={t('wizard.ambiance.cover')}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
          >
            {COUVERTURES.map((c) => {
              const choisie = b.coverUrl === c.url;
              return (
                <button
                  key={c.url}
                  type="button"
                  role="radio"
                  aria-checked={choisie}
                  aria-label={t(`covers.${c.nom}`)}
                  onClick={() => maj({ coverUrl: c.url, couverture: null })}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border-2 transition-all',
                    choisie
                      ? 'border-primary shadow-glow'
                      : 'border-transparent hover:border-border-strong',
                  )}
                >
                  <Illustration
                    largeur={320}
                    src={c.url}
                    graine={c.nom}
                    className="aspect-[16/10]"
                    classeImage="transition-transform duration-500 group-hover:scale-105"
                    voile
                  >
                    <span className="absolute bottom-1.5 left-2.5 text-[11px] font-medium text-white/85">
                      {t(`covers.${c.nom}`)}
                    </span>
                    {choisie && (
                      <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </Illustration>
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={b.couverture !== null}
              onClick={() => champ.current?.click()}
              className={cn(
                'group relative flex aspect-[16/10] flex-col items-center justify-center gap-1.5 overflow-hidden rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors',
                b.couverture !== null
                  ? 'border-primary text-primary'
                  : 'border-border-strong hover:text-foreground',
              )}
            >
              {apercuImport ? (
                <Illustration src={apercuImport} graine="import" className="absolute inset-0" voile>
                  <span className="absolute bottom-1.5 left-2.5 text-[11px] font-medium text-white/85">
                    {t('wizard.ambiance.yourImage')}
                  </span>
                  <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                </Illustration>
              ) : (
                <>
                  <ImagePlus className="size-4" />
                  {t('wizard.ambiance.importImage')}
                </>
              )}
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={b.coverUrl === null && b.couverture === null}
              onClick={() => maj({ coverUrl: null, couverture: null })}
              className={cn(
                'flex aspect-[16/10] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs text-muted-foreground transition-colors',
                b.coverUrl === null && b.couverture === null
                  ? 'border-primary text-primary'
                  : 'border-border-strong hover:text-foreground',
              )}
            >
              <ImageOff className="size-4" />
              {t('wizard.ambiance.noImage')}
            </button>
            <input
              ref={champ}
              type="file"
              accept={TYPES_IMAGE.join(',')}
              className="hidden"
              onChange={importer}
            />
          </div>
          {erreurImage && <Message className="mt-3">{erreurImage}</Message>}
          <p className="mt-3 text-xs text-subtle">{t('wizard.ambiance.imageHint')}</p>
        </div>

        <div>
          <Label className="mb-3 block">{t('wizard.ambiance.color')}</Label>
          <div
            role="radiogroup"
            aria-label={t('wizard.ambiance.color')}
            className="flex flex-wrap gap-3"
          >
            {AMBIANCES.map((a) => {
              const choisie = b.ambiance === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="radio"
                  aria-checked={choisie}
                  onClick={() => maj({ ambiance: a.id })}
                  className={cn(
                    'flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-4 text-[13px] transition-all',
                    choisie
                      ? 'border-border-strong bg-surface-3 text-foreground'
                      : 'border-border text-muted-foreground hover:border-border-strong',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-full transition-transform',
                      choisie &&
                        'scale-110 ring-2 ring-white/30 ring-offset-2 ring-offset-background',
                    )}
                    style={{ background: a.couleur }}
                  >
                    {choisie && <Check className="size-3 text-black/70" strokeWidth={3} />}
                  </span>
                  {t(`ambiances.${a.id}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── 4. La table ─────────────────────────────────────────────────────────────

function EtapeTable({ b, maj }: Readonly<PropsEtape>) {
  const t = useTranslations('campaigns.wizard.table');
  const amis = useAmis();
  const invite = (id: string) => b.invite.some((i) => i.id === id);
  let etatAmis: 'chargement' | 'erreur' | 'aucun' | 'liste' = 'liste';
  if (amis.isLoading) etatAmis = 'chargement';
  else if (amis.isError) etatAmis = 'erreur';
  else if ((amis.data?.length ?? 0) === 0) etatAmis = 'aucun';

  return (
    <>
      <TitreEtape surtitre={t('eyebrow')} titre={t('title')} description={t('lead')} />
      <div className="space-y-8">
        <div role="radiogroup" aria-label={t('visibility')} className="grid gap-3 sm:grid-cols-2">
          <CarteChoix
            choisie={b.visibility === 'private'}
            onChoisir={() => maj({ visibility: 'private' })}
            icone={Lock}
            titre={t('private')}
            description={t('privateText')}
          />
          <CarteChoix
            choisie={b.visibility === 'public'}
            onChoisir={() => maj({ visibility: 'public' })}
            icone={Globe}
            titre={t('public')}
            description={t('publicText')}
          />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-surface">
          <Interrupteur
            actif={b.freeCreation}
            onChange={(v) => maj({ freeCreation: v })}
            label={t('freeCreation')}
            description={t('freeCreationText')}
          />
        </div>

        <div>
          <div className="mb-3 flex items-baseline justify-between">
            <Label>{t('invite')}</Label>
            {b.invite.length > 0 && (
              <span className="text-xs text-primary">
                {t('invited', { count: b.invite.length })}
              </span>
            )}
          </div>
          {etatAmis === 'erreur' && <Message>{t('friendsError')}</Message>}
          {etatAmis === 'aucun' && (
            <p className="rounded-xl border border-dashed border-border-strong px-4 py-6 text-center text-sm text-subtle">
              {t('noFriends')}
            </p>
          )}
          {etatAmis === 'liste' && (
            <ul className="grid gap-2 sm:grid-cols-2">
              {amis.data!.map((a) => {
                const coche = invite(a.id);
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={coche}
                      onClick={() =>
                        maj({
                          invite: coche
                            ? b.invite.filter((i) => i.id !== a.id)
                            : [...b.invite, { id: a.id, name: a.name, avatarUrl: a.avatarUrl }],
                        })
                      }
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors',
                        coche
                          ? 'border-primary/50 bg-primary/[0.07]'
                          : 'border-border hover:bg-surface-2',
                      )}
                    >
                      <AvatarJoueur nom={a.name} url={a.avatarUrl} taille="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{a.name}</span>
                        {a.title && (
                          <span className="block truncate text-xs text-subtle">{a.title}</span>
                        )}
                      </span>
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-md border',
                          coche
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-border-strong',
                        )}
                      >
                        {coche && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
