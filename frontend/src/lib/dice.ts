/**
 * Service des dés (docs/api-dice.md), par la gateway `/v1/dice/*` : jets tirés
 * côté serveur, historique d'une campagne, statistiques et préférences de dés.
 *
 * Le navigateur ne tire jamais un résultat : il envoie la demande, le serveur
 * lance les dés (générateur cryptographique) et renvoie le jet enregistré, que
 * le front se contente d'afficher ou d'animer.
 */
import { api } from './api';

// ─── Types du contrat ────────────────────────────────────────────────────────

/**
 * `public` : toute la campagne ; `private` : l'auteur et le MJ ; `gm` : jet
 * caché (le MJ seul, l'auteur voit seulement qu'il a lancé) ; `self` : l'auteur seul.
 */
export type RollVisibility = 'public' | 'private' | 'gm' | 'self';

export type RollSource = 'free' | 'action' | 'api' | 'import';

export interface RollDieValue {
  value: number;
  /** Faux : dé écarté (`4d6k3`, avantage). */
  kept: boolean;
  exploded: boolean;
}

/** Un groupe de dés numériques de même taille (`2d6` → faces 6, deux valeurs). */
export interface RollDiceGroup {
  faces: number;
  values: RollDieValue[];
}

/** Dé à symboles tiré : sorte du système, face, symboles portés par la face. */
export interface RollSymbolDie {
  die: string;
  face: number;
  symbols: Record<string, number>;
}

export interface RollSymbols {
  dice: RollSymbolDie[];
  /** Total de chaque symbole brut. */
  totals: Record<string, number>;
  /** Résultats déclarés par le système (`succesNets`…), déjà calculés par le serveur. */
  results: Record<string, number>;
}

export interface RollOutcome {
  success: boolean | null;
  critical: boolean;
  fumble: boolean;
}

/**
 * Jet enregistré, tel que le renvoie le service : les champs du document de
 * l'ancienne app (`rolls/{salle}/rolls`, repris tels quels par le service pour
 * le panneau de dés), puis le détail structuré.
 */
export interface Roll {
  id: string;
  campaignId: string | null;
  // ─── Champs de l'ancienne app ───
  /** Auteur (compte identity). */
  uid: string | null;
  /** Nom affiché au moment du jet : personnage, « MJ » ou nom du profil. */
  userName: string;
  userAvatar: string | null;
  /** Personnage du jet. */
  persoId: string | null;
  isPrivate: boolean;
  /** Jet caché au MJ (`visibility: gm`). */
  isBlind: boolean;
  diceCount: number;
  diceFaces: number;
  modifier: number;
  results: number[];
  total: number | null;
  notation: string | null;
  /** Détail lisible (`1d20 + 5 = [17] + 5 = 22`). */
  output: string;
  /** Résultats d'un jet à symboles (`2 Succès + 1 Avantage`). */
  symbolResult: string | null;
  type: string;
  /** Date du jet en millisecondes. */
  timestamp: number;
  // ─── Détail du service ───
  source: RollSource;
  visibility: RollVisibility;
  /**
   * Résultat masqué pour l'appelant (jet caché vu par son auteur) : dés,
   * symboles, total et détail sont vides.
   */
  hidden: boolean;
  label: string | null;
  actionId: string | null;
  systemId: string | null;
  dice: RollDiceGroup[];
  symbols: RollSymbols | null;
  outcome: RollOutcome | null;
  /** Déroulé lisible d'un jet d'action (transmis par character). */
  explanations: string[];
  createdAt: string;
}

/** `notation` OU `pool`, jamais les deux. */
export interface RollRequest {
  /**
   * Formule de dés (`2d6 + 3`, `1d20 + FOR`, `mod(@DEX)`) ou dés à symboles en
   * `N<dé>` (`2aptitude + 1difficulte`) ; 500 caractères au plus. Les noms nus
   * (`FOR`) valent le modificateur de l'attribut du personnage, sinon sa valeur.
   */
  notation?: string;
  /** Dés à symboles du système `systemId`. */
  pool?: { de: string; nombre: number }[];
  systemId?: string;
  /** Sans campagne, le jet est personnel (visible par son auteur seul). */
  campaignId?: string;
  /** Personnage dont les attributs remplacent `@FOR`, `mod(@DEX)`… */
  characterId?: string;
  visibility?: RollVisibility;
  /** Ancienne forme de la visibilité : privé (auteur et MJ), caché au MJ (l'emporte). */
  isPrivate?: boolean;
  isBlind?: boolean;
  label?: string;
}

export interface RollPageQuery {
  campaignId?: string | null;
  /** Page précédente : jets plus anciens que ce jet. */
  before?: string;
  /** Polling : jets arrivés après ce jet. */
  after?: string;
  limit?: number;
}

export interface RollStatsQuery {
  campaignId?: string | null;
  userId?: string | null;
  /** Type de dé (`1d20`, `2d6`), comme le filtre des statistiques de l'ancienne app. */
  diceType?: string | null;
  faces?: number | null;
}

export interface PlayerRollStats {
  userId: string | null;
  userName: string;
  userAvatar: string | null;
  totalRolls: number;
  averageRoll: number;
  highestRoll: number | null;
  lowestRoll: number | null;
  totalSum: number;
  criticalSuccesses: number;
  criticalFailures: number;
  rollDistribution: Record<string, number>;
}

/** Statistiques calculées sur tout l'historique visible (mêmes chiffres que dice-stats). */
export interface RollStats {
  rollCount: number;
  diceTypes: string[];
  players: PlayerRollStats[];
  globalDistribution: { value: number; count: number }[];
  timeline: { roll: number; total: number; notation: string }[];
  streak: { direction: 'high' | 'low' | null; length: number };
}

export interface DicePreferences {
  skinId: string;
  animation3d: boolean;
  sound: boolean;
  /** Skins débloqués (boutique, défis) ; les skins gratuits s'y ajoutent toujours. */
  inventory: string[];
}

export type DicePreferencesUpdate = Partial<
  Pick<DicePreferences, 'skinId' | 'animation3d' | 'sound'>
>;

// ─── Jets ────────────────────────────────────────────────────────────────────

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * POST /v1/dice/rolls : le serveur tire le jet. La clé d'idempotence rend la
 * requête rejouable sans relance (réseau coupé, double clic).
 */
export function createRoll(body: RollRequest, idempotencyKey = newIdempotencyKey()) {
  return api<Roll>('/v1/dice/rolls', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(body),
  });
}

/** GET /v1/dice/rolls : jets du plus récent au plus ancien (comme l'ancienne app). */
export function listRolls(query: RollPageQuery = {}) {
  const params = new URLSearchParams();
  if (query.campaignId) params.set('campaignId', query.campaignId);
  if (query.before) params.set('before', query.before);
  if (query.after) params.set('after', query.after);
  if (query.limit) params.set('limit', String(query.limit));
  const qs = params.toString();
  return api<Roll[]>(`/v1/dice/rolls${qs ? `?${qs}` : ''}`);
}

export function getRoll(id: string) {
  return api<Roll>(`/v1/dice/rolls/${encodeURIComponent(id)}`);
}

/** Auteur du jet ou MJ de la campagne. */
export function deleteRoll(id: string) {
  return api<void>(`/v1/dice/rolls/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

// ─── Statistiques ────────────────────────────────────────────────────────────

export function getRollStats(query: RollStatsQuery = {}) {
  const params = new URLSearchParams();
  if (query.campaignId) params.set('campaignId', query.campaignId);
  if (query.userId) params.set('userId', query.userId);
  if (query.diceType) params.set('diceType', query.diceType);
  if (query.faces) params.set('faces', String(query.faces));
  const qs = params.toString();
  return api<RollStats>(`/v1/dice/stats${qs ? `?${qs}` : ''}`);
}

// ─── Préférences ─────────────────────────────────────────────────────────────

export function getDicePreferences() {
  return api<DicePreferences>('/v1/dice/me/preferences');
}

/** Le skin choisi doit être dans l'inventaire (ou gratuit). */
export function updateDicePreferences(body: DicePreferencesUpdate) {
  return api<DicePreferences>('/v1/dice/me/preferences', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

// ─── Rafraîchissement de l'historique ───────────────────────────────────────

const ROLLS_CHANGED = 'vtt-dice-rolls-changed';

/**
 * Signale qu'un jet vient d'être enregistré ailleurs (action d'un personnage,
 * transmise par character) : les historiques ouverts se relisent aussitôt,
 * sans attendre le prochain passage du polling.
 */
export function notifyRollsChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ROLLS_CHANGED));
}

export function onRollsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(ROLLS_CHANGED, listener);
  return () => window.removeEventListener(ROLLS_CHANGED, listener);
}

// ─── Lecture ─────────────────────────────────────────────────────────────────

/** Le résultat du jet est masqué pour l'appelant (jet caché, vu par un non-MJ). */
export function isMasked(roll: Roll): boolean {
  return roll.hidden;
}

/** Valeurs brutes des dés gardés d'une taille (statistiques locales). */
export function keptValues(roll: Roll, faces?: number): number[] {
  return roll.dice
    .filter((g) => faces === undefined || g.faces === faces)
    .flatMap((g) => g.values.filter((v) => v.kept).map((v) => v.value));
}

export const sameId = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
