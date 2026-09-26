/** Amis et demandes d'amitié (service identity). */
import { useCallback, useState } from 'react';
import { api, messageErreur } from './api';
import { useRessource } from './ressource';

export interface Ami {
  id: string;
  name: string;
  avatarUrl: string | null;
  title: string | null;
  since: string;
}

export interface DemandeAmi {
  id: string;
  name: string;
  avatarUrl: string | null;
  createdAt: string;
}

export interface DemandesAmis {
  received: DemandeAmi[];
  sent: DemandeAmi[];
}

export function lireAmis() {
  return api<Ami[]>('/v1/friends');
}

export function lireDemandesAmis() {
  return api<DemandesAmis>('/v1/friends/requests');
}

/** 'accepted' si l'autre joueur nous avait déjà envoyé une demande. 409 si déjà amis ou déjà demandé. */
export function demanderEnAmi(idJoueur: string) {
  return api<{ status: 'pending' | 'accepted' }>('/v1/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ userId: idJoueur }),
  });
}

export function accepterDemande(idJoueur: string) {
  return api<void>(`/v1/friends/requests/${encodeURIComponent(idJoueur)}/accept`, {
    method: 'POST',
  });
}

/** Refuse une demande reçue ou annule une demande envoyée. */
export function supprimerDemande(idJoueur: string) {
  return api<void>(`/v1/friends/requests/${encodeURIComponent(idJoueur)}`, { method: 'DELETE' });
}

export function retirerAmi(idJoueur: string) {
  return api<void>(`/v1/friends/${encodeURIComponent(idJoueur)}`, { method: 'DELETE' });
}

// ─── Hook de domaine ─────────────────────────────────────────────────────────

export type Relation = 'moi' | 'ami' | 'recue' | 'envoyee' | 'aucune';

/**
 * Amis et demandes de l'utilisateur, relation avec un joueur donné, et actions
 * (chaque action recharge les listes, puisqu'elle peut en modifier deux à la fois).
 */
export function useRelations(idMoi: string) {
  const amis = useRessource('amis', lireAmis);
  const demandes = useRessource('demandes-amis', lireDemandesAmis);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { recharger: rechargerAmis } = amis;
  const { recharger: rechargerDemandes } = demandes;

  const relation = (id: string): Relation => {
    if (id === idMoi) return 'moi';
    if (amis.donnees?.some((a) => a.id === id)) return 'ami';
    if (demandes.donnees?.received.some((d) => d.id === id)) return 'recue';
    if (demandes.donnees?.sent.some((d) => d.id === id)) return 'envoyee';
    return 'aucune';
  };

  const agir = useCallback(
    async (idJoueur: string, action: (id: string) => Promise<unknown>) => {
      setEnCours(idJoueur);
      setErreur(null);
      try {
        await action(idJoueur);
        return true;
      } catch (err) {
        setErreur(messageErreur(err));
        return false;
      } finally {
        await Promise.all([rechargerAmis(), rechargerDemandes()]);
        setEnCours(null);
      }
    },
    [rechargerAmis, rechargerDemandes],
  );

  return { amis, demandes, relation, agir, enCours, erreur };
}
