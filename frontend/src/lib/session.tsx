'use client';

import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { login, logout, register, refreshSession, setAccessToken } from './api';
import { getMyProfile, type Profile } from './profile';
import { loginUrl } from './redirect';

export type { Profile as Profil } from './profile';

interface Session {
  status: 'chargement' | 'connecte' | 'anonyme';
  profile: Profile | null;
  /** Vrai si la session a été fermée volontairement (déconnexion, suppression du compte…). */
  signedOut: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, name: string): Promise<void>;
  signOut(): Promise<void>;
  /** Recharge le profil depuis l'API (après une vérification d'e-mail, un changement de titre…). */
  reloadProfile(): Promise<void>;
  /** Remplace le profil par celui renvoyé par l'API (réponse d'un PATCH). */
  replaceProfile(profile: Profile): void;
  /** Oublie la session côté front, quand le backend l'a déjà fermée (déconnexion partout, compte supprimé). */
  forgetSession(): void;
}

const SessionContext = createContext<Session | null>(null);

/** Une seule session pour toute l'app : le profil est chargé une fois, puis partagé. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Session['status']>('chargement');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const loadProfile = useCallback(async () => {
    setProfile(await getMyProfile());
    setStatus('connecte');
    setSignedOut(false);
  }, []);

  // Au chargement : reprise de la session via le cookie de refresh
  // (c'est aussi ainsi que le front récupère son jeton au retour d'OAuth)
  useEffect(() => {
    refreshSession()
      .then((token) => (token ? loadProfile() : setStatus('anonyme')))
      .catch(() => setStatus('anonyme'));
  }, [loadProfile]);

  const forgetSession = useCallback(() => {
    setAccessToken(null);
    setProfile(null);
    setSignedOut(true);
    setStatus('anonyme');
  }, []);

  const value = useMemo<Session>(
    () => ({
      status,
      profile,
      signedOut,
      async signIn(email, password) {
        await login(email, password);
        await loadProfile();
      },
      async signUp(email, password, name) {
        await register(email, password, name);
        await loadProfile();
      },
      async signOut() {
        try {
          await logout();
        } finally {
          forgetSession();
        }
      },
      reloadProfile: loadProfile,
      replaceProfile: setProfile,
      forgetSession,
    }),
    [status, profile, signedOut, loadProfile, forgetSession],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return s;
}

/**
 * Garde des pages connectées : un visiteur anonyme part vers /connexion, avec
 * la page demandée en retour ; après une déconnexion volontaire, vers l'accueil.
 * Renvoie le profil une fois la session ouverte, null sinon.
 */
export function useRequiredProfile(): Profile | null {
  const { status, profile, signedOut } = useSession();
  const router = useRouter();
  const path = usePathname();

  useEffect(() => {
    if (status !== 'anonyme') return;
    router.replace(signedOut ? '/' : loginUrl(path));
  }, [status, signedOut, path, router]);

  return status === 'connecte' ? profile : null;
}

/** Profil de l'utilisateur dans une page protégée (rendue seulement une fois connecté). */
export function useProfile(): Profile {
  const { profile } = useSession();
  if (!profile) throw new Error('useProfil doit être utilisé dans une page protégée');
  return profile;
}
