import { useMemo } from 'react';
import { useGameSystem } from '@/modules/game-system/useGameSystem';
import { getFormulaDependencies } from '@/lib/rules-engine';
import type { SkillDefinition, StatDefinition } from '@/modules/game-system/types';

// ─────────────────────────────────────────────────────────────────────────────
// Dérive les champs de statistiques à afficher/éditer pour un template PNJ (bibliothèque de PNJ,
// formulaire de création, tiroir de la carte, menu contextuel de la carte) depuis le système de règles
// actif. RÈGLE STRICTE : aucun composant consommateur ne doit JAMAIS nommer une clé de stat précise en
// dur dans son JSX (ni "INIT", ni "Defense", ni "FOR"...) — un système custom (ex Star Wars) n'a pas
// les mêmes clés que dnd-classic, et une clé nommée en dur soit invente un champ qui n'existe pas
// (ex "INIT" affiché avec valeur 0 pour un système qui n'a pas cette stat), soit force une valeur par
// défaut trompeuse (ex "BlessuresCritiques: 10" alors que ça devrait être 0). Chaque composant doit
// boucler sur les listes ci-dessous, jamais écrire `character[defenseKey] ?? 10` avec `defenseKey` en
// paramètre — seulement `stats.map(stat => ...)`.
// ─────────────────────────────────────────────────────────────────────────────

export interface NpcStatFields {
  /** Caractéristiques de base (ability), ex FOR/DEX/CON/INT/SAG/CHA pour dnd-classic, vigueur/agilite/...
   *  pour un système custom — jamais une liste de clés fixes. */
  abilityStats: StatDefinition[];
  /** TOUTES les stats 'vital' dont la borne max référence une autre stat (ex PV+Stress pour un système
   *  EotE, PV seul pour dnd-classic) — à boucler pour tout affichage/copie de jauge vitale. */
  vitalStats: { stat: StatDefinition; maxKey: string | null }[];
  /** Stat vitale principale (PV-like) : la première de vitalStats, pour les affichages compacts qui ne
   *  montrent qu'une seule jauge (ex chip de la vue joueur). */
  primaryVitalStat: StatDefinition | null;
  /** Clé de la borne max de primaryVitalStat (ex PV_Max), si applicable. */
  primaryVitalMaxKey: string | null;
  /** Clé de défense (ex Defense) — null si le système n'a pas configuré combatDefenseKey. */
  defenseKey: string | null;
  /** Clés d'attaque de combat (ex Contact/Distance/Magie) — vide si non configuré. */
  combatAttackKeys: string[];
  /** TOUTES les autres stats numériques visibles à afficher en section "Combat" (ex Initiative) :
   *  category 'derived' (ou 'ability' visible, cas rare), visible aux joueurs, PAS déjà comptée comme
   *  borne max d'une stat vitale, PAS combatDefenseKey, PAS dans combatAttackKeys. Remplace toute
   *  référence codée en dur à "INIT" — un système sans cette notion n'en produit simplement aucune ici. */
  extraCombatStats: StatDefinition[];
  /** Compétences du système actif (gameSystem.skills), vide pour un système qui n'en définit pas (ex
   *  dnd-classic, qui passe par les Voies) — un PNJ les stocke dans `skillRanks[key]`, exactement comme
   *  un personnage joueur, pour que combat.tsx/MJcombat.tsx/dice-roller composent le même pool de dés
   *  (carac liée + rang) sans savoir si l'acteur est un PJ ou un PNJ. */
  skills: SkillDefinition[];
  /** Libellé de la section compétences (gameSystem.skillLabel), ex "Compétences". */
  skillLabel: string;
  /** Groupes distincts déclarés par les compétences (SkillDefinition.group), dans l'ordre d'apparition —
   *  vide si le système ne groupe pas ses compétences. */
  skillGroups: string[];
  /** Résout la valeur par défaut d'une stat (StatDefinition.defaultValue, ou 0/10 selon la catégorie). */
  getDefaultValue: (stat: StatDefinition) => number;
}

/** Rang maximum d'une compétence — même plafond que la fiche joueur (SkillsSheet). */
export const MAX_SKILL_RANK = 5;

/** Normalise un `skillRanks` avant écriture Firestore : ne garde que les clés déclarées par le système
 *  actif (un template importé d'un autre système ne traîne pas de rangs orphelins), borne à
 *  [1, MAX_SKILL_RANK] et retire les rangs nuls plutôt que d'écrire une entrée par compétence. */
export function pickKnownSkillRanks(
  raw: unknown,
  skills: SkillDefinition[],
): Record<string, number> {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const skill of skills) {
    const rank = Math.floor(Number(source[skill.key] ?? 0));
    if (Number.isFinite(rank) && rank > 0) out[skill.key] = Math.min(MAX_SKILL_RANK, rank);
  }
  return out;
}

export function useNpcStatFields(roomId: string | null): NpcStatFields {
  const { gameSystem } = useGameSystem(roomId);

  return useMemo(() => {
    const abilityStats = gameSystem.stats.filter((s) => s.category === 'ability' && s.visibleToPlayers !== false);

    const vitalMaxKeyByKey = new Map<string, string>();
    for (const stat of gameSystem.stats) {
      if (stat.category !== 'vital' || !stat.maxFormula) continue;
      const [maxKey] = getFormulaDependencies(stat.maxFormula);
      if (maxKey) vitalMaxKeyByKey.set(stat.key, maxKey);
    }
    const maxKeysToSkip = new Set(vitalMaxKeyByKey.values());
    const vitalStats = gameSystem.stats
      .filter((s) => s.category === 'vital' && s.visibleToPlayers !== false && vitalMaxKeyByKey.has(s.key) && !maxKeysToSkip.has(s.key))
      .map((stat) => ({ stat, maxKey: vitalMaxKeyByKey.get(stat.key) ?? null }));
    const primaryVitalStat = vitalStats[0]?.stat ?? null;
    const primaryVitalMaxKey = vitalStats[0]?.maxKey ?? null;

    const defenseKey = gameSystem.combatDefenseKey ?? null;
    const combatAttackKeys = gameSystem.combatAttackKeys ?? [];

    const vitalKeys = new Set(vitalStats.map((v) => v.stat.key));
    const excludedFromExtra = new Set<string>([
      ...maxKeysToSkip,
      ...vitalKeys,
      ...(defenseKey ? [defenseKey] : []),
      ...combatAttackKeys,
    ]);
    // Toute stat 'derived' restante, visible, numérique-affichable : ex Initiative pour dnd-classic,
    // rien pour un système qui n'a pas cette notion — jamais une clé "INIT" supposée exister.
    const extraCombatStats = gameSystem.stats.filter(
      (s) => s.category === 'derived' && s.visibleToPlayers !== false && !excludedFromExtra.has(s.key),
    );

    const skills = gameSystem.skills ?? [];
    const skillLabel = gameSystem.skillLabel || 'Compétences';
    const skillGroups = Array.from(new Set(skills.map((s) => s.group).filter((g): g is string => !!g)));

    const getDefaultValue = (stat: StatDefinition): number => {
      if (typeof stat.defaultValue === 'number') return stat.defaultValue;
      return stat.category === 'ability' ? 10 : 0;
    };

    return {
      abilityStats, vitalStats, primaryVitalStat, primaryVitalMaxKey,
      defenseKey, combatAttackKeys, extraCombatStats,
      skills, skillLabel, skillGroups, getDefaultValue,
    };
  }, [gameSystem]);
}
