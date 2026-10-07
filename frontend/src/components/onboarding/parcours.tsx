'use client';

import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ChevronDown,
  Dices,
  Globe,
  LogIn,
  Swords,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CampagnesOuvertes } from '@/components/campagnes/public-campaigns';
import { InvitationsRecues } from '@/components/campagnes/received-invitations';
import { AvatarJoueur, Message } from '@/components/compte/elements';
import { useEnvoiImage } from '@/components/compte/envoi-image';
import { EnTeteFocus, ProgressionEtapes } from '@/components/shell/cadre-focus';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { LONGUEUR_CODE, useRejoindreCampagne } from '@/lib/campagnes';
import { onboardingFini } from '@/lib/onboarding';
import { modifierMonProfil } from '@/lib/profil';
import { cheminInterne } from '@/lib/redirection';
import { useProfil, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/** Étapes du parcours ; nom affiché : `onboarding.steps.<id>`. */
const ETAPES = [{ id: 'bienvenue' }, { id: 'profil' }, { id: 'depart' }] as const;

export function ParcoursOnboarding() {
  const t = useTranslations();
  const profil = useProfil();
  const { modifierPreferences, remplacerProfil } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const suite = cheminInterne(params.get('suite'), '/accueil');

  // L'étape est dans l'URL : un retour depuis un assistant (campagne…) retombe au même endroit
  const [etape, setEtape] = useState(() => {
    const e = Number(params.get('etape'));
    return Number.isInteger(e) && e >= 0 && e < ETAPES.length ? e : 0;
  });
  const [sens, setSens] = useState(1);
  const [nom, setNom] = useState(profil.name);
  const [bio, setBio] = useState(profil.bio ?? '');
  const [envoi, setEnvoi] = useState(false);

  function aller(i: number) {
    setSens(i > etape ? 1 : -1);
    setEtape(i);
    const p = new URLSearchParams(params);
    p.set('etape', String(i));
    router.replace(`/bienvenue?${p}`, { scroll: false });
  }

  async function enregistrerProfil() {
    const modif: { name?: string; bio?: string } = {};
    if (nom.trim() && nom.trim() !== profil.name) modif.name = nom.trim();
    if (bio.trim() !== (profil.bio ?? '')) modif.bio = bio.trim();
    if (Object.keys(modif).length === 0) return true;
    try {
      remplacerProfil(await modifierMonProfil(modif));
      return true;
    } catch (err) {
      toast.error(messageErreur(err));
      return false;
    }
  }

  /** Termine l'onboarding (enregistré avant toute navigation, sinon l'app y renverrait). */
  async function terminer(destination: string) {
    setEnvoi(true);
    try {
      await modifierPreferences({ onboarding: onboardingFini() });
      router.replace(destination);
    } catch (err) {
      toast.error(messageErreur(err));
      setEnvoi(false);
    }
  }

  async function suivant() {
    if (etape === 1 && !(await enregistrerProfil())) return;
    aller(Math.min(etape + 1, ETAPES.length - 1));
  }

  const peutContinuer = etape !== 1 || nom.trim().length > 0;
  const derniere = etape === ETAPES.length - 1;

  return (
    <div className="flex min-h-dvh flex-col">
      <EnTeteFocus
        centre={
          etape > 0 ? (
            <ProgressionEtapes
              etapes={ETAPES.map((e) => ({ id: e.id, nom: t(`onboarding.steps.${e.id}`) }))}
              courante={etape}
              onAller={aller}
            />
          ) : undefined
        }
        quitter={{ onClick: () => void terminer(suite) }}
        libelleQuitter={t('onboarding.skip')}
      />

      <div className="relative flex flex-1 flex-col">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-halo" />
        <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-10 sm:py-14">
          <AnimatePresence mode="wait" custom={sens}>
            <motion.section
              key={etape}
              custom={sens}
              initial={{ opacity: 0, x: sens * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: sens * -40 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="flex-1"
            >
              {etape === 0 && <EtapeBienvenue nom={profil.name} onCommencer={() => aller(1)} />}
              {etape === 1 && <EtapeProfil nom={nom} setNom={setNom} bio={bio} setBio={setBio} />}
              {etape === 2 && <EtapeDepart envoi={envoi} onTerminer={terminer} />}
            </motion.section>
          </AnimatePresence>

          {etape > 0 && !derniere && (
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button variant="ghost" onClick={() => aller(etape - 1)}>
                <ArrowLeft />
                {t('common.actions.back')}
              </Button>
              <Button size="lg" onClick={() => void suivant()} disabled={!peutContinuer}>
                {t('common.actions.continue')}
                <ArrowRight />
              </Button>
            </div>
          )}
          {derniere && (
            <div className="mt-10 flex justify-start border-t border-border pt-6">
              <Button variant="ghost" onClick={() => aller(etape - 1)}>
                <ArrowLeft />
                {t('common.actions.back')}
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
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
      <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{titre}</h1>
      {description && (
        <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ─── Étape 0 : bienvenue ─────────────────────────────────────────────────────

function EtapeBienvenue({ nom, onCommencer }: Readonly<{ nom: string; onCommencer: () => void }>) {
  const t = useTranslations();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 14, delay: 0.1 }}
        className="relative mb-8"
      >
        <span
          aria-hidden
          className="absolute inset-0 animate-glow-pulse-few rounded-3xl bg-primary/30 blur-2xl motion-reduce:animate-none"
        />
        <span className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-strong via-primary to-primary/50 shadow-glow">
          <Dices className="size-9 text-primary-foreground" />
        </span>
      </motion.div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
        {t('onboarding.welcome')}
      </p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        {t.rich('onboarding.hello', {
          name: nom,
          b: (chunks) => <span className="font-display text-gradient-primary">{chunks}</span>,
        })}
      </h1>
      <p className="mt-4 max-w-md text-balance text-[15px] leading-relaxed text-muted-foreground">
        {t('onboarding.lead')}
      </p>
      <Button size="xl" className="group mt-8" onClick={onCommencer}>
        {t('onboarding.start')}
        <ArrowRight className="transition-transform group-hover:translate-x-0.5" />
      </Button>
    </div>
  );
}

// ─── Étape 1 : profil ────────────────────────────────────────────────────────

function EtapeProfil({
  nom,
  setNom,
  bio,
  setBio,
}: Readonly<{
  nom: string;
  setNom: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
}>) {
  const t = useTranslations();
  const profil = useProfil();
  const avatar = useEnvoiImage('avatar');

  return (
    <>
      <TitreEtape
        surtitre={t('onboarding.steps.profil')}
        titre={t('onboarding.nameQuestion')}
        description={t('onboarding.nameHint')}
      />
      <div className="grid gap-8 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-3">
          {avatar.input}
          <div className="relative">
            <AvatarJoueur
              nom={nom || profil.name}
              url={avatar.apercu ?? profil.avatarUrl}
              bordure={profil.borderType}
              taille="xl"
            />
            <button
              type="button"
              onClick={avatar.ouvrir}
              aria-label={t('onboarding.pickAvatar')}
              className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-muted-foreground shadow-elevated transition-colors hover:text-primary"
            >
              <Camera className="size-4" />
            </button>
          </div>
          {avatar.enAttente ? (
            <div className="flex gap-2">
              <Button size="xs" variant="ghost" onClick={avatar.annuler}>
                {t('common.actions.cancel')}
              </Button>
              <Button size="xs" loading={avatar.envoi} onClick={avatar.enregistrer}>
                {t('common.actions.save')}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-subtle">{t('onboarding.avatarFormats')}</p>
          )}
        </div>
        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="onb-nom">Nom d&apos;aventurier</Label>
            <Input
              id="onb-nom"
              value={nom}
              maxLength={64}
              onChange={(e) => setNom(e.target.value)}
              className="h-11 text-base"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="onb-bio">{t('onboarding.aboutYou')}</Label>
              <span className="text-xs text-subtle">{t('onboarding.optional')}</span>
            </div>
            <Textarea
              id="onb-bio"
              value={bio}
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('onboarding.bioPlaceholder')}
              className="min-h-[110px]"
            />
          </div>
          {avatar.erreur && <Message>{avatar.erreur}</Message>}
        </div>
      </div>
    </>
  );
}

// ─── Étape 2 : rôle et expérience ────────────────────────────────────────────

function EtapeDepart({
  envoi,
  onTerminer,
}: Readonly<{
  envoi: boolean;
  onTerminer: (destination: string) => Promise<void>;
}>) {
  const t = useTranslations();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [ouvertes, setOuvertes] = useState(false);
  const rejoindre = useRejoindreCampagne();

  // Un héros naît dans une campagne : après avoir rejoint, on le choisit ou on le crée
  // pour cette table, dont le système est imposé.
  async function rejoindreCampagne() {
    try {
      const c = await rejoindre.mutateAsync(code);
      await onTerminer(`/campagnes/${c.id}/personnage`);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  return (
    <>
      <TitreEtape
        surtitre={t('onboarding.steps.depart')}
        titre={t('onboarding.whereStart')}
        description={t('onboarding.whereStartHint')}
      />

      {/* Un ami m'a invité : on entre sans code, puis on choisit son héros */}
      <InvitationsRecues
        className="mb-4"
        onRejointe={(c) => onTerminer(`/campagnes/${c.id}/personnage`)}
      />

      <div className="rounded-2xl border border-primary/50 bg-primary/[0.06] p-5 shadow-glow">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary">
              <LogIn className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold">{t('onboarding.joinCampaign')}</p>
              <p className="mt-1 text-[13px] text-muted-foreground">
                Votre MJ vous a donné un code à {LONGUEUR_CODE} caractères.
              </p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (code.length === LONGUEUR_CODE) void rejoindreCampagne();
            }}
            className="flex flex-wrap items-center gap-3"
          >
            <InputOTP
              maxLength={LONGUEUR_CODE}
              value={code}
              onChange={(v) => setCode(v.toUpperCase())}
              pattern="^[A-Za-z0-9]*$"
              aria-label={t('onboarding.campaignCode')}
            >
              <InputOTPGroup>
                {Array.from({ length: LONGUEUR_CODE }, (_, i) => (
                  <InputOTPSlot
                    key={i}
                    index={i}
                    className="size-10 text-base sm:size-11 sm:text-lg"
                  />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <Button
              type="submit"
              disabled={code.length !== LONGUEUR_CODE || envoi}
              loading={rejoindre.isPending}
            >
              {t('common.actions.join')}
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card shadow-surface">
        <button
          type="button"
          aria-expanded={ouvertes}
          onClick={() => setOuvertes((v) => !v)}
          className="group flex w-full items-center gap-4 p-5 text-left"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary">
            <Globe className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold">{t('onboarding.openCampaigns')}</span>
            <span className="mt-1 block text-[13px] text-muted-foreground">
              {t('onboarding.openCampaignsHint')}
            </span>
          </span>
          <ChevronDown
            className={cn(
              'size-4 shrink-0 text-subtle transition-transform',
              ouvertes && 'rotate-180',
            )}
          />
        </button>
        {ouvertes && (
          <div className="border-t border-border p-5">
            <CampagnesOuvertes
              compacte
              onRejointe={(c) => onTerminer(`/campagnes/${c.id}/personnage`)}
            />
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={envoi}
        // L'onboarding n'est terminé qu'à la création : quitter l'assistant ramène ici
        onClick={() => router.push('/campagnes/nouvelle?depuis=bienvenue')}
        className="group mt-3 flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong disabled:opacity-60"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary">
          <Swords className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-base font-semibold">
            {t('onboarding.createCampaign')}
            <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </span>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            {t('onboarding.createCampaignHint')}
          </span>
        </span>
      </button>

      <div className="mt-6 text-center">
        <Button variant="link" disabled={envoi} onClick={() => void onTerminer('/accueil')}>
          {t('onboarding.explore')}
        </Button>
      </div>
    </>
  );
}
