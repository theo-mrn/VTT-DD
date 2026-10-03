// Socle commun du Bombardement de Zone — canal PARTAGÉ (api.sharedState) écrit par un joueur quand
// il valide une frappe, lu en temps réel par le client MJ pour afficher un toast des cibles
// touchées. Un seul appel actif à la fois (le dernier écrasant le précédent) : ce n'est pas un
// historique, juste une notification éphémère (le MJ décide ensuite d'infliger les dégâts ou non).

const STRIKE_KEY = 'bombardementStrike';

export interface BombardementStrike {
  /** Id du personnage (cartes/{roomId}/characters/{id}) ayant déclenché la frappe — permet au MJ de
   *  retrouver sa scène RÉELLE (character.currentSceneId, déjà stocké sur son doc) plutôt que de la
   *  recalculer/dupliquer ici. */
  authorId: string;
  /** Nom (Nomperso) du joueur ayant déclenché la frappe, pour l'affichage MJ. */
  authorName: string;
  /** Centre de la zone, en % (0-100) de la largeur/hauteur de l'image de fond. */
  xPct: number;
  yPct: number;
  /** Rayon de la zone, en % (0-100) de la largeur de l'image de fond. */
  radiusPct: number;
  /** Noms des personnages détectés dans la zone au moment de la frappe. */
  targetNames: string[];
  /** Horodatage (Date.now()) — permet au MJ de ne réagir qu'aux frappes nouvelles. */
  timestamp: number;
}

export const parseStrike = (v: unknown): BombardementStrike | null => {
  if (typeof v !== 'string' || !v) return null;
  try {
    const raw = JSON.parse(v) as Record<string, unknown>;
    if (typeof raw.timestamp !== 'number') return null;
    return {
      authorId: typeof raw.authorId === 'string' ? raw.authorId : '',
      authorName: typeof raw.authorName === 'string' ? raw.authorName : 'Inconnu',
      xPct: typeof raw.xPct === 'number' ? raw.xPct : 50,
      yPct: typeof raw.yPct === 'number' ? raw.yPct : 50,
      radiusPct: typeof raw.radiusPct === 'number' ? raw.radiusPct : 10,
      targetNames: Array.isArray(raw.targetNames) ? raw.targetNames.filter((n) => typeof n === 'string') : [],
      timestamp: raw.timestamp,
    };
  } catch {
    return null;
  }
};

export const subscribeStrike = (api: any, cb: (strike: BombardementStrike | null) => void): (() => void) =>
  api.sharedState.subscribe(STRIKE_KEY, (v: unknown) => cb(parseStrike(v)));

export const writeStrike = (api: any, strike: BombardementStrike): Promise<void> =>
  api.sharedState.set(STRIKE_KEY, JSON.stringify(strike));

/** Efface la frappe du canal partagé — appelé par le MJ une fois la frappe traitée (dégâts
 *  appliqués à tous, ou fermeture manuelle). Sans ça, la frappe persistant en RTDB re-déclenche le
 *  panneau à chaque refresh avec son état "appliqué" remis à zéro → double application possible. */
export const clearStrike = (api: any): Promise<void> =>
  api.sharedState.set(STRIKE_KEY, null);
