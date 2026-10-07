'use client';

import { translate } from '@/i18n/runtime';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { messageErreur } from '@/lib/api';
import {
  clesNotes,
  estConflit,
  estIntrouvable,
  notes,
  useModifierNote,
  type ModificationNote,
  type Note,
  type TagApi,
} from '@/lib/notes';

export type EtatEnregistrement = 'enregistre' | 'en-attente' | 'en-cours' | 'erreur' | 'conflit';

/** Modifications refusées parce que la note a changé ailleurs, et la version relue. */
export interface Conflit {
  modifs: ModificationNote;
  recente: Note;
}

const estVide = (m: ModificationNote) => Object.keys(m).length === 0;

/**
 * Texte saisi, lu seulement au moment d'envoyer : sérialiser une longue note à chaque
 * frappe coûte cher. `sale` : une saisie attend ; `lire` rend le texte s'il a changé
 * depuis la dernière lecture (et remet `sale` à faux), sinon undefined.
 */
export interface ContenuDiffere {
  sale: () => boolean;
  lire: () => string | undefined;
}

/** Fusionne deux lots de modifications (les détails champ par champ). */
export function fusionner(a: ModificationNote, b: ModificationNote): ModificationNote {
  const details = a.details || b.details ? { details: { ...a.details, ...b.details } } : {};
  return { ...a, ...b, ...details };
}

/**
 * Enregistrement automatique d'une note : les modifications s'accumulent et
 * partent ensemble après `delai` ms de calme, avec la version sur laquelle
 * repose la saisie. Un seul envoi à la fois, dans l'ordre, pour qu'une réponse
 * lente n'écrase jamais une saisie plus récente. Ce qui reste en attente part
 * au démontage (changement de note, de page).
 *
 * Conflit (409 : la note a changé ailleurs, par un autre joueur ou un autre
 * onglet) : rien n'est écrasé. La note est relue, l'enregistrement se met en
 * pause et `onConflit` reçoit les modifications refusées : l'utilisateur
 * choisit de les réappliquer, d'en faire une copie, ou de les abandonner.
 */
export function useEnregistrementAuto(
  note: Note,
  o: { onConflit: (c: Conflit) => void; delai?: number; contenu?: ContenuDiffere },
) {
  const delai = o.delai ?? 600;
  const id = note.id;
  const client = useQueryClient();
  const { mutateAsync } = useModifierNote();
  const [etat, setEtat] = useState<EtatEnregistrement>('enregistre');
  const attente = useRef<ModificationNote>({});
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enCours = useRef<Promise<void> | null>(null);
  // Version sur laquelle repose la saisie, et étiquettes connues (leur id est gardé)
  const base = useRef(note.version);
  const etiquettes = useRef<TagApi[]>(note.tagRefs);
  // Faux après une suppression : plus rien ne doit partir vers cette note
  const actif = useRef(true);
  // Vrai pendant un conflit : rien ne part avant le choix de l'utilisateur
  const enPause = useRef(false);
  const onConflit = useRef(o.onConflit);
  onConflit.current = o.onConflit;
  const contenu = useRef(o.contenu);
  contenu.current = o.contenu;

  /** Le texte saisi depuis le dernier envoi rejoint les modifications en attente. */
  const collecter = useCallback(() => {
    const c = contenu.current?.lire();
    if (c !== undefined) attente.current = fusionner(attente.current, { content: c });
  }, []);

  const conflit = useCallback(
    async (refusees: ModificationNote) => {
      enPause.current = true;
      setEtat('conflit');
      let recente: Note;
      try {
        recente = await notes.lire(id);
      } catch (err) {
        setEtat('erreur');
        toast.error(messageErreur(err, translate('notes.saving.rereadFailed')), {
          id: 'enregistrement-note',
        });
        return;
      }
      client.setQueryData(clesNotes.une(id), recente);
      base.current = recente.version;
      etiquettes.current = recente.tagRefs;
      onConflit.current({ modifs: refusees, recente });
    },
    [client, id],
  );

  const vider = useCallback(async (): Promise<void> => {
    if (minuteur.current) {
      clearTimeout(minuteur.current);
      minuteur.current = null;
    }
    if (!actif.current || enPause.current) return;
    // Un envoi est déjà parti : on attend sa fin, puis on envoie la suite
    if (enCours.current) {
      await enCours.current;
      return vider();
    }
    collecter();
    const patch = attente.current;
    if (estVide(patch)) {
      setEtat('enregistre');
      return;
    }
    attente.current = {};
    setEtat('en-cours');
    const envoi = mutateAsync({
      id,
      patch,
      version: base.current,
      tagRefs: etiquettes.current,
    }).then(
      (enregistree) => {
        enCours.current = null;
        base.current = enregistree.version;
        etiquettes.current = enregistree.tagRefs;
        setEtat(estVide(attente.current) && !contenu.current?.sale() ? 'enregistre' : 'en-attente');
      },
      async (err: unknown) => {
        enCours.current = null;
        // Le texte saisi pendant l'envoi fait partie des modifications refusées
        collecter();
        const refusees = fusionner(patch, attente.current);
        if (estConflit(err)) {
          attente.current = {};
          await conflit(refusees);
          return;
        }
        if (estIntrouvable(err)) {
          // Supprimée ou plus partagée avec moi : rien ne peut plus partir
          actif.current = false;
          attente.current = {};
          setEtat('erreur');
          toast.error(translate('notes.saving.gone'), {
            id: 'enregistrement-note',
          });
          return;
        }
        // Rien n'est perdu : le lot refusé repasse sous les saisies plus récentes
        attente.current = refusees;
        setEtat('erreur');
        toast.error(messageErreur(err, translate('notes.saving.saveFailed')), {
          id: 'enregistrement-note',
        });
      },
    );
    enCours.current = envoi;
    await envoi;
    if (
      (!estVide(attente.current) || contenu.current?.sale()) &&
      !minuteur.current &&
      actif.current &&
      !enPause.current
    )
      return vider();
  }, [id, mutateAsync, conflit, collecter]);

  /** Ajoute des modifications ; `immediat` pour les choix ponctuels (type, visibilité…). */
  const planifier = useCallback(
    (patch: ModificationNote, immediat = false) => {
      if (!actif.current) return;
      attente.current = fusionner(attente.current, patch);
      if (enPause.current) return;
      setEtat((e) => (e === 'en-cours' ? e : 'en-attente'));
      if (minuteur.current) clearTimeout(minuteur.current);
      minuteur.current = null;
      if (immediat) void vider();
      else minuteur.current = setTimeout(() => void vider(), delai);
    },
    [delai, vider],
  );

  /**
   * Fin d'un conflit : reprise de l'enregistrement, sur la version relue.
   * `modifs` : réappliquer ces modifications (choix explicite de l'utilisateur).
   */
  const reprendre = useCallback(
    (modifs?: ModificationNote) => {
      enPause.current = false;
      // Saisies faites pendant le conflit : parties avec le reste
      collecter();
      const suite = attente.current;
      attente.current = {};
      setEtat('enregistre');
      const lot = modifs ? fusionner(modifs, suite) : suite;
      if (!estVide(lot)) planifier(lot, true);
    },
    [planifier, collecter],
  );

  /** L'éditeur a adopté une version plus récente du service (rien n'était en attente). */
  const adopter = useCallback((recente: Note) => {
    base.current = recente.version;
    etiquettes.current = recente.tagRefs;
  }, []);

  /** Oublie tout ce qui est en attente (la note va être supprimée). */
  const abandonner = useCallback(() => {
    actif.current = false;
    attente.current = {};
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = null;
  }, []);

  const enAttente = useCallback(
    () =>
      !estVide(attente.current) ||
      contenu.current?.sale() === true ||
      enCours.current !== null ||
      enPause.current,
    [],
  );

  /** Version sur laquelle repose la saisie. */
  const versionDeBase = useCallback(() => base.current, []);

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

  return { etat, planifier, vider, abandonner, reprendre, adopter, enAttente, versionDeBase };
}
