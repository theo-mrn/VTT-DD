'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { errorMessage } from '@/lib/api';
import type { Provider } from '@/lib/profile';
import { getOAuthProviders, oauthUrl, type OAuthProviders } from '@/lib/security';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';

/**
 * Connexion / inscription sur le service identity. Utilisé dans la fenêtre de
 * la landing page et sur /connexion. Même apparence que l'ancien formulaire.
 *
 * `redirection` : page où revenir après une connexion Google / Discord
 * (par défaut, la page courante).
 */
export function LoginForm({
  onLoggedIn,
  redirection,
  initialError = null,
}: {
  onLoggedIn?: () => void;
  redirection?: string;
  initialError?: string | null;
}) {
  const { signIn, signUp } = useSession();
  const path = usePathname();
  const [mode, setMode] = useState<'connexion' | 'inscription'>('connexion');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(initialError);
  const [sending, setSending] = useState(false);
  const [providers, setProviders] = useState<OAuthProviders | null>(null);
  const [startingProvider, setStartingProvider] = useState<Provider | null>(null);

  useEffect(() => {
    getOAuthProviders()
      .then(setProviders)
      .catch(() => setProviders(null));
  }, []);

  useEffect(() => setError(initialError), [initialError]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      if (mode === 'connexion') await signIn(email, password);
      else await signUp(email, password, name);
      onLoggedIn?.();
    } catch (err) {
      setError(errorMessage(err, 'Serveur injoignable'));
    } finally {
      setSending(false);
    }
  }

  function continueWith(f: Provider) {
    setStartingProvider(f);
    window.location.assign(oauthUrl(f, redirection ?? path ?? '/'));
  }

  const active = (['google', 'discord'] as const).filter((f) => providers?.[f]);

  const field =
    'w-full rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-white placeholder:text-zinc-500 outline-none focus:border-[#c9a965]';

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-sm space-y-4 rounded-2xl bg-zinc-900 px-6 py-10 shadow-2xl"
    >
      <h2 className="text-center font-[family-name:var(--font-aclonica)] text-3xl tracking-wider text-white">
        YNER
      </h2>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-800/60 p-1 text-sm">
        {(['connexion', 'inscription'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              'rounded-md py-1.5 capitalize transition-colors',
              mode === m ? 'bg-zinc-900 text-[#c9a965]' : 'text-zinc-400 hover:text-white',
            )}
          >
            {m}
          </button>
        ))}
      </div>

      {active.length > 0 && (
        <>
          <div className="space-y-2">
            {active.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => continueWith(f)}
                disabled={startingProvider !== null}
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-700 bg-zinc-800/60 py-2.5 text-sm text-white transition-colors hover:border-[#c9a965] disabled:opacity-50"
              >
                {f === 'google' ? <GoogleLogo /> : <DiscordLogo />}
                {startingProvider === f ? 'Redirection…' : `Continuer avec ${PROVIDER_LABELS[f]}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-500">
            <span className="h-px flex-1 bg-zinc-800" />
            ou
            <span className="h-px flex-1 bg-zinc-800" />
          </div>
        </>
      )}

      {mode === 'inscription' && (
        <input
          className={field}
          placeholder="Nom d'aventurier"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={64}
        />
      )}
      <input
        className={field}
        type="email"
        placeholder="E-mail"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className={field}
        type="password"
        placeholder="Mot de passe"
        autoComplete={mode === 'connexion' ? 'current-password' : 'new-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={mode === 'inscription' ? 8 : 1}
        maxLength={128}
      />

      {mode === 'connexion' && (
        <div className="-mt-2 text-right">
          <Link
            href="/forgot-password"
            className="text-xs text-zinc-400 underline-offset-4 hover:text-[#c9a965] hover:underline"
          >
            Mot de passe oublié ?
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full rounded-lg bg-[#c9a965] py-2.5 font-semibold text-zinc-950 transition-colors hover:bg-[#d8bb7a] disabled:opacity-50"
      >
        {sending ? '…' : mode === 'connexion' ? 'Se connecter' : 'Créer mon compte'}
      </button>
    </form>
  );
}

const PROVIDER_LABELS: Record<Provider, string> = { google: 'Google', discord: 'Discord' };

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  );
}

function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#5865F2"
        d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.5 0L8.6 3a19.7 19.7 0 0 0-4.9 1.5C.6 9.1-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.3-2.1a12.9 12.9 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.2 0l.5.4c-.6.4-1.3.7-2 1l1.3 2.1a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.6-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"
      />
    </svg>
  );
}
