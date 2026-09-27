'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageErreur } from '@/lib/api';
import { useModifierNote, type ModificationNote } from '@/lib/notes';

export type EtatEnregistrement = 'enregistre' | 'en-attente' | 'en-cours' | 'erreur';

const estVide = (m: ModificationNote) => Object.keys(m).length === 0;

/**
 * Enregistrement automatique d'une note : les modifications s'accumulent et
 * partent ensemble après `delai` ms de calme. Un seul envoi à la fois, dans
 * l'ordre, pour qu'une réponse lente n'écrase jamais une saisie plus récente.
 * Ce qui reste en attente part au démontage (changement de note, de page).
 */
export function useEnregistrementAuto(id: string, delai = 600) {
  const { mutateAsync } = useModifierNote();
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre');
  const attente = useRef<ModificationNote>({});
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCours = useRef<Promise<void> | null>(null);
  // Faux après une suppression : plus rien ne doit partir vers cette note
  const actif = useRef(true);

  const vider = useCallback(async (): Promise<void> => {
    if (minuteur.current) {
      clearTimeout(minuteur.current);
      minuteur.current = null;
    }
    if (!actif.current) return;
    // Un envoi est déjà parti : on attend sa fin, puis on envoie la suite
    if (enCours.current) {
      await enCours.current;
      return vider();
    }
    const patch = attente.current;
    if (estVide(patch)) {
      setEtat('enregistre');
      return;
    }
    attente.current = {};
    setEtat('en-cours');
    const envoi = mutateAsync({ id, ...patch }).then(
      () => {
        enCours.current = null;
        setEtat(estVide(attente.current) ? 'enregistre' : 'en-attente');
      },
      (err: unknown) => {
        enCours.current = null;
        // Rien n'est perdu : le patch échoué repasse sous les saisies plus récentes
        attente.current = { ...patch, ...attente.current };
        setEtat('erreur');
        toast.error(messageErreur(err, "La note n'a pas pu être enregistrée."), {
          id: 'enregistrement-note',
        });
      },
    );
    enCours.current = envoi;
    await envoi;
    if (!estVide(attente.current) && !minuteur.current && actif.current) return vider();
  }, [id, mutateAsync]);

  /** Ajoute des modifications ; `immediat` pour les choix ponctuels (type, épingle…). */
  const planifier = useCallback(
    (patch: ModificationNote, immediat = false) => {
      if (!actif.current) return;
      attente.current = { ...attente.current, ...patch };
      setEtat((e) => (e === 'en-cours' ? e : 'en-attente'));
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = null;
      if (immediat) void vider();
      else minuteur.current = setTimeout(() => void vider(), delai);
    },
    [delai, vider],
  );

  /** Oublie tout ce qui est en attente (la note va être supprimée). */
  const abandonner = useCallback(() => {
    actif.current = false;
    attente.current = {};
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  }, []);

  const enAttente = useCallback(() => !estVide(attente.current) || enCours.current !== null, []);

  // Toujours la dernière version de `vider` pour les écouteurs posés une fois
  const viderRef = useRef(vider);
  useEffect(() => {
    viderRef.current = vider;
  }, [vider]);

  useEffect(() => {
    const cache = () => {
      if (document.visibilityState === 'hidden') void viderRef.current();
    };
    // Fermeture de l'onglet pendant l'attente : on part tout de suite et on
    // demande confirmation au navigateur si l'envoi n'a pas pu finir
    const quitter = (e: BeforeUnloadEvent) => {
      if (!enAttente()) return;
      void viderRef.current();
      e.preventDefault();
    };
    document.addEventListener('visibilitychange', cache);
    window.addEventListener('beforeunload', quitter);
    return () => {
      document.removeEventListener('visibilitychange', cache);
      window.removeEventListener('beforeunload', quitter);
      void viderRef.current();
    };
  }, [enAttente]);

  return { etat, planifier, vider, abandonner };
}
