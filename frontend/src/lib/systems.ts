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
import { useResource } from './resource';

export interface SystemSummary {
  id: string;
  version: string;
  nom: string;
  description?: string;
}

/** Système prêt à l'emploi : règles chargées et présentation (fournie ou générée). */
export interface ReadySystem {
  system: SystemeCharge;
  presentation: Presentation;
  /** Vrai si le système n'a pas de présentation valide : la disposition est générée. */
  fallback: boolean;
  /** Erreurs de la présentation fournie, quand elle a été écartée. */
  presentationErrors: ErreurPresentation[];
}

export function listSystems() {
  return api<SystemSummary[]>('/v1/systems');
}

// ─── Chargement, avec cache ──────────────────────────────────────────────────

const cache = new Map<string, Promise<ReadySystem>>();

function prepare(id: string, raw: { systeme: unknown; presentation: unknown }): ReadySystem {
  const r = charger(raw.systeme);
  if (!r.ok) {
    const first = r.erreurs
      .slice(0, 3)
      .map((e) => `${e.chemin} : ${e.message}`)
      .join(' ; ');
    throw new ApiError({
      status: 422,
      title: 'Système invalide',
      detail: `Le système « ${id} » ne se charge pas (${first}).`,
    });
  }
  const system = r.systeme;
  if (raw.presentation) {
    const v = verifierPresentation(raw.presentation, system);
    if (v.ok)
      return { system, presentation: v.presentation, fallback: false, presentationErrors: [] };
    return {
      system,
      presentation: defaultPresentation(system),
      fallback: true,
      presentationErrors: v.erreurs,
    };
  }
  return {
    system,
    presentation: defaultPresentation(system),
    fallback: true,
    presentationErrors: [],
  };
}

/** Charge un système une seule fois par session (les échecs ne sont pas gardés). */
export function loadSystem(id: string): Promise<ReadySystem> {
  let p = cache.get(id);
  if (!p) {
    p = api<{ systeme: unknown; presentation: unknown }>(
      `/v1/systems/${encodeURIComponent(id)}`,
    ).then((raw) => prepare(id, raw));
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}

/** Système chargé et présentation ; rien n'est chargé tant que `id` vaut null. */
export function useSystem(id: string | null) {
  return useResource(id ? `systeme:${id}` : null, () => loadSystem(id!));
}

// ─── Disposition par défaut ──────────────────────────────────────────────────

const isNumeric = (a: Attribut) =>
  a.nature === 'base' || (a.nature === 'derivee' && a.type !== 'texte');

/**
 * Fiche générée depuis le système : profil (entrées uniques, attributs texte
 * et choix), ressources, un bloc par groupe d'attributs, monnaies, une liste
 * par sorte possédable, arbres, actions, puis les textes longs.
 */
export function defaultWidgets(system: SystemeCharge, type: string): Widget[] {
  const entity = system.entites.get(type);
  if (!entity) return [];
  const attributes = [...entity.attributs.values()].filter((a) => a.visibilite !== 'mj');
  const kinds = [...system.sortes.values()].filter((s) => s.pour.includes(type));
  const widgets: Widget[] = [];

  const singles = kinds.filter((s) => s.maximum === 1);
  const shortOnes = attributes.filter(
    (a) =>
      a.nature === 'choix' ||
      (a.nature === 'texte' && !a.multiligne) ||
      (a.nature === 'derivee' && a.type === 'texte'),
  );
  if (singles.length || shortOnes.length) {
    widgets.push({
      type: 'details',
      titre: 'Profil',
      sortes: singles.map((s) => s.id),
      attributs: shortOnes.map((a) => a.cle),
    });
  }

  const resources = attributes.filter((a) => a.nature === 'ressource');
  if (resources.length)
    widgets.push({
      type: 'ressources',
      titre: 'Ressources',
      attributs: resources.map((a) => a.cle),
    });

  for (const g of entity.type.groupes) {
    const members = attributes.filter((a) => a.groupe === g.id && isNumeric(a));
    if (members.length) {
      widgets.push({
        type: 'attributs',
        titre: g.nom,
        attributs: members.map((a) => a.cle),
        colonnes: Math.min(6, Math.max(2, members.length)),
      });
    }
  }
  const groups = new Set(entity.type.groupes.map((g) => g.id));
  const ungrouped = attributes.filter((a) => isNumeric(a) && (!a.groupe || !groups.has(a.groupe)));
  if (ungrouped.length)
    widgets.push({
      type: 'attributs',
      titre: 'Attributs',
      attributs: ungrouped.map((a) => a.cle),
    });

  if ([...system.monnaies.values()].some((m) => m.pour.includes(type)))
    widgets.push({ type: 'monnaies', titre: 'Progression' });

  for (const s of kinds.filter((s) => s.maximum !== 1))
    widgets.push({ type: 'possessions', titre: s.nomPluriel ?? s.nom, sorte: s.id });

  const trees = [...system.arbres.values()].some((a) =>
    a.noeuds.some((n) => {
      const e = system.entrees.get(n.entree);
      return !!e && !!system.sortes.get(e.sorte)?.pour.includes(type);
    }),
  );
  if (trees) widgets.push({ type: 'arbres', titre: 'Arbres' });

  if ([...system.actions.values()].some((a) => a.pour.includes(type)))
    widgets.push({ type: 'actions', titre: 'Actions' });

  for (const a of attributes)
    if (a.nature === 'texte' && a.multiligne)
      widgets.push({ type: 'texte', titre: a.nom, attribut: a.cle });

  return widgets;
}

/** Présentation minimale : pas de thème (celui de l'app), fiches générées pour chaque type. */
export function defaultPresentation(system: SystemeCharge): Presentation {
  const sheets: Record<string, { widgets: Widget[] }> = {};
  for (const type of system.entites.keys()) {
    const widgets = defaultWidgets(system, type);
    if (widgets.length) sheets[type] = { widgets };
  }
  return Presentation.parse({ format: 1, systeme: system.source.id, fiches: sheets });
}

/** Blocs de la fiche d'un type d'entité : ceux de la présentation, sinon générés. */
export function sheetWidgets(ready: ReadySystem, type: string): Widget[] {
  return ready.presentation.fiches[type]?.widgets ?? defaultWidgets(ready.system, type);
}
