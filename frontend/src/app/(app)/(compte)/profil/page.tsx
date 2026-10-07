'use client';

import { Camera, Check, Clock, Crown, ImagePlus, Lock, Mail, CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  AvatarJoueur,
  BORDURES,
  Bouton,
  Carte,
  Chargement,
  Interrupteur,
  Message,
  TitrePage,
} from '@/components/compte/elements';
import { useYoutubeConsent } from '@/components/audio/youtube-consent';
import { ProgressionCard } from '@/components/progression/progression-card';
import { Info } from '@/components/ui/tooltip';
import { useEnvoiImage } from '@/components/compte/envoi-image';
import { styleChamp, styleLabel } from '@/components/compte/styles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LocaleSwitcher } from '@/components/i18n/locale-switcher';
import { useDates } from '@/i18n/dates';
import { messageErreur } from '@/lib/api';
import { setYoutubeConsent } from '@/lib/consent/youtube';
import {
  choisirTitre,
  lireJoueur,
  lireMesTitres,
  lireTitres,
  modifierMonProfil,
  type ModificationProfil,
  type Profil,
  texteCondition,
} from '@/lib/profil';
import { useProgression } from '@/lib/progression';
import { useRessource } from '@/lib/ressource';
import { envoyerVerificationEmail } from '@/lib/securite';
import { useProfil, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const LONGUEUR_MAX_NOM = 64;
const LONGUEUR_MAX_BIO = 500;

export default function PageProfil() {
  const t = useTranslations('account.profile');
  const profil = useProfil();
  // Le statut premium n'est exposé que par le profil public
  const premium = useRessource(`premium:${profil.id}`, () =>
    lireJoueur(profil.id).then((p) => p.premium),
  );

  return (
    <div className="space-y-6">
      <TitrePage sousTitre={t('lead')}>{t('title')}</TitrePage>
      {profil.email && !profil.emailVerified && <BandeauVerification email={profil.email} />}
      <EnTete profil={profil} />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProgressionCard />
        <CarteIdentite profil={profil} />
        <CarteTitre profil={profil} />
        <CarteApparence profil={profil} premium={premium.donnees ?? false} />
        <CartePreferences profil={profil} />
      </div>
    </div>
  );
}

/** Enregistre une modification du profil et met la session à jour. */
function useEnregistrement() {
  const { remplacerProfil } = useSession();
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState(false);

  async function enregistrer(modif: ModificationProfil) {
    setEnvoi(true);
    setErreur(null);
    setSucces(false);
    try {
      remplacerProfil(await modifierMonProfil(modif));
      setSucces(true);
      return true;
    } catch (err) {
      setErreur(messageErreur(err));
      return false;
    } finally {
      setEnvoi(false);
    }
  }

  return { enregistrer, envoi, erreur, succes, effacer: () => setSucces(false) };
}

// ─── Bandeau « e-mail non vérifié » ──────────────────────────────────────────

function BandeauVerification({ email }: Readonly<{ email: string }>) {
  const t = useTranslations('account.profile');
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'envoye'>('repos');
  const [erreur, setErreur] = useState<string | null>(null);

  async function envoyer() {
    setEtat('envoi');
    setErreur(null);
    try {
      await envoyerVerificationEmail();
      setEtat('envoye');
    } catch (err) {
      setErreur(messageErreur(err));
      setEtat('repos');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 text-sm">
          <p className="text-primary-strong">{t('unverified')}</p>
          <p className="break-all text-muted-foreground">
            {etat === 'envoye' ? t('linkSent', { email }) : t('confirm', { email })}
          </p>
          {erreur && <p className="mt-1 text-destructive">{erreur}</p>}
        </div>
      </div>
      <Bouton
        ton={etat === 'envoye' ? 'secondaire' : 'dore'}
        chargement={etat === 'envoi'}
        onClick={envoyer}
        className="shrink-0"
      >
        {etat === 'envoye' ? t('resendLink') : t('sendLink')}
      </Bouton>
    </div>
  );
}

// ─── En-tête : bannière, avatar, résumé ──────────────────────────────────────

function EnTete({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.profile');
  const tc = useTranslations('common.actions');
  const dates = useDates();
  const banniere = useEnvoiImage('banner');
  const avatar = useEnvoiImage('avatar');
  const urlBanniere = banniere.apercu ?? profil.bannerUrl;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-surface-2">
      {banniere.input}
      {avatar.input}
      <div
        className="relative h-32 bg-gradient-to-br from-surface-3 via-surface-2 to-primary/20 bg-cover bg-center sm:h-44"
        style={urlBanniere ? { backgroundImage: `url(${JSON.stringify(urlBanniere)})` } : undefined}
      >
        <div className="absolute right-3 top-3 flex gap-2">
          {banniere.enAttente ? (
            <>
              <Bouton ton="secondaire" size="sm" className="bg-black/60" onClick={banniere.annuler}>
                {tc('cancel')}
              </Bouton>
              <Bouton size="sm" chargement={banniere.envoi} onClick={banniere.enregistrer}>
                {t('saveBanner')}
              </Bouton>
            </>
          ) : (
            <Bouton ton="secondaire" size="sm" className="bg-black/60" onClick={banniere.ouvrir}>
              <ImagePlus />
              <span className="hidden sm:inline">{t('changeBanner')}</span>
            </Bouton>
          )}
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <div className="relative w-fit">
            <AvatarJoueur
              nom={profil.name}
              url={avatar.apercu ?? profil.avatarUrl}
              bordure={profil.borderType}
              taille="xl"
            />
            {!avatar.enAttente && (
              <button
                type="button"
                onClick={avatar.ouvrir}
                aria-label={t('changeAvatar')}
                className="absolute bottom-1 right-1 rounded-full border border-border-strong bg-surface-2 p-2 text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="truncate font-display text-2xl font-semibold text-foreground">
              {profil.name}
            </h2>
            {profil.title && <p className="text-sm text-primary">{profil.title}</p>}
          </div>
        </div>

        {avatar.enAttente && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('avatarPreview')}</span>
            <Bouton ton="secondaire" size="sm" onClick={avatar.annuler}>
              {tc('cancel')}
            </Bouton>
            <Bouton size="sm" chargement={avatar.envoi} onClick={avatar.enregistrer}>
              {t('saveAvatar')}
            </Bouton>
          </div>
        )}
        {(avatar.erreur || banniere.erreur) && (
          <div className="mt-4 space-y-2">
            {banniere.erreur && <Message>{t('bannerError', { error: banniere.erreur })}</Message>}
            {avatar.erreur && <Message>{t('avatarError', { error: avatar.erreur })}</Message>}
          </div>
        )}

        {profil.bio && (
          <p className="mt-4 whitespace-pre-line text-sm text-foreground/85">{profil.bio}</p>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Statistique
            icone={Clock}
            label={t('playTime')}
            valeur={dates.duration(profil.timeSpentMinutes)}
          />
          <Statistique
            icone={CalendarDays}
            label={t('memberSince')}
            valeur={dates.date(profil.createdAt)}
          />
          <Statistique icone={Mail} label={t('email')} valeur={profil.email ?? '—'} />
        </dl>
        <p className="mt-3 text-xs text-subtle">{t('imageHint')}</p>
      </div>
    </section>
  );
}

function Statistique({
  icone: Icone,
  label,
  valeur,
}: Readonly<{
  icone: typeof Clock;
  label: string;
  valeur: string;
}>) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-surface-2/60 px-3 py-2.5">
      <Icone className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0">
        <dt className="text-xs text-subtle">{label}</dt>
        <dd className="truncate text-foreground">{valeur}</dd>
      </div>
    </div>
  );
}

// ─── Nom et bio ──────────────────────────────────────────────────────────────

function CarteIdentite({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.profile');
  const tc = useTranslations('common.actions');
  const [nom, setNom] = useState(profil.name);
  const [bio, setBio] = useState(profil.bio ?? '');
  const { enregistrer, envoi, erreur, succes, effacer } = useEnregistrement();

  const modifie = nom.trim() !== profil.name || bio.trim() !== (profil.bio ?? '');

  async function valider(e: FormEvent) {
    e.preventDefault();
    const modif: ModificationProfil = {};
    if (nom.trim() !== profil.name) modif.name = nom.trim();
    if (bio.trim() !== (profil.bio ?? '')) modif.bio = bio.trim();
    await enregistrer(modif);
  }

  return (
    <Carte titre={t('identity')} description={t('identityLead')}>
      <form onSubmit={valider} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nom" className={styleLabel}>
            {t('name')}
          </Label>
          <Input
            id="nom"
            required
            maxLength={LONGUEUR_MAX_NOM}
            value={nom}
            onChange={(e) => {
              setNom(e.target.value);
              effacer();
            }}
            className={styleChamp}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio" className={styleLabel}>
              {t('bio')}
            </Label>
            <span className="text-xs text-subtle">
              {t('bioCount', { length: bio.length, max: LONGUEUR_MAX_BIO })}
            </span>
          </div>
          <Textarea
            id="bio"
            maxLength={LONGUEUR_MAX_BIO}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              effacer();
            }}
            placeholder={t('bioPlaceholder')}
            className={cn(styleChamp, 'h-auto min-h-[110px] resize-y py-2')}
          />
        </div>
        {erreur && <Message>{erreur}</Message>}
        {succes && !modifie && <Message ton="succes">{t('saved')}</Message>}
        <Bouton type="submit" chargement={envoi} disabled={!modifie || !nom.trim()}>
          {tc('save')}
        </Bouton>
      </form>
    </Carte>
  );
}

// ─── Titre affiché ───────────────────────────────────────────────────────────

function CarteTitre({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.profile');
  const { remplacerProfil } = useSession();
  const debloques = useRessource('mes-titres', lireMesTitres);
  const chargeTitres = debloques.chargement && !debloques.donnees;
  const catalogue = useRessource('titres', lireTitres);
  const [envoi, setEnvoi] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const liste = debloques.donnees ?? [];
  const actuel =
    liste.find((x) => x.label === profil.title || x.slug === profil.title)?.slug ?? null;
  const verrouilles = (catalogue.donnees ?? []).filter(
    (x) => !liste.some((d) => d.slug === x.slug),
  );

  async function choisir(slug: string | null) {
    if (slug === actuel) return;
    setEnvoi(slug ?? '');
    setErreur(null);
    try {
      const { title } = await choisirTitre(slug);
      remplacerProfil({ ...profil, title });
    } catch (err) {
      setErreur(messageErreur(err));
    } finally {
      setEnvoi(null);
    }
  }

  return (
    <Carte titre={t('titleCard')} description={t('titleLead')}>
      {chargeTitres && <Chargement />}
      {!chargeTitres && debloques.erreur && <Message>{debloques.erreur}</Message>}
      {!chargeTitres && !debloques.erreur && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('titleShown')}>
            <PastilleTitre
              label={t('noTitle')}
              actif={actuel === null && !profil.title}
              chargement={envoi === ''}
              onClick={() => choisir(null)}
            />
            {liste.map((x) => (
              <PastilleTitre
                key={x.slug}
                label={x.label}
                actif={actuel === x.slug}
                chargement={envoi === x.slug}
                onClick={() => choisir(x.slug)}
              />
            ))}
          </div>
          {liste.length === 0 && <p className="text-sm text-subtle">{t('noUnlocked')}</p>}
          {erreur && <Message>{erreur}</Message>}
          {verrouilles.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-subtle">{t('toUnlock')}</p>
              <ul className="space-y-2">
                {verrouilles.map((x) => (
                  <li
                    key={x.slug}
                    className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-subtle" />
                    <div className="min-w-0">
                      <p className="text-foreground/85">{x.label}</p>
                      <p className="text-xs text-subtle">
                        {texteCondition(x.condition, x.description)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Carte>
  );
}

function PastilleTitre({
  label,
  actif,
  chargement,
  onClick,
}: Readonly<{
  label: string;
  actif: boolean;
  chargement: boolean;
  onClick(): void;
}>) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={actif}
      onClick={onClick}
      disabled={chargement}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60',
        actif
          ? 'border-primary bg-primary/15 text-primary-strong'
          : 'border-border-strong text-foreground/85 hover:border-subtle',
      )}
    >
      {actif && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

// ─── Bordure et badge premium ────────────────────────────────────────────────

function CarteApparence({ profil, premium }: Readonly<{ profil: Profil; premium: boolean }>) {
  // Bordures acquises par le niveau du compte (docs/progression.md § 5)
  const progression = useProgression();
  const acquises = progression.data?.borders ?? [];
  const palierDe = (id: string) =>
    progression.data?.rewards.find((r) => r.type === 'border' && r.id === id)?.level;
  const t = useTranslations('account');
  const tc = useTranslations('common.actions');
  const [bordure, setBordure] = useState(profil.borderType);
  const [badge, setBadge] = useState(profil.showPremiumBadge);
  const { enregistrer, envoi, erreur, succes, effacer } = useEnregistrement();

  useEffect(() => {
    setBordure(profil.borderType);
    setBadge(profil.showPremiumBadge);
  }, [profil.borderType, profil.showPremiumBadge]);

  const modifie = bordure !== profil.borderType || badge !== profil.showPremiumBadge;

  function valider() {
    const modif: ModificationProfil = {};
    if (bordure !== profil.borderType) modif.borderType = bordure;
    if (badge !== profil.showPremiumBadge) modif.showPremiumBadge = badge;
    void enregistrer(modif);
  }

  return (
    <Carte
      titre={t('profile.appearance')}
      description={t('profile.appearanceLead')}
      action={
        <AvatarJoueur nom={profil.name} url={profil.avatarUrl} bordure={bordure} taille="md" />
      }
    >
      <div className="space-y-4">
        {!premium && (
          <p className="flex items-center gap-2 text-xs text-subtle">
            <Crown className="h-3.5 w-3.5 text-primary" />
            {t('profile.levelBorders')}
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BORDURES.map((b) => {
            const verrou =
              !premium && b.id !== 'none' && b.id !== profil.borderType && !acquises.includes(b.id);
            const palier = palierDe(b.id);
            const bouton = (
              <button
                key={b.id}
                type="button"
                disabled={verrou}
                aria-pressed={bordure === b.id}
                onClick={() => {
                  setBordure(b.id);
                  effacer();
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  bordure === b.id
                    ? 'border-primary bg-primary/10 text-primary-strong'
                    : 'border-border text-muted-foreground hover:border-border-strong',
                )}
              >
                <span
                  className="relative h-6 w-6 rounded-full border border-border-strong"
                  style={
                    b.couleurs.length
                      ? {
                          background:
                            b.couleurs.length === 1
                              ? b.couleurs[0]
                              : `conic-gradient(${[...b.couleurs, b.couleurs[0]].join(', ')})`,
                        }
                      : undefined
                  }
                >
                  {verrou && <Lock className="absolute inset-0 m-auto h-3 w-3 text-white" />}
                </span>
                <span className="text-center">{t(`borders.${b.id}`)}</span>
              </button>
            );
            if (!verrou) return bouton;
            return (
              <Info key={b.id} texte={palier ? `Niveau ${palier} ou Premium` : 'Premium'}>
                <span
                  tabIndex={0}
                  className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {bouton}
                </span>
              </Info>
            );
          })}
        </div>
        <Interrupteur
          actif={badge}
          onChange={(v) => {
            setBadge(v);
            effacer();
          }}
          label={t('profile.premiumBadge')}
          description={premium ? t('profile.premiumBadgeOn') : t('profile.premiumBadgeOff')}
        />
        {erreur && <Message>{erreur}</Message>}
        {succes && !modifie && <Message ton="succes">{t('profile.appearanceSaved')}</Message>}
        <Bouton onClick={valider} chargement={envoi} disabled={!modifie}>
          {tc('save')}
        </Bouton>
      </div>
    </Carte>
  );
}

// ─── Préférences ─────────────────────────────────────────────────────────────

/** Accord au lecteur YouTube, propre à ce navigateur (stockage local). */
function ReglageYoutube() {
  const t = useTranslations('account.profile');
  const consent = useYoutubeConsent();
  return (
    <Interrupteur
      actif={consent === 'granted'}
      onChange={(v) => setYoutubeConsent(v ? 'granted' : 'denied')}
      label={t('youtube')}
      description={t('youtubeText')}
    />
  );
}

function CartePreferences({ profil }: Readonly<{ profil: Profil }>) {
  const t = useTranslations('account.profile');
  const { enregistrer, envoi, erreur } = useEnregistrement();

  return (
    <Carte titre={t('preferences')}>
      <div className="space-y-4">
        {/* Langue : ce navigateur et le compte (docs/i18n.md § 3) */}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-foreground">{t('language')}</p>
          <LocaleSwitcher className="w-40" />
        </div>
        <Interrupteur
          actif={profil.emailNotifications}
          disabled={envoi}
          onChange={(v) => void enregistrer({ emailNotifications: v })}
          label={t('emailNotifications')}
          description={t('emailNotificationsText')}
        />
        <ReglageYoutube />
        <div className="flex items-center justify-between gap-4 border-t border-border pt-4">
          <div>
            <p className="text-sm font-medium">{t('welcome')}</p>
            <p className="text-[13px] text-muted-foreground">{t('welcomeText')}</p>
          </div>
          <Button variant="secondary" size="sm" asChild>
            <Link href="/bienvenue">{t('welcomeAgain')}</Link>
          </Button>
        </div>
        {erreur && <Message>{erreur}</Message>}
      </div>
    </Carte>
  );
}
