'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, connexion, deconnexion, inscription, refreshSession } from './api';

export interface Profil {
  id: string;
  email: string | null;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  bio: string | null;
  bannerUrl: string | null;
  borderType: string;
  showPremiumBadge: boolean;
  timeSpentMinutes: number;
}

interface Session {
  statut: 'chargement' | 'connecte' | 'anonyme';
  profil: Profil | null;
  seConnecter(email: string, motDePasse: string): Promise<void>;
  sInscrire(email: string, motDePasse: string, nom: string): Promise<void>;
  seDeconnecter(): Promise<void>;
}

const Contexte = createContext<Session | null>(null);

/** Une seule session pour toute l'app : le profil est chargé une fois, puis partagé. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [statut, setStatut] = useState<Session['statut']>('chargement');
  const [profil, setProfil] = useState<Profil | null>(null);

  const chargerProfil = useCallback(async () => {
    setProfil(await api<Profil>('/v1/users/me'));
    setStatut('connecte');
  }, []);

  // Au chargement : reprise de la session via le cookie de refresh
  useEffect(() => {
    refreshSession()
      .then((jeton) => (jeton ? chargerProfil() : setStatut('anonyme')))
      .catch(() => setStatut('anonyme'));
  }, [chargerProfil]);

  const valeur: Session = {
    statut,
    profil,
    async seConnecter(email, motDePasse) {
      await connexion(email, motDePasse);
      await chargerProfil();
    },
    async sInscrire(email, motDePasse, nom) {
      await inscription(email, motDePasse, nom);
      await chargerProfil();
    },
    async seDeconnecter() {
      await deconnexion();
      setProfil(null);
      setStatut('anonyme');
    },
  };

  return <Contexte.Provider value={valeur}>{children}</Contexte.Provider>;
}

export function useSession(): Session {
  const s = useContext(Contexte);
  if (!s) throw new Error('useSession doit être utilisé dans <SessionProvider>');
  return s;
}
