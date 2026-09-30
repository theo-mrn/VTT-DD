/**
 * Envoi des jets d'action au service dice (POST /internal/rolls, secret
 * partagé), pour qu'ils apparaissent dans l'historique des jets de la
 * campagne, comme les jets du lanceur de dés.
 *
 * L'envoi part après l'enregistrement de l'action et n'est jamais bloquant :
 * une panne de dice est journalisée, l'action reste jouée.
 *
 * Une action à cible n'envoie que la vue de l'acteur (`vueActeur` de @vtt/rules : ses dés,
 * l'issue, les valeurs que le système lui montre) : le déroulé complet nomme les défenses et
 * les valeurs de la cible, qu'un joueur ne doit jamais lire (docs/combat.md § 7.7).
 */
import type { ResultatAction, SystemeCharge } from '@vtt/rules';
import { EN_TETE_SECRET_INTERNE } from '../interne/secret.js';

/** Visibilité d'un jet dans l'historique (contrat de dice). */
export type VisibiliteJet = 'public' | 'private' | 'gm' | 'self';

/** Corps de POST /internal/rolls (contrat de dice, en anglais). */
export interface JetAction {
  campaignId?: string;
  authorId: string;
  characterId: string;
  characterName: string;
  characterAvatarUrl: string | null;
  actionId: string;
  label?: string;
  notation?: string;
  systemId: string;
  visibility: VisibiliteJet;
  dice: { faces: number; values: { value: number; kept: boolean; exploded: boolean }[] }[];
  symbols?: {
    dice: { die: string; face: number; symbols: Record<string, number> }[];
    totals: Record<string, number>;
    results: Record<string, number>;
  };
  total?: number;
  outcome: { success: boolean | null; critical: boolean; fumble: boolean };
  explanations: string[];
}

export interface JournalDes {
  /** Transmet un jet ; la promesse ne rejette jamais (échec journalisé). */
  transmettre(jet: JetAction, correlationId?: string): Promise<void>;
}

/** Sans DICE_URL : les jets d'action ne sont pas transmis. */
export const sansDes: JournalDes = { transmettre: async () => undefined };

const DELAI_MS = 3_000;

export function journalDes(o: {
  url: string;
  secret: string;
  fetch?: typeof globalThis.fetch;
  /** Journal des échecs d'envoi. */
  signaler?: (erreur: unknown, jet: Pick<JetAction, 'characterId' | 'actionId'>) => void;
}): JournalDes {
  const appel = o.fetch ?? globalThis.fetch;
  return {
    async transmettre(jet, correlationId) {
      try {
        const res = await appel(new URL('/internal/rolls', o.url), {
          method: 'POST',
          headers: {
            [EN_TETE_SECRET_INTERNE]: o.secret,
            'content-type': 'application/json',
            ...(correlationId ? { 'x-correlation-id': correlationId } : {}),
          },
          body: JSON.stringify(jet),
          signal: AbortSignal.timeout(DELAI_MS),
        });
        if (!res.ok) throw new Error(`dice a répondu ${res.status}`);
      } catch (erreur) {
        o.signaler?.(erreur, { characterId: jet.characterId, actionId: jet.actionId });
      }
    },
  };
}

/**
 * Jet d'une action résolue, au format de dice : le résultat d'une action sans cible, ou la vue
 * de l'acteur (`vueActeur`) d'une action à cible. `success` remplace la réussite (null : elle
 * n'est pas la même pour toutes les cibles d'un jet commun).
 */
export function jetPourDes(
  systeme: SystemeCharge,
  acteur: { id: string; nom: string; avatarUrl: string | null },
  resultat: Pick<ResultatAction, 'action' | 'reussi' | 'jet' | 'explications'>,
  contexte: {
    authorId: string;
    campaignId?: string;
    visibility?: VisibiliteJet;
    success?: boolean | null;
  },
): JetAction {
  const success = contexte.success === undefined ? resultat.reussi : contexte.success;
  const action = systeme.source.actions.find((a) => a.id === resultat.action);
  const jet = resultat.jet;
  const commun = {
    ...(contexte.campaignId ? { campaignId: contexte.campaignId } : {}),
    authorId: contexte.authorId,
    characterId: acteur.id,
    characterName: acteur.nom,
    characterAvatarUrl: acteur.avatarUrl,
    actionId: resultat.action,
    ...(action?.nom ? { label: action.nom.slice(0, 200) } : {}),
    systemId: systeme.source.id,
    visibility: contexte.visibility ?? 'public',
    explanations: resultat.explications,
  };
  if (jet.type === 'numerique') {
    return {
      ...commun,
      notation: jet.formule.slice(0, 500),
      dice: jet.jets.map((j) => ({
        faces: j.faces,
        values: j.des.map((d) => ({ value: d.valeur, kept: d.garde, exploded: d.explosion })),
      })),
      total: jet.total,
      outcome: { success, critical: jet.critique, fumble: jet.fumble },
    };
  }
  return {
    ...commun,
    dice: [],
    symbols: {
      dice: jet.des.map((d) => ({ die: d.de, face: d.face, symbols: d.symboles })),
      totals: jet.symboles,
      results: jet.resultats,
    },
    outcome: { success, critical: false, fumble: false },
  };
}
