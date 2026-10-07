/**
 * Menu « Capacités » du combat (docs/combat.md § 19.1) : les capacités qui s'utilisent, et
 * comment chacune se joue, sans aucun nom de capacité dans le code.
 * - **Action dédiée** : une action à cible du système dont l'`exige` lit `possede("<capacité>")`
 *   (Charge, Soins légers…), ou qui reçoit les capacités de son étiquette en paramètre (Sort :
 *   capacités « sort ») : le menu d'attaque s'ouvre sur elle.
 * - **À activer** (sorte activable) : elle s'active sur la fiche (usage consommé, durée lancée).
 * - Sinon, **action générique** de la présentation (`combat.capacites.action`) : le menu
 *   d'attaque s'ouvre sur elle, la capacité en paramètre ; ses dés sont lancés, le MJ lit son
 *   texte et applique.
 * Capacités retenues : possédées, des sortes déclarées (`combat.capacites.sortes`), sauf les
 * passives pures (valeur de `passives.champ` parmi `passives.valeurs`, sans usages limités ni
 * action dédiée).
 */
'use client';

import {
  usagesDe,
  type Action,
  type Entree,
  type Fiche,
  type PossessionEffective,
  type Presentation,
  type SystemeCharge,
  type Usages,
} from '@vtt/rules';
import type { AttackOrigin } from '@vtt/contracts';
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';
import { actionAllowed, isTargeted } from './actions';

export type CapacitesCombat = NonNullable<NonNullable<Presentation['combat']>['capacites']>;

/** Ce que la présentation déclare pour le menu Capacités ; null : pas de menu. */
export function capacitesDeLaPresentation(
  presentation: Presentation | null | undefined,
): CapacitesCombat | null {
  return presentation?.combat?.capacites ?? null;
}

/** Comment une capacité se joue. */
/** Action dédiée, avec la capacité en paramètre quand l'action la reçoit (Sort). */
export interface ActionDediee {
  action: Action;
  params?: Record<string, string>;
}

export type JeuCapacite =
  | { type: 'actions'; actions: ActionDediee[] }
  | { type: 'activer' }
  | { type: 'generique'; action: Action; parametre: string };

export interface CapaciteCombat {
  entree: Entree;
  possession: PossessionEffective;
  jeu: JeuCapacite;
  /** Activée (capacité à activer allumée). */
  active: boolean;
  usages: Usages | null;
  /** Plus d'utilisation : elle ne se joue pas. */
  epuisee: boolean;
  /** Valeur du champ d'activation (« Action limitée »…), pour la ligne. */
  activation: string | null;
}

/** Capacités lues par l'`exige` de chaque action : `possede("x")` → actions de x. */
export function actionsParCapacite(systeme: SystemeCharge): Map<string, Action[]> {
  const m = new Map<string, Action[]>();
  for (const a of systeme.actions.values()) {
    if (!a.exige) continue;
    for (const [, id] of a.exige.matchAll(/possede\(\s*"([^"]+)"\s*\)/g))
      m.set(id!, [...(m.get(id!) ?? []), a]);
  }
  return m;
}

/** Les capacités de cette fiche qui se jouent en combat, dans l'ordre du catalogue. */
export function capacitesDeCombat(
  systeme: SystemeCharge,
  presentation: Presentation | null | undefined,
  fiche: Fiche,
): CapaciteCombat[] {
  const decl = capacitesDeLaPresentation(presentation);
  if (!decl) return [];
  const dediees = actionsParCapacite(systeme);
  const generique = decl.action ? (systeme.actions.get(decl.action) ?? null) : null;
  const lus = generique ? champsLus(generique, decl.parametre) : [];
  const sortie: CapaciteCombat[] = [];
  for (const p of fiche.possessions.values()) {
    if (!decl.sortes.includes(p.sorte.id)) continue;
    if (p.sorte.rangs && p.rang < 1) continue;
    const champ = decl.passives?.champ;
    const v = champ ? (p.possession?.champs[champ] ?? p.entree.champs[champ]) : undefined;
    const activation = typeof v === 'string' && v.trim() ? v.trim() : null;
    const passive = activation !== null && !!decl.passives?.valeurs.includes(activation);
    const usages = usagesDe(fiche, p.entree.id) ?? null;
    const jouable = (a: Action) =>
      isTargeted(a) && a.pour.includes(fiche.etat.type) && actionAllowed(systeme, a, fiche);
    const actions: ActionDediee[] = [
      ...(dediees.get(p.entree.id) ?? []).filter(jouable).map((action) => ({ action })),
      // Action qui reçoit les capacités d'une étiquette (Sort : capacités « sort »)
      ...[...systeme.actions.values()].flatMap((a) => {
        if (a.id === generique?.id || !jouable(a)) return [];
        const param = a.parametres.find(
          (x) =>
            x.type === 'entree' &&
            x.sorte === p.sorte.id &&
            x.etiquette !== undefined &&
            p.entree.etiquettes.includes(x.etiquette),
        );
        return param ? [{ action: a, params: { [param.id]: p.entree.id } }] : [];
      }),
    ];
    const jeu: JeuCapacite | null = actions.length
      ? { type: 'actions', actions }
      : p.sorte.activable
        ? { type: 'activer' }
        : generique && accepteCapacite(generique, decl.parametre, p.sorte.id)
          ? { type: 'generique', action: generique, parametre: decl.parametre }
          : null;
    if (!jeu) continue;
    // Passive pure : écartée, sauf si elle a de quoi se jouer (usages, dés, effets donnés…)
    if (
      passive &&
      !usages &&
      jeu.type === 'generique' &&
      !p.entree.donne &&
      !lus.some((c) => valeurRenseignee(p.entree.champs[c]))
    )
      continue;
    sortie.push({
      entree: p.entree,
      possession: p,
      jeu,
      active: p.sorte.activable && p.actif,
      usages,
      epuisee: usages !== null && usages.restants <= 0,
      activation,
    });
  }
  return sortie;
}

/** Champs de la capacité que l'action générique lit (`capacite.jet`, `capacite.soins`…). */
function champsLus(action: Action, parametre: string): string[] {
  const texte = JSON.stringify({ jet: action.jet, apres: action.apres, c: action.consequences });
  return [
    ...new Set([...texte.matchAll(new RegExp(`\\b${parametre}\\.(\\w+)`, 'g'))].map((m) => m[1]!)),
  ];
}

const valeurRenseignee = (v: unknown) =>
  v !== undefined && v !== '' && v !== 0 && !(Array.isArray(v) && !v.length);

/** Le paramètre de l'action générique reçoit une entrée de cette sorte. */
function accepteCapacite(action: Action, parametre: string, sorte: string): boolean {
  const p = action.parametres.find((x) => x.id === parametre);
  return p?.type === 'entree' && p.sorte === sorte;
}

/** Groupes du menu, comme la vue Capacités de la fiche. */
export type GroupeCapacites = 'actives' | 'aActiver' | 'limitees' | 'autres';

export function groupeDe(c: CapaciteCombat): GroupeCapacites {
  if (c.jeu.type === 'activer') return c.active ? 'actives' : 'aActiver';
  return c.usages ? 'limitees' : 'autres';
}

/** Action générique hors du menu d'attaque (elle ne se joue qu'avec une capacité). */
export function actionGenerique(presentation: Presentation | null | undefined): string | null {
  return capacitesDeLaPresentation(presentation)?.action ?? null;
}

// ─── Ouverture du menu ───────────────────────────────────────────────────────

export interface CapacitiesMenuRequest {
  campaignId: string;
  /** Personnage qui joue la capacité. */
  actorId: string;
  /** D'où vient l'ouverture, repris par le menu d'attaque. */
  origin: AttackOrigin;
}

export const capacitiesMenuStore = createStore<{ request: CapacitiesMenuRequest | null }>()(() => ({
  request: null,
}));

export function openCapacitiesMenu(request: CapacitiesMenuRequest) {
  capacitiesMenuStore.setState({ request });
}

export function closeCapacitiesMenu() {
  capacitiesMenuStore.setState({ request: null });
}

export function useCapacitiesMenu(): CapacitiesMenuRequest | null {
  return useStore(capacitiesMenuStore, (s) => s.request);
}
