/**
 * Jets de dés : appels au service character (actions d'un personnage), chargement
 * d'un système pour le lanceur libre, et jets libres calculés localement.
 *
 * Aucune clé de jeu ici : les dés, symboles et actions viennent du système
 * chargé par `@vtt/rules`, leur apparence de sa présentation.
 */
import {
  aleatoireCrypto,
  charger,
  compiler,
  evaluer,
  lancerSymboles,
  verifierPresentation,
  type EnvironnementTypes,
  type EtatEntite,
  type FicheJson,
  type JetDes,
  type LancerSymboles,
  type Pool,
  type Presentation,
  type ResultatAction,
  type SystemeCharge,
  type SystemeSaisi,
  type Valeur,
} from '@vtt/rules';
import { api } from './api';

// ─── Systèmes (routes publiques) ────────────────────────────────────────────
// Chargeur local au lanceur de dés : `src/lib/systemes.ts` pourra le remplacer.

/** GET /v1/systems */
export interface SystemSummary {
  id: string;
  version: string;
  nom: string;
  description?: string;
}

/** Système prêt à l'emploi : règles chargées et présentation vérifiée. */
export interface PlayableSystem {
  system: SystemeCharge;
  presentation: Presentation | null;
  /** Erreurs de la présentation, ignorée si elle est invalide. */
  presentationErrors: string[];
}

export function listRollSystems(): Promise<SystemSummary[]> {
  return api<SystemSummary[]>('/v1/systems');
}

/** GET /v1/systems/:id, puis chargement et vérification complète avec `@vtt/rules`. */
export async function loadRollSystem(id: string): Promise<PlayableSystem> {
  const raw = await api<{ systeme: SystemeSaisi; presentation: unknown }>(
    `/v1/systems/${encodeURIComponent(id)}`,
  );
  const r = charger(raw.systeme);
  if (!r.ok) {
    const detail = r.erreurs
      .slice(0, 3)
      .map((e) => `${e.chemin} : ${e.message}`)
      .join(' ; ');
    throw new Error(`Système invalide (${detail})`);
  }
  if (raw.presentation == null)
    return { system: r.systeme, presentation: null, presentationErrors: [] };
  const p = verifierPresentation(raw.presentation, r.systeme);
  return p.ok
    ? { system: r.systeme, presentation: p.presentation, presentationErrors: [] }
    : {
        system: r.systeme,
        presentation: null,
        presentationErrors: p.erreurs.map((e) => `${e.chemin} : ${e.message}`),
      };
}

// ─── Actions d'un personnage (docs/api-character.md) ─────────────────────────

/** Personnage renvoyé par le service character (forme du contrat). */
export interface RollCharacter {
  id: string;
  ownerId: string;
  nom: string;
  avatarUrl: string | null;
  etat: EtatEntite;
  fiche: FicheJson;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActionRequest {
  /** Valeurs des paramètres de l'action, par identifiant (les absents prennent leur défaut). */
  parametres?: Record<string, Valeur>;
  /** Personnage visé, si l'action déclare une cible. */
  cibleId?: string;
  /**
   * Vrai : le serveur tire le jet ET applique ses modifications (acteur et
   * cible) dans la même transaction. Faux : le résultat est seulement renvoyé.
   * Chaque appel relance les dés : on ne peut pas appliquer après coup un
   * résultat déjà affiché.
   */
  appliquer?: boolean;
  /**
   * Campagne où le jet apparaît : character le transmet au service des dés
   * pour l'historique de la salle (jet personnel sans campagne).
   */
  campaignId?: string;
  /** Visibilité du jet dans l'historique (`public` par défaut). */
  visibility?: 'public' | 'private' | 'gm' | 'self';
}

export interface ActionResponse {
  resultat: ResultatAction;
  /** Acteur à jour, quand les modifications ont été appliquées. */
  personnage?: RollCharacter;
  /** Cible à jour, quand les modifications ont été appliquées. */
  cible?: RollCharacter;
}

/** POST /v1/characters/:id/actions/:action : jet tiré par le serveur (générateur cryptographique). */
export function runCharacterAction(
  characterId: string,
  action: string,
  request: ActionRequest = {},
): Promise<ActionResponse> {
  return api<ActionResponse>(
    `/v1/characters/${encodeURIComponent(characterId)}/actions/${encodeURIComponent(action)}`,
    { method: 'POST', body: JSON.stringify(request) },
  );
}

// ─── Jets libres (hors personnage), calculés localement ─────────────────────

/** Lance un pool de dés à symboles du système, avec un générateur cryptographique. */
export function rollFreePool(system: SystemeCharge, pool: Pool): LancerSymboles {
  return lancerSymboles(
    system,
    pool.filter((p) => p.nombre > 0),
    aleatoireCrypto(),
  );
}

/** Jet libre : dés, nombres et calcul ; aucun attribut, variable ni entrée de catalogue. */
const FREE_ENV: EnvironnementTypes = {
  attribut: () => undefined,
  variable: () => undefined,
  entree: () => false,
  des: true,
};

export type ParsedNotation =
  { ok: true; text: string } | { ok: false; message: string; position: number };

/**
 * Vérifie une notation de dés libre (`2d6 + 3`, `4d6k3`, `1d20!`) : dés, nombres
 * et fonctions de calcul uniquement, sans attribut ni variable.
 */
export function parseNotation(text: string): ParsedNotation {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, message: 'Saisissez une formule', position: 0 };
  const r = compiler(trimmed, FREE_ENV, 'nombre');
  if (!r.ok) {
    const e = r.erreurs[0]!;
    return { ok: false, message: e.message, position: e.position };
  }
  return { ok: true, text: trimmed };
}

export interface NotationRoll {
  text: string;
  value: number;
  rolls: JetDes[];
}

/** Lance une notation vérifiée par `analyserNotation`. Lève une erreur lisible sinon. */
export function rollNotation(text: string): NotationRoll {
  const trimmed = text.trim();
  const r = compiler(trimmed, FREE_ENV, 'nombre');
  if (!r.ok) throw new Error(r.erreurs[0]!.message);
  const reject = (what: string) => (): never => {
    throw new Error(`${what} indisponible dans un jet libre`);
  };
  const res = evaluer(r.formule.noeud, {
    attribut: reject('Attribut'),
    modificateur: reject('Modificateur'),
    variable: reject('Variable'),
    aleatoire: aleatoireCrypto(),
  });
  return { text: trimmed, value: Number(res.valeur), rolls: res.jets };
}
