/**
 * Paramètres choisis après le jet (`etape: apres`, docs/regles.md) : l'arme d'une attaque, une
 * fois la cible touchée. Le jet ne peut pas en dépendre : ses formules (jet, réussite, critique,
 * échec critique, réserve, vérifications, effets de situation sur le jet) et les variables
 * qu'elles lisent sont calculées sans eux. Les autres variables de l'action sont calculées après
 * le jet, avec eux (dégâts, bonus aux DM).
 */
import { chemins } from '../chargement/charger.js';
import type { FormuleVerifiee } from '../formules/index.js';
import type { Action, EffetJet } from '../schema/index.js';

export interface EtapesAction {
  /** Identifiants des paramètres `etape: apres`. */
  apres: ReadonlySet<string>;
  /** Variables de l'action calculées après le jet (vide sans paramètre `apres`). */
  variablesApres: ReadonlySet<string>;
  /** Formules du jet qui lisent un paramètre `apres` (erreurs de chargement). */
  conflits: { chemin: string; variable: string }[];
}

/** Variable tirée d'un paramètre : `arme`, `arme.rang`, `arme.degats` → `arme`. */
const racine = (nom: string) => nom.split('.', 1)[0]!;

/**
 * Phases des formules d'une action. `formule` rend la formule compilée d'un chemin (absente :
 * rien à lire), `situation` les effets de situation reçus par l'action.
 */
export function etapesAction(
  action: Action,
  formule: (chemin: string) => FormuleVerifiee | undefined,
  situation: readonly EffetJet[] = [],
): EtapesAction {
  const apres = new Set(action.parametres.filter((p) => p.etape === 'apres').map((p) => p.id));
  if (!apres.size) return { apres, variablesApres: new Set(), conflits: [] };
  const ch = (x: string) => chemins.action(action.id, x);
  const jet = action.jet;

  // Formules lues pendant le jet
  const lues: string[] = [];
  if (jet.type === 'numerique') {
    lues.push(ch('jet/formule'));
    for (const k of ['reussite', 'critique', 'fumble'] as const)
      if (jet[k] !== undefined) lues.push(ch(`jet/${k}`));
  } else {
    jet.pool.forEach((_, i) => lues.push(ch(`jet/pool/${i}`)));
    jet.ameliorations.forEach((_, i) => lues.push(ch(`jet/ameliorations/${i}`)));
    if (jet.reussite !== undefined) lues.push(ch('jet/reussite'));
  }
  action.verifications.forEach((_, i) => lues.push(ch(`verifications/${i}`)));

  // Variables de l'action que le jet lit, de proche en proche (effets de situation compris)
  const variables = new Map(action.variables.map((v) => [v.cle, ch(`variables/${v.cle}`)]));
  const duJet = new Set<string>();
  const suivre = (chemin: string) => {
    for (const n of formule(chemin)?.variables ?? []) {
      const v = variables.get(n);
      if (v && !duJet.has(n)) {
        duJet.add(n);
        lues.push(v);
        suivre(v);
      }
    }
  };
  for (const c of [...lues]) suivre(c);
  situation.forEach((f, i) => {
    if (!f.ajout || (f.actions && !f.actions.includes(action.id))) return;
    if ('variable' in f.ajout && !duJet.has(f.ajout.variable)) return;
    let cle = 'nombre';
    if ('bonus' in f.ajout) cle = 'bonus';
    else if ('variable' in f.ajout) cle = 'ajouter';
    for (const x of ['condition', 'si', cle]) {
      const c = chemins.situation(action.id, i, x);
      if (formule(c)) {
        lues.push(c);
        suivre(c);
      }
    }
  });

  const conflits: EtapesAction['conflits'] = [];
  for (const c of new Set(lues))
    for (const n of formule(c)?.variables ?? [])
      if (apres.has(racine(n))) conflits.push({ chemin: c, variable: n });
  return {
    apres,
    variablesApres: new Set(action.variables.map((v) => v.cle).filter((c) => !duJet.has(c))),
    conflits,
  };
}
