'use client';

import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  Compass,
  Crown,
  Feather,
  LogIn,
  Sparkles,
  Swords,
  Trophy,
  UserRound,
  Wand2,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { CarteChoix } from '@/components/commun/carte-choix';
import { AvatarJoueur, Message } from '@/components/compte/elements';
import { useEnvoiImage } from '@/components/compte/envoi-image';
import { EnTeteFocus, ProgressionEtapes } from '@/components/shell/cadre-focus';
import { CarteSysteme, CarteSystemeSquelette } from '@/components/systemes/carte-systeme';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { messageErreur } from '@/lib/api';
import { LONGUEUR_CODE, useRejoindreCampagne } from '@/lib/campagnes';
import type { Experience, Onboarding, RoleJeu } from '@/lib/onboarding';
import { modifierMonProfil } from '@/lib/profil';
import { cheminInterne } from '@/lib/redirection';
import { useProfil, useSession } from '@/lib/session';
import { useSystemes } from '@/lib/systemes';
import { cn } from '@/lib/utils';

const ETAPES = [
  { id: 'bienvenue', nom: 'Bienvenue' },
  { id: 'profil', nom: 'Votre profil' },
  { id: 'style', nom: 'Votre façon de jouer' },
  { id: 'univers', nom: 'Vos univers' },
  { id: 'depart', nom: 'Premier pas' },
];

const EXPERIENCES: { id: Experience; titre: string; description: string; icone: typeof Feather }[] =
  [
    {
      id: 'decouverte',
      titre: 'Je découvre',
      description: 'Premières parties : on vous guide pas à pas.',
      icone: Feather,
    },
    {
      id: 'initie',
      titre: 'Initié',
      description: 'Quelques campagnes au compteur.',
      icone: Compass,
    },
    {
      id: 'veteran',
      titre: 'Vétéran',
      description: 'Des années de dés roulés et de tables animées.',
      icone: Trophy,
    },
  ];

/**
 * Parcours d'accueil d'un nouveau compte : profil, rôle, expérience, systèmes
 * préférés, puis une première action. Les réponses vont dans
 * `settings.onboarding` (voir lib/onboarding).
 */
export function ParcoursOnboarding() {
  const profil = useProfil();
  const { modifierPreferences, remplacerProfil } = useSession();
  const router = useRouter();
  const suite = cheminInterne(useSearchParams().get('suite'), '/accueil');

  const [etape, setEtape] = useState(0);
  const [sens, setSens] = useState(1);
  const [nom, setNom] = useState(profil.name);
  const [bio, setBio] = useState(profil.bio ?? '');
  const [roles, setRoles] = useState<RoleJeu[]>(['joueur']);
  const [experience, setExperience] = useState<Experience>('initie');
  const [systemes, setSystemes] = useState<string[]>([]);
  const [envoi, setEnvoi] = useState(false);

  function aller(i: number) {
    setSens(i > etape ? 1 : -1);
    setEtape(i);
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
      const onboarding: Onboarding = {
        version: 1,
        termineLe: new Date().toISOString(),
        roles,
        experience,
        systemes,
      };
      await modifierPreferences({ onboarding });
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
            <ProgressionEtapes etapes={ETAPES} courante={etape} onAller={aller} />
          ) : undefined
        }
        quitter={{ onClick: () => void terminer(suite) }}
        libelleQuitter="Passer"
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
              {etape === 2 && (
                <EtapeStyle
                  roles={roles}
                  setRoles={setRoles}
                  experience={experience}
                  setExperience={setExperience}
                />
              )}
              {etape === 3 && <EtapeUnivers choisis={systemes} setChoisis={setSystemes} />}
              {etape === 4 && <EtapeDepart roles={roles} envoi={envoi} onTerminer={terminer} />}
            </motion.section>
          </AnimatePresence>

          {etape > 0 && !derniere && (
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-border pt-6">
              <Button variant="ghost" onClick={() => aller(etape - 1)}>
                <ArrowLeft />
                Retour
              </Button>
              <Button size="lg" onClick={() => void suivant()} disabled={!peutContinuer}>
                Continuer
                <ArrowRight />
              </Button>
            </div>
          )}
          {derniere && (
            <div className="mt-10 flex justify-start border-t border-border pt-6">
              <Button variant="ghost" onClick={() => aller(etape - 1)}>
                <ArrowLeft />
                Retour
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
}: {
  surtitre: string;
  titre: ReactNode;
  description?: ReactNode;
}) {
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

function EtapeBienvenue({ nom, onCommencer }: { nom: string; onCommencer: () => void }) {
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
          className="absolute inset-0 animate-glow-pulse rounded-3xl bg-primary/30 blur-2xl"
        />
        <span className="relative flex size-20 items-center justify-center rounded-3xl bg-gradient-to-br from-primary-strong via-primary to-primary/50 shadow-glow">
          <Sparkles className="size-9 text-primary-foreground" />
        </span>
      </motion.div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">
        Bienvenue sur Yner
      </p>
      <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Salut, <span className="font-display text-gradient-primary">{nom}</span>.
      </h1>
      <p className="mt-4 max-w-md text-balance text-[15px] leading-relaxed text-muted-foreground">
        Quatre questions pour préparer votre table : qui vous êtes, comment vous jouez, et vos
        univers favoris. Moins d&apos;une minute.
      </p>
      <Button size="xl" className="group mt-8" onClick={onCommencer}>
        Commencer
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
}: {
  nom: string;
  setNom: (v: string) => void;
  bio: string;
  setBio: (v: string) => void;
}) {
  const profil = useProfil();
  const avatar = useEnvoiImage('avatar');

  return (
    <>
      <TitreEtape
        surtitre="Votre profil"
        titre="Comment vous appelle-t-on à la table ?"
        description="C'est ce que verront vos compagnons d'aventure. Vous pourrez tout changer plus tard."
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
              aria-label="Choisir un avatar"
              className="absolute bottom-1 right-1 flex size-9 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-muted-foreground shadow-elevated transition-colors hover:text-primary"
            >
              <Camera className="size-4" />
            </button>
          </div>
          {avatar.enAttente ? (
            <div className="flex gap-2">
              <Button size="xs" variant="ghost" onClick={avatar.annuler}>
                Annuler
              </Button>
              <Button size="xs" loading={avatar.envoi} onClick={avatar.enregistrer}>
                Enregistrer
              </Button>
            </div>
          ) : (
            <p className="text-xs text-subtle">PNG, JPEG, WebP, 5 Mo max.</p>
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
              <Label htmlFor="onb-bio">Quelques mots sur vous</Label>
              <span className="text-xs text-subtle">Facultatif</span>
            </div>
            <Textarea
              id="onb-bio"
              value={bio}
              maxLength={500}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Rôliste depuis le lycée, fan de donjons humides et de PNJ bavards…"
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

function EtapeStyle({
  roles,
  setRoles,
  experience,
  setExperience,
}: {
  roles: RoleJeu[];
  setRoles: (r: RoleJeu[]) => void;
  experience: Experience;
  setExperience: (e: Experience) => void;
}) {
  const basculer = (r: RoleJeu) => {
    const suivant = roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r];
    setRoles(suivant.length ? suivant : [r]);
  };
  return (
    <>
      <TitreEtape
        surtitre="Votre façon de jouer"
        titre="De quel côté de l'écran êtes-vous ?"
        description="Choisissez les deux si vous alternez : l'accueil s'adaptera."
      />
      <div role="group" aria-label="Rôles" className="grid gap-3 sm:grid-cols-2">
        <CarteChoix
          multiple
          choisie={roles.includes('joueur')}
          onChoisir={() => basculer('joueur')}
          icone={UserRound}
          titre="Joueur"
          description="J'incarne un héros, je lance les dés et je vis l'histoire."
        />
        <CarteChoix
          multiple
          choisie={roles.includes('mj')}
          onChoisir={() => basculer('mj')}
          icone={Crown}
          titre="Maître du jeu"
          description="Je prépare les aventures, j'anime la table et j'arbitre les règles."
        />
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold">Votre expérience</h2>
      <div role="radiogroup" aria-label="Expérience" className="grid gap-3 sm:grid-cols-3">
        {EXPERIENCES.map((e) => (
          <CarteChoix
            key={e.id}
            choisie={experience === e.id}
            onChoisir={() => setExperience(e.id)}
            icone={e.icone}
            titre={e.titre}
            description={e.description}
          />
        ))}
      </div>
    </>
  );
}

// ─── Étape 3 : univers ───────────────────────────────────────────────────────

function EtapeUnivers({
  choisis,
  setChoisis,
}: {
  choisis: string[];
  setChoisis: (s: string[]) => void;
}) {
  const systemes = useSystemes();
  return (
    <>
      <TitreEtape
        surtitre="Vos univers"
        titre="À quoi aimez-vous jouer ?"
        description="Ces systèmes sont prêts à l'emploi : fiches calculées, création guidée, dés adaptés. Vous en créerez d'autres plus tard."
      />
      <div
        role="group"
        aria-label="Systèmes de jeu"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {systemes.isLoading &&
          Array.from({ length: 3 }, (_, i) => <CarteSystemeSquelette key={i} />)}
        {systemes.data?.map((s) => (
          <CarteSysteme
            key={s.id}
            systeme={s}
            multiple
            choisie={choisis.includes(s.id)}
            onChoisir={() =>
              setChoisis(
                choisis.includes(s.id) ? choisis.filter((x) => x !== s.id) : [...choisis, s.id],
              )
            }
          />
        ))}
      </div>
      {systemes.isError && <Message className="mt-4">Impossible de charger les systèmes.</Message>}
    </>
  );
}

// ─── Étape 4 : premier pas ───────────────────────────────────────────────────

function EtapeDepart({
  roles,
  envoi,
  onTerminer,
}: {
  roles: RoleJeu[];
  envoi: boolean;
  onTerminer: (destination: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const rejoindre = useRejoindreCampagne();
  const mj = roles.includes('mj');

  async function rejoindreCampagne() {
    try {
      const c = await rejoindre.mutateAsync(code);
      await onTerminer(`/campagnes/${c.id}`);
    } catch (err) {
      toast.error(messageErreur(err));
    }
  }

  const choix = [
    {
      id: 'campagne',
      titre: 'Créer une campagne',
      description: 'Choisissez un système, une ambiance, et invitez vos joueurs.',
      icone: Swords,
      href: '/campagnes/nouvelle',
      conseille: mj,
    },
    {
      id: 'personnage',
      titre: 'Créer un personnage',
      description: 'Un assistant guidé, calculé par les règles du système.',
      icone: Wand2,
      href: '/personnages/nouveau',
      conseille: !mj,
    },
  ];

  return (
    <>
      <TitreEtape
        surtitre="Premier pas"
        titre="Par où commence l'aventure ?"
        description="Tout est prêt. Choisissez votre première quête."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {choix.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={envoi}
            onClick={() => void onTerminer(c.href)}
            className={cn(
              'group relative flex flex-col gap-4 overflow-hidden rounded-2xl border p-5 text-left transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-60',
              c.conseille
                ? 'border-primary/50 bg-primary/[0.06] shadow-glow'
                : 'border-border bg-card shadow-surface hover:border-border-strong',
            )}
          >
            {c.conseille && (
              <span className="absolute right-4 top-4 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">
                Conseillé
              </span>
            )}
            <span className="flex size-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary">
              <c.icone className="size-5" />
            </span>
            <span>
              <span className="flex items-center gap-2 text-base font-semibold">
                {c.titre}
                <ArrowRight className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </span>
              <span className="mt-1 block text-[13px] text-muted-foreground">{c.description}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-border bg-card p-5 shadow-surface">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-primary">
              <LogIn className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold">Rejoindre une campagne</p>
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
              aria-label="Code de la campagne"
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
              disabled={code.length !== LONGUEUR_CODE}
              loading={rejoindre.isPending}
            >
              Rejoindre
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Button variant="link" disabled={envoi} onClick={() => void onTerminer('/accueil')}>
          Explorer par moi-même
        </Button>
      </div>
    </>
  );
}
