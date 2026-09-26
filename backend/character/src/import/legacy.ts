/**
 * Documents de l'ancienne app (Firestore), tels que les exporte
 * tools/firebase-export : une ligne NDJSON par document,
 * `{"path": "cartes/abc/characters/xyz", "id": "xyz", "data": {...}}`, les
 * types Firestore étant balisés (`{"$timestamp": "…"}`, `{"$ref": "…"}`).
 *
 * Les formes ci-dessous sont déduites du code legacy (legacy/src) :
 *  - personnage : `Character` de contexts/CharacterContext.tsx, écrit par
 *    app/creation/page.tsx (`characterData`), puis modifié par la fiche,
 *    SkillsSheet.tsx, TalentsSheet.tsx et les scripts du bundle Star Wars ;
 *  - inventaire : `InventoryItem` de components/(inventaire)/inventaire.tsx ;
 *  - bonus : `BonusData` de contexts/CharacterContext.tsx ;
 *  - capacités personnalisées : `CustomCompetence` (competences/CompetenceCreator.tsx) ;
 *  - spécialisations : `SpecializationDoc` du contenu `gameSystems/{id}/content`.
 *
 * Tout est facultatif et souvent mal typé (nombres enregistrés en chaîne) :
 * les lectures passent par `nombre()` et `texte()`.
 */

/** Une ligne de l'export NDJSON. */
export interface DocFirestore<T = Record<string, unknown>> {
  path: string;
  id: string;
  data: T;
}

/** Valeur balisée par tools/firebase-export/src/normaliser.ts. */
export type ValeurBalisee =
  | { $timestamp: string }
  | { $ref: string }
  | { $geo: [number, number] }
  | { $bytes: string }
  | { $number: string };

/**
 * Personnage : `cartes/{roomId}/characters/{id}` (fait foi) ou sa copie
 * `users/{uid}/characters/{id}` écrite à la création.
 */
export interface PersonnageLegacy {
  Nomperso?: string;
  /** 'joueurs' pour un personnage joueur ; autre valeur (ou absent) pour un PNJ. */
  type?: string;
  imageURL?: string;
  niveau?: number | string;
  /** D&D : id de race.json (`ame_forgee`) ; Star Wars : id d'espèce du système (`bothan`). */
  Race?: string;
  /** D&D : id de profile.json (`barbare`) ; Star Wars : id de carrière (`bounty_hunter`). */
  Profile?: string;
  /** Notation du dé de vie (`d12`), recopiée du profil à la création. */
  deVie?: string;
  Taille?: number | string;
  Poids?: number | string;
  Description?: string;
  Background?: string;

  // ─── Caractéristiques et valeurs (clés du système de la salle) ───
  // D&D / Nooblies : FOR, DEX, CON, SAG, INT, CHA, PV, PV_Max, Defense,
  // Contact, Distance, Magie, INIT (dérivées figées à la création).
  // Star Wars : vigueur, agilite, intellect, ruse, volonte, presence (espèce
  // comprise), PV (= Blessures, compteur), PV_Max (= seuil de blessure),
  // Stress, Stress_Max, SeuilBlessure, SeuilStress, BlessuresCritiques.
  PV?: number | string;
  PV_Max?: number | string;
  Stress?: number | string;
  Stress_Max?: number | string;
  /** Nombre de blessures critiques subies (sans leur type). */
  BlessuresCritiques?: number | string;

  // ─── Voies D&D : Voie1..Voie10 = fichier de legacy/public/tabs, v1..v10 = rang ───
  // `custom:<nom>` pour une voie personnalisée, `voie_vide.json` pour une voie importée.
  [cle: `Voie${number}`]: string | undefined;
  [cle: `v${number}`]: number | string | undefined;

  // ─── Systèmes à compétences (Star Wars) ───
  career?: string;
  careerSkillChoices?: string[];
  /** Ids de documents `specialization` du contenu du système (id Firestore aléatoire). */
  specializations?: string[];
  specializationSkillChoices?: Record<string, string[]>;
  skillRanks?: Record<string, number>;
  /** {idSpécialisation: {idNœud: rang}}, idNœud de legacy/talents-arbres.json. */
  unlockedTalents?: Record<string, Record<string, number>>;
  /** XP restante. */
  xp?: number | string;
  /** XP dépensée depuis la création (caractéristiques, rangs, spécialisations, talents). */
  xpSpent?: number | string;
  /** Script du bundle creation-obligation.tsx : chaque point a rapporté 1 XP de création. */
  Obligations?: { value?: number | string; text?: string }[];

  [cle: string]: unknown;
}

/** Objet d'inventaire : `Inventaire/{roomId}/{Nomperso}/{id}`. */
export interface ObjetInventaireLegacy {
  message?: string;
  category?: string;
  quantity?: number | string;
  visibility?: string;
  weight?: number;
  diceSelection?: string | null;
  bonusTypes?: unknown;
  folderId?: string | null;
  isFolder?: boolean;
  /** Armes à symboles (Star Wars). */
  damage?: string;
  critical?: number;
  hardPoints?: number;
  /** Armes D&D. */
  damageStatKeys?: string[];
  [cle: string]: unknown;
}

/**
 * Bonus saisi à la main : `Bonus/{roomId}/{Nomperso}/{id}`, l'id étant celui
 * de l'objet d'inventaire ou `{fichierVoie}-{rang}` pour une capacité.
 * Les autres clés numériques sont des bonus par stat (FOR, Defense…).
 */
export interface BonusLegacy {
  active?: boolean;
  /** 'Inventaire' ou 'Competence'. */
  category?: string;
  name?: string;
  diceSelection?: string;
  [cle: string]: unknown;
}

/** Capacité personnalisée : `cartes/{roomId}/characters/{id}/customCompetences/{voie}-{slot}`. */
export interface CompetencePersonnaliseeLegacy {
  slotIndex?: number;
  voieIndex?: number;
  sourceVoie?: string;
  sourceRank?: number;
  competenceName?: string;
  competenceDescription?: string;
  competenceType?: string;
}

/** Spécialisation du contenu : `gameSystems/{id}/content/{docId}` avec `kind: 'specialization'`. */
export interface SpecialisationLegacy {
  kind?: 'specialization';
  /** Nom VO du bundle (`Assassin`, `Mercenary Soldier`…). */
  name?: string;
  careerIds?: string[];
  talents?: { id: string; x: number; y: number; title?: string }[];
}

// ─── Lectures tolérantes ─────────────────────────────────────────────────────

/** Nombre fini, y compris écrit en chaîne ("12") ; `undefined` sinon. */
export function nombre(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v.replace(',', '.'));
    return Number.isFinite(n) ? n : undefined;
  }
  if (v && typeof v === 'object' && '$number' in v) {
    const n = Number((v as { $number: unknown }).$number);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Entier (tronqué vers zéro), ou `undefined`. */
export function entier(v: unknown): number | undefined {
  const n = nombre(v);
  return n === undefined ? undefined : Math.trunc(n);
}

/** Chaîne non vide (espaces retirés), ou `undefined`. */
export function texte(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

/** Date ISO d'un `{"$timestamp"}`, d'une chaîne ISO ou de millisecondes. */
export function dateIso(v: unknown): string | undefined {
  let brut: unknown = v;
  if (brut && typeof brut === 'object' && '$timestamp' in brut) {
    brut = (brut as { $timestamp: unknown }).$timestamp;
  }
  if (typeof brut === 'string') {
    const d = new Date(brut.replace(/(\.\d{3})\d+/, '$1'));
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }
  if (typeof brut === 'number' && Number.isFinite(brut) && brut > 0) {
    return new Date(brut).toISOString();
  }
  return undefined;
}

/** Salle ou propriétaire d'un personnage, lus dans le chemin de son document. */
export function originePersonnage(path: string): { roomId?: string; ownerUid?: string } {
  const salle = /^cartes\/([^/]+)\/characters\/[^/]+$/.exec(path);
  if (salle) return { roomId: salle[1]! };
  const compte = /^users\/([^/]+)\/characters\/[^/]+$/.exec(path);
  if (compte) return { ownerUid: compte[1]! };
  return {};
}

/**
 * Identifiant comparable : minuscules, sans accents, mots séparés par « - »
 * (`Épée à une main` → `epee-a-une-main`, `elfe_noir` → `elfe-noir`).
 */
export function slug(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
