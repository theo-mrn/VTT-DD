/**
 * Systèmes de jeu : index léger (liste, création de campagne) et documents
 * complets chargés à la demande puis validés par @vtt/rules.
 *
 * Aujourd'hui servis en statique (public/systemes, copiés au build depuis
 * @vtt/systemes) ; le service campaign les servira ensuite, avec les systèmes
 * créés par les MJ, sans changer ces fonctions pour les écrans.
 */
'use client';

import { useQuery } from '@tanstack/react-query';
import { charger, Presentation, type SystemeCharge } from '@vtt/rules';

export interface ResumeSysteme {
  id: string;
  nom: string;
  version: string;
  description: string;
  entrees: number;
  sortes: { id: string; nom: string; nombre: number }[];
  creation: { entite: string; etapes: string[] }[];
  desSymboles: boolean;
  /** Créatures du bestiaire de référence (0 : aucun), voir docs/ressources.md. */
  bestiaire?: number;
  /** Illustration et couleur d'accent de la présentation, si elle en déclare. */
  couverture: string | null;
  accent: string | null;
}

export interface SystemeComplet {
  systeme: SystemeCharge;
  presentation: Presentation | null;
}

async function lireJson<T>(chemin: string): Promise<T> {
  const res = await fetch(chemin);
  if (!res.ok) throw new Error(`Système introuvable (${res.status})`);
  return (await res.json()) as T;
}

export function lireSystemes() {
  return lireJson<ResumeSysteme[]>('/systemes/index.json');
}

const cache = new Map<string, Promise<SystemeComplet>>();

/**
 * Charge et valide un système (une seule fois par onglet). @vtt/rules n'a pas de chargement
 * sans validation : `charger()` applique les valeurs par défaut du schéma et compile les
 * formules, il ne peut pas être sauté sans risque ; le résultat est donc gardé ici.
 */
export function chargerSysteme(id: string, avecPresentation = true): Promise<SystemeComplet> {
  const existant = cache.get(id);
  if (existant) return existant;
  const promesse = (async () => {
    const [document, brut] = await Promise.all([
      lireJson<unknown>(`/systemes/${encodeURIComponent(id)}.json`),
      avecPresentation
        ? lireJson<unknown>(`/systemes/${encodeURIComponent(id)}.presentation.json`).catch(
            () => null,
          )
        : null,
    ]);
    const r = charger(document);
    if (!r.ok) throw new Error(`Système ${id} invalide : ${r.erreurs[0]?.message ?? ''}`);
    const p = brut ? Presentation.safeParse(brut) : null;
    return { systeme: r.systeme, presentation: p?.success ? p.data : null };
  })();
  cache.set(id, promesse);
  promesse.catch(() => cache.delete(id));
  return promesse;
}

export function useSystemes() {
  return useQuery({
    queryKey: ['systemes'],
    queryFn: lireSystemes,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useSysteme(id: string | null | undefined) {
  return useQuery({
    queryKey: ['systemes', id],
    queryFn: () => chargerSysteme(id!),
    enabled: Boolean(id),
    // Validé une fois par onglet (cache ci-dessus) ; gardé toute la session, sans repasser par
    // l'état de chargement au remontage
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Image d'une entrée du catalogue (race, profil…) déclarée par la présentation. */
export function imageEntree(p: Presentation | null | undefined, id: string): string | null {
  return p?.images[id] ?? null;
}
