'use client';

/**
 * Brouillon local de la création, par personnage : onglet ouvert, sous-étape
 * de chaque onglet et sélections pas encore envoyées au serveur. Tout ce qui
 * est validé vit sur le serveur ; le brouillon ne garde que l'entre-deux, pour
 * qu'un rechargement de page ne perde rien. Stockage indisponible (navigation
 * privée, quota) : le brouillon reste en mémoire.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Entrée retenue localement à une étape « choisir ». */
export interface DraftSelection {
  entry: string;
  choices: Record<string, string[]>;
  /** Champs de l'exemplaire (valeur d'une Obligation…). */
  fields: Record<string, number | string | boolean>;
}

export interface CreationDraft {
  tab?: string;
  subSteps: Record<string, number>;
  selections: Record<string, DraftSelection[]>;
  /** Adresse d'image saisie, pas encore enregistrée. */
  image?: string;
}

const PREFIX = 'vtt-creation-draft:';
const EMPTY: CreationDraft = { subSteps: {}, selections: {} };

function load(id: string): CreationDraft {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (!raw) return EMPTY;
    const d = JSON.parse(raw) as Partial<CreationDraft>;
    return { subSteps: d.subSteps ?? {}, selections: d.selections ?? {}, ...pick(d) };
  } catch {
    return EMPTY;
  }
}

const pick = (d: Partial<CreationDraft>) => ({
  ...(typeof d.tab === 'string' ? { tab: d.tab } : {}),
  ...(typeof d.image === 'string' ? { image: d.image } : {}),
});

export function clearCreationDraft(id: string) {
  try {
    localStorage.removeItem(PREFIX + id);
  } catch {
    // stockage indisponible : rien à effacer
  }
}

export function useCreationDraft(id: string) {
  const [draft, setDraft] = useState<CreationDraft>(() => load(id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sauvegarde différée : une frappe au clavier n'écrit pas à chaque touche
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(PREFIX + id, JSON.stringify(draft));
      } catch {
        // quota dépassé ou stockage bloqué : le brouillon reste en mémoire
      }
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [id, draft]);

  const update = useCallback(
    (patch: (d: CreationDraft) => Partial<CreationDraft>) =>
      setDraft((d) => ({ ...d, ...patch(d) })),
    [],
  );

  const setTab = useCallback((tab: string) => update(() => ({ tab })), [update]);
  const setSubStep = useCallback(
    (step: string, index: number) =>
      update((d) =>
        d.subSteps[step] === index ? {} : { subSteps: { ...d.subSteps, [step]: index } },
      ),
    [update],
  );
  const setSelection = useCallback(
    (step: string, selection: DraftSelection[] | null) =>
      update((d) => {
        const selections = { ...d.selections };
        if (selection) selections[step] = selection;
        else delete selections[step];
        return { selections };
      }),
    [update],
  );
  const setImage = useCallback((image: string | undefined) => update(() => ({ image })), [update]);

  return { draft, setTab, setSubStep, setSelection, setImage };
}

export type DraftTracker = ReturnType<typeof useCreationDraft>;
