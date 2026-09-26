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
export interface ResumeSysteme {
  id: string;
  version: string;
  nom: string;
  description?: string;
}

/** Système prêt à l'emploi : règles chargées et présentation vérifiée. */
export interface SystemeJouable {
  systeme: SystemeCharge;
  presentation: Presentation | null;
  /** Erreurs de la présentation, ignorée si elle est invalide. */
  erreursPresentation: string[];
}

export function listerSystemesJets(): Promise<ResumeSysteme[]> {
  return api<ResumeSysteme[]>('/v1/systems');
}

/** GET /v1/systems/:id, puis chargement et vérification complète avec `@vtt/rules`. */
export async function chargerSystemeJets(id: string): Promise<SystemeJouable> {
  const brut = await api<{ systeme: SystemeSaisi; presentation: unknown }>(
    `/v1/systems/${encodeURIComponent(id)}`,
  );
  const r = charger(brut.systeme);
  if (!r.ok) {
    const detail = r.erreurs
      .slice(0, 3)
      .map((e) => `${e.chemin} : ${e.message}`)
      .join(' ; ');
    throw new Error(`Système invalide (${detail})`);
  }
  if (brut.presentation == null)
    return { systeme: r.systeme, presentation: null, erreursPresentation: [] };
  const p = verifierPresentation(brut.presentation, r.systeme);
  return p.ok
    ? { systeme: r.systeme, presentation: p.presentation, erreursPresentation: [] }
    : {
        systeme: r.systeme,
        presentation: null,
        erreursPresentation: p.erreurs.map((e) => `${e.chemin} : ${e.message}`),
      };
}

// ─── Actions d'un personnage (docs/api-character.md) ─────────────────────────

/** Personnage renvoyé par le service character (forme du contrat). */
export interface PersonnageJet {
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

export interface DemandeActionApi {
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
}

export interface ReponseActionApi {
  resultat: ResultatAction;
  /** Acteur à jour, quand les modifications ont été appliquées. */
  personnage?: PersonnageJet;
  /** Cible à jour, quand les modifications ont été appliquées. */
  cible?: PersonnageJet;
}

/** POST /v1/characters/:id/actions/:action : jet tiré par le serveur (générateur cryptographique). */
export function executerActionPersonnage(
  personnageId: string,
  action: string,
  demande: DemandeActionApi = {},
): Promise<ReponseActionApi> {
  return api<ReponseActionApi>(
    `/v1/characters/${encodeURIComponent(personnageId)}/actions/${encodeURIComponent(action)}`,
    { method: 'POST', body: JSON.stringify(demande) },
  );
}

// ─── Jets libres (hors personnage), calculés localement ─────────────────────

/** Lance un pool de dés à symboles du système, avec un générateur cryptographique. */
export function lancerPoolLibre(systeme: SystemeCharge, pool: Pool): LancerSymboles {
  return lancerSymboles(
    systeme,
    pool.filter((p) => p.nombre > 0),
    aleatoireCrypto(),
  );
}

/** Jet libre : dés, nombres et calcul ; aucun attribut, variable ni entrée de catalogue. */
const ENV_LIBRE: EnvironnementTypes = {
  attribut: () => undefined,
  variable: () => undefined,
  entree: () => false,
  des: true,
};

export type NotationAnalysee =
  { ok: true; texte: string } | { ok: false; message: string; position: number };

/**
 * Vérifie une notation de dés libre (`2d6 + 3`, `4d6k3`, `1d20!`) : dés, nombres
 * et fonctions de calcul uniquement, sans attribut ni variable.
 */
export function analyserNotation(texte: string): NotationAnalysee {
  const propre = texte.trim();
  if (!propre) return { ok: false, message: 'Saisissez une formule', position: 0 };
  const r = compiler(propre, ENV_LIBRE, 'nombre');
  if (!r.ok) {
    const e = r.erreurs[0]!;
    return { ok: false, message: e.message, position: e.position };
  }
  return { ok: true, texte: propre };
}

export interface LancerNotation {
  texte: string;
  valeur: number;
  jets: JetDes[];
}

/** Lance une notation vérifiée par `analyserNotation`. Lève une erreur lisible sinon. */
export function lancerNotation(texte: string): LancerNotation {
  const propre = texte.trim();
  const r = compiler(propre, ENV_LIBRE, 'nombre');
  if (!r.ok) throw new Error(r.erreurs[0]!.message);
  const refus = (quoi: string) => (): never => {
    throw new Error(`${quoi} indisponible dans un jet libre`);
  };
  const res = evaluer(r.formule.noeud, {
    attribut: refus('Attribut'),
    modificateur: refus('Modificateur'),
    variable: refus('Variable'),
    aleatoire: aleatoireCrypto(),
  });
  return { texte: propre, valeur: Number(res.valeur), jets: res.jets };
}
