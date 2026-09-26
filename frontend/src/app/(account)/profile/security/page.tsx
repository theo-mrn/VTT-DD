'use client';

import { LogOut, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
  AppButton,
  Card,
  Loading,
  formatDate,
  formatSince,
  Message,
  PageTitle,
  Empty,
} from '@/components/account/elements';
import { aclonica, inputStyle, labelStyle } from '@/components/account/styles';
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
import { errorMessage } from '@/lib/api';
import type { Profile } from '@/lib/profile';
import { useResource } from '@/lib/resource';
import {
  changePassword,
  logoutEverywhere,
  requestPasswordReset,
  getSessions,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  revokeSession,
  deleteAccount,
  type ActiveSession,
} from '@/lib/security';
import { useProfile, useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

const PROVIDER_NAMES = { google: 'Google', discord: 'Discord' } as const;

export default function SecurityPage() {
  const profile = useProfile();

  return (
    <div className="space-y-6">
      <PageTitle subtitle="Mot de passe, appareils connectés et suppression du compte.">
        Sécurité
      </PageTitle>
      <div className="grid gap-6 lg:grid-cols-2">
        {profile.hasPassword ? <PasswordCard /> : <NoPasswordCard profile={profile} />}
        <LinkedAccountsCard profile={profile} />
      </div>
      <SessionsCard />
      <DeleteAccountCard profile={profile} />
    </div>
  );
}

// ─── Mot de passe ────────────────────────────────────────────────────────────

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSuccess(false);
    if (newPassword !== confirmation) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Mot de passe" description={`${MIN_PASSWORD_LENGTH} caractères minimum.`}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="mdp-actuel" className={labelStyle}>
            Mot de passe actuel
          </Label>
          <Input
            id="mdp-actuel"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mdp-nouveau" className={labelStyle}>
            Nouveau mot de passe
          </Label>
          <Input
            id="mdp-nouveau"
            type="password"
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={inputStyle}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mdp-confirmation" className={labelStyle}>
            Confirmation
          </Label>
          <Input
            id="mdp-confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputStyle}
          />
        </div>
        {error && <Message>{error}</Message>}
        {success && <Message tone="succes">Mot de passe modifié.</Message>}
        <AppButton type="submit" loading={sending}>
          Changer le mot de passe
        </AppButton>
      </form>
    </Card>
  );
}

/** Compte créé via Google / Discord : un mot de passe se définit par le lien de réinitialisation. */
function NoPasswordCard({ profile }: { profile: Profile }) {
  const [state, setState] = useState<'repos' | 'envoi' | 'envoye'>('repos');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!profile.email) return;
    setState('envoi');
    setError(null);
    try {
      await requestPasswordReset(profile.email);
      setState('envoye');
    } catch (err) {
      setError(errorMessage(err));
      setState('repos');
    }
  }

  return (
    <Card
      title="Mot de passe"
      description="Votre compte n'a pas de mot de passe : vous vous connectez avec Google ou Discord."
    >
      <div className="space-y-4">
        {profile.email ? (
          <>
            <p className="text-sm text-zinc-400">
              Pour pouvoir aussi vous connecter par e-mail, recevez un lien permettant de définir un
              mot de passe.
            </p>
            {error && <Message>{error}</Message>}
            {state === 'envoye' && <Message tone="succes">Lien envoyé à {profile.email}.</Message>}
            <AppButton loading={state === 'envoi'} onClick={send}>
              {state === 'envoye' ? 'Renvoyer le lien' : 'Recevoir un lien'}
            </AppButton>
          </>
        ) : (
          <Message tone="info">
            Aucune adresse e-mail n&apos;est associée à votre compte : impossible de définir un mot
            de passe pour l&apos;instant.
          </Message>
        )}
      </div>
    </Card>
  );
}

function LinkedAccountsCard({ profile }: { profile: Profile }) {
  return (
    <Card title="Comptes liés" description="Services avec lesquels vous pouvez vous connecter.">
      <ul className="space-y-2 text-sm">
        <SessionRow label="E-mail et mot de passe" active={profile.hasPassword} />
        {(['google', 'discord'] as const).map((f) => (
          <SessionRow key={f} label={PROVIDER_NAMES[f]} active={profile.providers.includes(f)} />
        ))}
      </ul>
    </Card>
  );
}

function SessionRow({ label, active }: { label: string; active: boolean }) {
  return (
    <li className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
      <span className="text-zinc-200">{label}</span>
      <span className={cn('text-xs', active ? 'text-emerald-400' : 'text-zinc-500')}>
        {active ? 'Activé' : 'Non lié'}
      </span>
    </li>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

/** « Chrome sur macOS » à partir de l'user-agent. */
function describeDevice(ua: string | null) {
  if (!ua) return { nom: 'Appareil inconnu', mobile: false };
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  const system = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  const name =
    browser && system ? `${browser} sur ${system}` : (browser ?? system ?? ua.slice(0, 60));
  return { nom: name, mobile: /Mobile|iPhone|Android/.test(ua) };
}

function SessionsCard() {
  const { signOut, forgetSession } = useSession();
  const sessions = useResource('sessions', getSessions);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [everywhere, setEverywhere] = useState(false);

  async function revoke(s: ActiveSession) {
    setError(null);
    setBusy(s.id);
    try {
      if (s.current) {
        await signOut();
        return;
      }
      await revokeSession(s.id);
      sessions.update((list) => list?.filter((x) => x.id !== s.id));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function logoutAll() {
    setEverywhere(true);
    setError(null);
    try {
      await logoutEverywhere();
      forgetSession();
    } catch (err) {
      setError(errorMessage(err));
      setEverywhere(false);
      setConfirm(false);
    }
  }

  const list = [...(sessions.data ?? [])].sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? ''),
  );

  return (
    <Card
      title="Appareils connectés"
      description="Déconnectez un appareil que vous ne reconnaissez pas."
      action={
        <AppButton tone="danger" size="sm" onClick={() => setConfirm(true)}>
          <LogOut />
          Déconnecter tous les appareils
        </AppButton>
      }
    >
      {sessions.loading && !sessions.data ? (
        <Loading />
      ) : sessions.error ? (
        <Message>{sessions.error}</Message>
      ) : list.length === 0 ? (
        <Empty>Aucune session active.</Empty>
      ) : (
        <ul className="divide-y divide-zinc-800">
          {list.map((s) => {
            const device = describeDevice(s.userAgent);
            const Icon = device.mobile ? Smartphone : Monitor;
            return (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-3">
                <Icon className="h-5 w-5 shrink-0 text-zinc-500" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                    <span className="truncate">{device.nom}</span>
                    {s.current && (
                      <span className="rounded-full bg-[#c9a965]/15 px-2 py-0.5 text-[11px] text-[#e2cc97]">
                        Cet appareil
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {s.ip ? `${s.ip} · ` : ''}active {formatSince(s.lastUsedAt)} · ouverte le{' '}
                    {formatDate(s.createdAt)}
                  </p>
                </div>
                <AppButton
                  tone={s.current ? 'secondaire' : 'danger'}
                  size="sm"
                  loading={busy === s.id}
                  onClick={() => revoke(s)}
                >
                  {s.current ? 'Se déconnecter' : 'Révoquer'}
                </AppButton>
              </li>
            );
          })}
        </ul>
      )}
      {error && <Message className="mt-3">{error}</Message>}

      <Dialog open={confirm} onOpenChange={(o) => !everywhere && setConfirm(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={cn(aclonica, 'text-white')}>
              Déconnecter tous les appareils ?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Toutes vos sessions seront fermées, y compris celle-ci. Il faudra vous reconnecter
              partout.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <AppButton tone="secondaire" onClick={() => setConfirm(false)} disabled={everywhere}>
              Annuler
            </AppButton>
            <AppButton
              tone="danger"
              className="bg-red-500/10"
              loading={everywhere}
              onClick={logoutAll}
            >
              Tout déconnecter
            </AppButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ─── Suppression du compte ───────────────────────────────────────────────────

const CONFIRMATION_WORD = 'SUPPRIMER';

function DeleteAccountCard({ profile }: { profile: Profile }) {
  const { forgetSession } = useSession();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    confirmation.trim().toUpperCase() === CONFIRMATION_WORD && (!profile.hasPassword || password);

  function close(o: boolean) {
    if (sending) return;
    setOpen(o);
    if (!o) {
      setConfirmation('');
      setPassword('');
      setError(null);
    }
  }

  async function remove(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSending(true);
    setError(null);
    try {
      await deleteAccount(profile.hasPassword ? password : undefined);
      forgetSession();
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <Card
      title="Supprimer le compte"
      description="Supprime définitivement votre compte, votre profil et vos amitiés. Cette action est irréversible."
      className="border-red-500/20"
    >
      <AppButton tone="danger" onClick={() => setOpen(true)}>
        <Trash2 />
        Supprimer mon compte
      </AppButton>

      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={remove} className="space-y-4">
            <DialogHeader>
              <DialogTitle className={cn(aclonica, 'text-red-400')}>
                Supprimer définitivement ?
              </DialogTitle>
              <DialogDescription className="text-zinc-400">
                Votre compte « {profile.name} » et toutes ses données seront supprimés. Impossible
                de revenir en arrière.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="confirmation-suppression" className={labelStyle}>
                Tapez {CONFIRMATION_WORD} pour confirmer
              </Label>
              <Input
                id="confirmation-suppression"
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                className={inputStyle}
              />
            </div>
            {profile.hasPassword && (
              <div className="space-y-2">
                <Label htmlFor="mdp-suppression" className={labelStyle}>
                  Mot de passe
                </Label>
                <Input
                  id="mdp-suppression"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputStyle}
                />
              </div>
            )}
            {error && <Message>{error}</Message>}
            <DialogFooter>
              <AppButton
                type="button"
                tone="secondaire"
                onClick={() => close(false)}
                disabled={sending}
              >
                Annuler
              </AppButton>
              <AppButton
                type="submit"
                tone="danger"
                className="bg-red-500/10"
                loading={sending}
                disabled={!ready}
              >
                Supprimer mon compte
              </AppButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
