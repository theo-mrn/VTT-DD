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
import { connexion, deconnexion, inscription, refreshSession, setAccessToken } from './api';
import { lireMonProfil, type Profil } from './profil';
import { urlConnexion } from './redirection';

export type { Profil } from './profil';

interface Session {
  statut: 'chargement' | 'connecte' | 'anonyme';
  profil: Profil | null;
  /** Vrai si la session a été fermée volontairement (déconnexion, suppression du compte…). */
  sortieVolontaire: boolean;
  seConnecter(email: string, motDePasse: string): Promise<void>;
  sInscrire(email: string, motDePasse: string, nom: string): Promise<void>;
  seDeconnecter(): Promise<void>;
  /** Recharge le profil depuis l'API (après une vérification d'e-mail, un changement de titre…). */
  rechargerProfil(): Promise<void>;
  /** Remplace le profil par celui renvoyé par l'API (réponse d'un PATCH). */
  remplacerProfil(profil: Profil): void;
  /** Oublie la session côté front, quand le backend l'a déjà fermée (déconnexion partout, compte supprimé). */
  oublierSession(): void;
}

const Contexte = createContext<Session | null>(null);

/** Une seule session pour toute l'app : le profil est chargé une fois, puis partagé. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [statut, setStatut] = useState<Session['statut']>('chargement');
  const [profil, setProfil] = useState<Profil | null>(null);
  const [sortieVolontaire, setSortieVolontaire] = useState(false);

  const chargerProfil = useCallback(async () => {
    setProfil(await lireMonProfil());
    setStatut('connecte');
    setSortieVolontaire(false);
  }, []);

  // Au chargement : reprise de la session via le cookie de refresh
  // (c'est aussi ainsi que le front récupère son jeton au retour d'OAuth)
  useEffect(() => {
    refreshSession()
      .then((jeton) => (jeton ? chargerProfil() : setStatut('anonyme')))
      .catch(() => setStatut('anonyme'));
  }, [chargerProfil]);

  const oublierSession = useCallback(() => {
    setAccessToken(null);
    setProfil(null);
    setSortieVolontaire(true);
    setStatut('anonyme');
  }, []);

  const valeur = useMemo<Session>(
    () => ({
      statut,
      profil,
      sortieVolontaire,
      async seConnecter(email, motDePasse) {
        await connexion(email, motDePasse);
        await chargerProfil();
      },
      async sInscrire(email, motDePasse, nom) {
        await inscription(email, motDePasse, nom);
        await chargerProfil();
      },
      async seDeconnecter() {
        try {
          await deconnexion();
        } finally {
          oublierSession();
        }
      },
      rechargerProfil: chargerProfil,
      remplacerProfil: setProfil,
      oublierSession,
    }),
    [statut, profil, sortieVolontaire, chargerProfil, oublierSession],
  );

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return s;
}

/**
 * Garde des pages connectées : un visiteur anonyme part vers /connexion, avec
 * la page demandée en retour ; après une déconnexion volontaire, vers l'accueil.
 * Renvoie le profil une fois la session ouverte, null sinon.
 */
export function useProfilRequis(): Profil | null {
  const { statut, profil, sortieVolontaire } = useSession();
  const router = useRouter();
  const chemin = usePathname();

  useEffect(() => {
    if (statut !== 'anonyme') return;
    router.replace(sortieVolontaire ? '/' : urlConnexion(chemin));
  }, [statut, sortieVolontaire, chemin, router]);

  return statut === 'connecte' ? profil : null;
}

/** Profil de l'utilisateur dans une page protégée (rendue seulement une fois connecté). */
export function useProfil(): Profil {
  const { profil } = useSession();
  if (!profil) throw new Error('useProfil doit être utilisé dans une page protégée');
  return profil;
}
