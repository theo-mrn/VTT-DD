/**
 * Systèmes de jeu (service character) : liste publique, document chargé par
 * `@vtt/rules` et présentation vérifiée. Le front ne connaît aucune clé de
 * jeu : ce qu'il affiche vient du système et de sa présentation, ou d'une
 * disposition par défaut générée depuis le système quand il n'en a pas.
 */
'use client';

import {
  charger,
  Presentation,
  verifierPresentation,
  type Attribut,
  type ErreurPresentation,
  type SystemeCharge,
  type Widget,
} from '@vtt/rules';
import { api, ApiError } from './api';
import { useRessource } from './ressource';

export interface ResumeSysteme {
  id: string;
  version: string;
  nom: string;
  description?: string;
}

/** Système prêt à l'emploi : règles chargées et présentation (fournie ou générée). */
export interface SystemePret {
  systeme: SystemeCharge;
  presentation: Presentation;
  /** Vrai si le système n'a pas de présentation valide : la disposition est générée. */
  parDefaut: boolean;
  /** Erreurs de la présentation fournie, quand elle a été écartée. */
  erreursPresentation: ErreurPresentation[];
}

export function listerSystemes() {
  return api<ResumeSysteme[]>('/v1/systems');
}

// ─── Chargement, avec cache ──────────────────────────────────────────────────

const cache = new Map<string, Promise<SystemePret>>();

function preparer(id: string, brut: { systeme: unknown; presentation: unknown }): SystemePret {
  const r = charger(brut.systeme);
  if (!r.ok) {
    const premieres = r.erreurs
      .slice(0, 3)
      .map((e) => `${e.chemin} : ${e.message}`)
      .join(' ; ');
    throw new ApiError({
      status: 422,
      title: 'Système invalide',
      detail: `Le système « ${id} » ne se charge pas (${premieres}).`,
    });
  }
  const systeme = r.systeme;
  if (brut.presentation) {
    const v = verifierPresentation(brut.presentation, systeme);
    if (v.ok)
      return { systeme, presentation: v.presentation, parDefaut: false, erreursPresentation: [] };
    return {
      systeme,
      presentation: presentationParDefaut(systeme),
      parDefaut: true,
      erreursPresentation: v.erreurs,
    };
  }
  return {
    systeme,
    presentation: presentationParDefaut(systeme),
    parDefaut: true,
    erreursPresentation: [],
  };
}

/** Charge un système une seule fois par session (les échecs ne sont pas gardés). */
export function chargerSysteme(id: string): Promise<SystemePret> {
  let p = cache.get(id);
  if (!p) {
    p = api<{ systeme: unknown; presentation: unknown }>(
      `/v1/systems/${encodeURIComponent(id)}`,
    ).then((brut) => preparer(id, brut));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Système chargé et présentation ; rien n'est chargé tant que `id` vaut null. */
export function useSysteme(id: string | null) {
  return useRessource(id ? `systeme:${id}` : null, () => chargerSysteme(id!));
}

// ─── Disposition par défaut ──────────────────────────────────────────────────

const estNumerique = (a: Attribut) =>
  a.nature === 'base' || (a.nature === 'derivee' && a.type !== 'texte');

/**
 * Fiche générée depuis le système : profil (entrées uniques, attributs texte
 * et choix), ressources, un bloc par groupe d'attributs, monnaies, une liste
 * par sorte possédable, arbres, actions, puis les textes longs.
 */
export function widgetsParDefaut(systeme: SystemeCharge, type: string): Widget[] {
  const entite = systeme.entites.get(type);
  if (!entite) return [];
  const attributs = [...entite.attributs.values()].filter((a) => a.visibilite !== 'mj');
  const sortes = [...systeme.sortes.values()].filter((s) => s.pour.includes(type));
  const widgets: Widget[] = [];

  const uniques = sortes.filter((s) => s.maximum === 1);
  const courts = attributs.filter(
    (a) =>
      a.nature === 'choix' ||
      (a.nature === 'texte' && !a.multiligne) ||
      (a.nature === 'derivee' && a.type === 'texte'),
  );
  if (uniques.length || courts.length) {
    widgets.push({
      type: 'details',
      titre: 'Profil',
      sortes: uniques.map((s) => s.id),
      attributs: courts.map((a) => a.cle),
    });
  }

  const ressources = attributs.filter((a) => a.nature === 'ressource');
  if (ressources.length)
    widgets.push({
      type: 'ressources',
      titre: 'Ressources',
      attributs: ressources.map((a) => a.cle),
    });

  for (const g of entite.type.groupes) {
    const membres = attributs.filter((a) => a.groupe === g.id && estNumerique(a));
    if (membres.length) {
      widgets.push({
        type: 'attributs',
        titre: g.nom,
        attributs: membres.map((a) => a.cle),
        colonnes: Math.min(6, Math.max(2, membres.length)),
      });
    }
  }
  const groupes = new Set(entite.type.groupes.map((g) => g.id));
  const sansGroupe = attributs.filter(
    (a) => estNumerique(a) && (!a.groupe || !groupes.has(a.groupe)),
  );
  if (sansGroupe.length)
    widgets.push({
      type: 'attributs',
      titre: 'Attributs',
      attributs: sansGroupe.map((a) => a.cle),
    });

  if ([...systeme.monnaies.values()].some((m) => m.pour.includes(type)))
    widgets.push({ type: 'monnaies', titre: 'Progression' });

  for (const s of sortes.filter((s) => s.maximum !== 1))
    widgets.push({ type: 'possessions', titre: s.nomPluriel ?? s.nom, sorte: s.id });

  const arbres = [...systeme.arbres.values()].some((a) =>
    a.noeuds.some((n) => {
      const e = systeme.entrees.get(n.entree);
      return !!e && !!systeme.sortes.get(e.sorte)?.pour.includes(type);
    }),
  );
  if (arbres) widgets.push({ type: 'arbres', titre: 'Arbres' });

  if ([...systeme.actions.values()].some((a) => a.pour.includes(type)))
    widgets.push({ type: 'actions', titre: 'Actions' });

  for (const a of attributs)
    if (a.nature === 'texte' && a.multiligne)
      widgets.push({ type: 'texte', titre: a.nom, attribut: a.cle });

  return widgets;
}

/** Présentation minimale : pas de thème (celui de l'app), fiches générées pour chaque type. */
export function presentationParDefaut(systeme: SystemeCharge): Presentation {
  const fiches: Record<string, { widgets: Widget[] }> = {};
  for (const type of systeme.entites.keys()) {
    const widgets = widgetsParDefaut(systeme, type);
    if (widgets.length) fiches[type] = { widgets };
  }
  return Presentation.parse({ format: 1, systeme: systeme.source.id, fiches });
}

/** Blocs de la fiche d'un type d'entité : ceux de la présentation, sinon générés. */
export function widgetsFiche(pret: SystemePret, type: string): Widget[] {
  return pret.presentation.fiches[type]?.widgets ?? widgetsParDefaut(pret.systeme, type);
}
