'use client';

import { Camera, Check, Clock, Crown, ImagePlus, Lock, Mail, CalendarDays } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import {
  PlayerAvatar,
  BORDERS,
  AppButton,
  Card,
  Loading,
  formatDate,
  formatDuration,
  Switch,
  Message,
  PageTitle,
} from '@/components/account/elements';
import { useImageUpload } from '@/components/account/image-upload';
import { aclonica, inputStyle, labelStyle } from '@/components/account/styles';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/api';
import {
  chooseTitle,
  getPlayer,
  getMyTitles,
  getTitles,
  updateMyProfile,
  type ProfileUpdate,
  type Profile,
  conditionText,
} from '@/lib/profile';
import { useResource } from '@/lib/resource';
import { sendVerificationEmail } from '@/lib/security';
import { useProfile, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const MAX_NAME_LENGTH = 64;
const MAX_BIO_LENGTH = 500;

export default function ProfilePage() {
  const profile = useProfile();
  // Le statut premium n'est exposé que par le profil public
  const premium = useResource(`premium:${profile.id}`, () =>
    getPlayer(profile.id).then((p) => p.premium),
  );

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Ce que les autres joueurs voient de vous, et vos préférences.">
        Mon profil
      </PageTitle>
      {profile.email && !profile.emailVerified && <VerificationBanner email={profile.email} />}
      <Header profile={profile} />
      <div className="grid gap-6 lg:grid-cols-2">
        <IdentityCard profile={profile} />
        <TitleCard profile={profile} />
        <AppearanceCard profile={profile} premium={premium.data ?? false} />
        <PreferencesCard profile={profile} />
      </div>
    </div>
  );
}

/** Enregistre une modification du profil et met la session à jour. */
function useSave() {
  const { replaceProfile } = useSession();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function save(update: ProfileUpdate) {
    setSending(true);
    setError(null);
    setSuccess(false);
    try {
      replaceProfile(await updateMyProfile(update));
      setSuccess(true);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSending(false);
    }
  }

  return {
    save,
    sending,
    error,
    success,
    clear: () => setSuccess(false),
  };
}

// ─── Bandeau « e-mail non vérifié » ──────────────────────────────────────────

function VerificationBanner({ email }: { email: string }) {
  const [state, setState] = useState<'repos' | 'envoi' | 'envoye'>('repos');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState('envoi');
    setError(null);
    try {
      await sendVerificationEmail();
      setState('envoye');
    } catch (err) {
      setError(errorMessage(err));
      setState('repos');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#c9a965]/30 bg-[#c9a965]/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <Mail className="mt-0.5 h-5 w-5 shrink-0 text-[#c9a965]" />
        <div className="min-w-0 text-sm">
          <p className="text-[#e2cc97]">Votre adresse e-mail n&apos;est pas vérifiée.</p>
          <p className="break-all text-zinc-400">
            {state === 'envoye'
              ? `Lien envoyé à ${email} : ouvrez-le pour confirmer votre adresse.`
              : `Confirmez ${email} pour sécuriser votre compte.`}
          </p>
          {error && <p className="mt-1 text-red-300">{error}</p>}
        </div>
      </div>
      <AppButton
        tone={state === 'envoye' ? 'secondaire' : 'dore'}
        loading={state === 'envoi'}
        onClick={send}
        className="shrink-0"
      >
        {state === 'envoye' ? 'Renvoyer le lien' : 'Envoyer le lien'}
      </AppButton>
    </div>
  );
}

// ─── En-tête : bannière, avatar, résumé ──────────────────────────────────────

function Header({ profile }: { profile: Profile }) {
  const banner = useImageUpload('banner');
  const avatar = useImageUpload('avatar');
  const bannerUrl = banner.preview ?? profile.bannerUrl;

  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      {banner.input}
      {avatar.input}
      <div
        className="relative h-32 bg-gradient-to-br from-zinc-800 via-zinc-900 to-[#c9a965]/20 bg-cover bg-center sm:h-44"
        style={bannerUrl ? { backgroundImage: `url(${JSON.stringify(bannerUrl)})` } : undefined}
      >
        <div className="absolute right-3 top-3 flex gap-2">
          {banner.pending ? (
            <>
              <AppButton
                tone="secondaire"
                size="sm"
                className="bg-black/60"
                onClick={banner.cancel}
              >
                Annuler
              </AppButton>
              <AppButton size="sm" loading={banner.sending} onClick={banner.save}>
                Enregistrer la bannière
              </AppButton>
            </>
          ) : (
            <AppButton tone="secondaire" size="sm" className="bg-black/60" onClick={banner.open}>
              <ImagePlus />
              <span className="hidden sm:inline">Changer la bannière</span>
            </AppButton>
          )}
        </div>
      </div>

      <div className="px-4 pb-5 sm:px-6">
        <div className="-mt-12 flex flex-col gap-4 sm:-mt-14 sm:flex-row sm:items-end">
          <div className="relative w-fit">
            <PlayerAvatar
              name={profile.name}
              url={avatar.preview ?? profile.avatarUrl}
              border={profile.borderType}
              size="xl"
            />
            {!avatar.pending && (
              <button
                type="button"
                onClick={avatar.open}
                aria-label="Changer l'avatar"
                className="absolute bottom-1 right-1 rounded-full border border-zinc-700 bg-zinc-900 p-2 text-zinc-200 transition-colors hover:border-[#c9a965] hover:text-[#c9a965]"
              >
                <Camera className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className={cn(aclonica, 'truncate text-2xl text-white')}>{profile.name}</h2>
            {profile.title && <p className="text-sm text-[#c9a965]">{profile.title}</p>}
          </div>
        </div>

        {avatar.pending && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-zinc-400">Aperçu du nouvel avatar :</span>
            <AppButton tone="secondaire" size="sm" onClick={avatar.cancel}>
              Annuler
            </AppButton>
            <AppButton size="sm" loading={avatar.sending} onClick={avatar.save}>
              Enregistrer l&apos;avatar
            </AppButton>
          </div>
        )}
        {(avatar.error || banner.error) && (
          <div className="mt-4 space-y-2">
            {banner.error && <Message>Bannière : {banner.error}</Message>}
            {avatar.error && <Message>Avatar : {avatar.error}</Message>}
          </div>
        )}

        {profile.bio && (
          <p className="mt-4 whitespace-pre-line text-sm text-zinc-300">{profile.bio}</p>
        )}

        <dl className="mt-5 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <Stat
            icon={Clock}
            label="Temps de jeu"
            value={formatDuration(profile.timeSpentMinutes)}
          />
          <Stat icon={CalendarDays} label="Membre depuis" value={formatDate(profile.createdAt)} />
          <Stat icon={Mail} label="E-mail" value={profile.email ?? '—'} />
        </dl>
        <p className="mt-3 text-xs text-zinc-500">Images PNG, JPEG, WebP ou GIF, 5 Mo maximum.</p>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-zinc-800 bg-[#0c0c0e]/60 px-3 py-2.5">
      <Icon className="h-4 w-4 shrink-0 text-[#c9a965]" />
      <div className="min-w-0">
        <dt className="text-xs text-zinc-500">{label}</dt>
        <dd className="truncate text-zinc-200">{value}</dd>
      </div>
    </div>
  );
}

// ─── Nom et bio ──────────────────────────────────────────────────────────────

function IdentityCard({ profile }: { profile: Profile }) {
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const { save, sending, error, success, clear } = useSave();

  const changed = name.trim() !== profile.name || bio.trim() !== (profile.bio ?? '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const update: ProfileUpdate = {};
    if (name.trim() !== profile.name) update.name = name.trim();
    if (bio.trim() !== (profile.bio ?? '')) update.bio = bio.trim();
    await save(update);
  }

  return (
    <Card title="Identité" description="Votre nom d'aventurier et quelques mots sur vous.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="nom" className={labelStyle}>
            Nom
          </Label>
          <Input
            id="nom"
            required
            maxLength={MAX_NAME_LENGTH}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear();
            }}
            className={inputStyle}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="bio" className={labelStyle}>
              Bio
            </Label>
            <span className="text-xs text-zinc-500">
              {bio.length} / {MAX_BIO_LENGTH}
            </span>
          </div>
          <Textarea
            id="bio"
            maxLength={MAX_BIO_LENGTH}
            value={bio}
            onChange={(e) => {
              setBio(e.target.value);
              clear();
            }}
            placeholder="Rôliste depuis…, joue plutôt MJ…"
            className={cn(inputStyle, 'h-auto min-h-[110px] resize-y py-2')}
          />
        </div>
        {error && <Message>{error}</Message>}
        {success && !changed && <Message tone="succes">Profil enregistré.</Message>}
        <AppButton type="submit" loading={sending} disabled={!changed || !name.trim()}>
          Enregistrer
        </AppButton>
      </form>
    </Card>
  );
}

// ─── Titre affiché ───────────────────────────────────────────────────────────

function TitleCard({ profile }: { profile: Profile }) {
  const { replaceProfile } = useSession();
  const unlocked = useResource('mes-titres', getMyTitles);
  const catalogue = useResource('titres', getTitles);
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const list = unlocked.data ?? [];
  const current =
    list.find((t) => t.label === profile.title || t.slug === profile.title)?.slug ?? null;
  const locked = (catalogue.data ?? []).filter((t) => !list.some((d) => d.slug === t.slug));

  async function choose(slug: string | null) {
    if (slug === current) return;
    setSending(slug ?? '');
    setError(null);
    try {
      const { title } = await chooseTitle(slug);
      replaceProfile({ ...profile, title });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(null);
    }
  }

  return (
    <Card
      title="Titre"
      description="Le titre affiché sous votre nom, parmi ceux que vous avez débloqués."
    >
      {unlocked.loading && !unlocked.data ? (
        <Loading />
      ) : unlocked.error ? (
        <Message>{unlocked.error}</Message>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Titre affiché">
            <TitleChip
              label="Aucun titre"
              active={current === null && !profile.title}
              loading={sending === ''}
              onClick={() => choose(null)}
            />
            {list.map((t) => (
              <TitleChip
                key={t.slug}
                label={t.label}
                active={current === t.slug}
                loading={sending === t.slug}
                onClick={() => choose(t.slug)}
              />
            ))}
          </div>
          {list.length === 0 && (
            <p className="text-sm text-zinc-500">Aucun titre débloqué pour l&apos;instant.</p>
          )}
          {error && <Message>{error}</Message>}
          {locked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wider text-zinc-500">À débloquer</p>
              <ul className="space-y-2">
                {locked.map((t) => (
                  <li
                    key={t.slug}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
                  >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" />
                    <div className="min-w-0">
                      <p className="text-zinc-300">{t.label}</p>
                      <p className="text-xs text-zinc-500">
                        {conditionText(t.condition, t.description)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function TitleChip({
  label,
  active,
  loading,
  onClick,
}: {
  label: string;
  active: boolean;
  loading: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={loading}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-60',
        active
          ? 'border-[#c9a965] bg-[#c9a965]/15 text-[#e2cc97]'
          : 'border-zinc-700 text-zinc-300 hover:border-zinc-500',
      )}
    >
      {active && <Check className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

// ─── Bordure et badge premium ────────────────────────────────────────────────

function AppearanceCard({ profile, premium }: { profile: Profile; premium: boolean }) {
  const [border, setBorder] = useState(profile.borderType);
  const [badge, setBadge] = useState(profile.showPremiumBadge);
  const { save, sending, error, success, clear } = useSave();

  useEffect(() => {
    setBorder(profile.borderType);
    setBadge(profile.showPremiumBadge);
  }, [profile.borderType, profile.showPremiumBadge]);

  const changed = border !== profile.borderType || badge !== profile.showPremiumBadge;

  function submit() {
    const update: ProfileUpdate = {};
    if (border !== profile.borderType) update.borderType = border;
    if (badge !== profile.showPremiumBadge) update.showPremiumBadge = badge;
    void save(update);
  }

  return (
    <Card
      title="Apparence"
      description="La bordure de votre avatar, visible par les autres joueurs."
      action={
        <PlayerAvatar name={profile.name} url={profile.avatarUrl} border={border} size="md" />
      }
    >
      <div className="space-y-4">
        {!premium && (
          <p className="flex items-center gap-2 text-xs text-zinc-500">
            <Crown className="h-3.5 w-3.5 text-[#c9a965]" />
            Les bordures animées sont réservées aux membres Premium.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {BORDERS.map((b) => {
            const lock = !premium && b.id !== 'none' && b.id !== profile.borderType;
            return (
              <button
                key={b.id}
                type="button"
                disabled={lock}
                aria-pressed={border === b.id}
                onClick={() => {
                  setBorder(b.id);
                  clear();
                }}
                className={cn(
                  'flex flex-col items-center gap-1.5 rounded-lg border px-1 py-2 text-[11px] leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                  border === b.id
                    ? 'border-[#c9a965] bg-[#c9a965]/10 text-[#e2cc97]'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <span
                  className="relative h-6 w-6 rounded-full border border-zinc-700"
                  style={
                    b.colors.length
                      ? {
                          background:
                            b.colors.length === 1
                              ? b.colors[0]
                              : `conic-gradient(${[...b.colors, b.colors[0]].join(', ')})`,
                        }
                      : undefined
                  }
                >
                  {lock && <Lock className="absolute inset-0 m-auto h-3 w-3 text-white" />}
                </span>
                <span className="text-center">{b.label}</span>
              </button>
            );
          })}
        </div>
        <Switch
          active={badge}
          onChange={(v) => {
            setBadge(v);
            clear();
          }}
          label="Afficher le badge Premium"
          description={
            premium
              ? 'Visible à côté de votre nom sur votre profil public.'
              : 'Le badge ne s’affiche que pour les membres Premium.'
          }
        />
        {error && <Message>{error}</Message>}
        {success && !changed && <Message tone="succes">Apparence enregistrée.</Message>}
        <AppButton onClick={submit} loading={sending} disabled={!changed}>
          Enregistrer
        </AppButton>
      </div>
    </Card>
  );
}

// ─── Préférences ─────────────────────────────────────────────────────────────

function PreferencesCard({ profile }: { profile: Profile }) {
  const { save, sending, error } = useSave();

  return (
    <Card title="Préférences">
      <div className="space-y-4">
        <Switch
          active={profile.emailNotifications}
          disabled={sending}
          onChange={(v) => void save({ emailNotifications: v })}
          label="Notifications par e-mail"
          description="Rappels de session et nouvelles de vos campagnes."
        />
        {error && <Message>{error}</Message>}
      </div>
    </Card>
  );
}
