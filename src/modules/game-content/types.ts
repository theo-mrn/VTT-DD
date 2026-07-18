// ─────────────────────────────────────────────────────────────────────────────
// Contenu de jeu stocké en Firestore, dans la sous-collection `content` du système résolu :
//   gameSystems/{systemId}/content/{contentId}                        (catalogue partagé)
//   Salle/{roomId}/gameSystemOverrides/{systemId}/content/{contentId} (systèmes legacy de salle)
// Remplace les JSON statiques de public/tabs/ (voies, bestiaire, équipement, descriptions d'objets),
// qui ne servent plus que de données de seed (scripts/seed-game-content.mjs) et de format d'échange.
// Chaque doc porte un champ `kind` discriminant, requêtable par where('kind','==',...).
// ─────────────────────────────────────────────────────────────────────────────

import type { TalentNode } from '@/lib/rules-engine/talent-tree';

export type ContentKind = 'path' | 'bestiary' | 'bestiaryIndex' | 'equipment' | 'itemDescriptions' | 'location' | 'specialization' | 'script' | 'style';

export type { TalentNode };

interface ContentDocBase {
  kind: ContentKind;
  name: string;
  order?: number;
}

/** Une voie de compétences (arbre de 5 rangs) — remplace les fichiers <Classe>N.json /
 *  <Race>.json / prestige_<classe>N.json. id du doc = slug legacy (ex 'barbare1'), cf legacy.ts. */
export interface PathDoc extends ContentDocBase {
  kind: 'path';
  /** Nom de fichier legacy exact (ex 'Barbare1.json') — les personnages existants stockent ce nom
   *  dans leurs champs VoieN ; résolu via resolvePathDocId() sans migration des personnages. */
  legacyFile?: string;
  category: 'class' | 'race' | 'prestige';
  /** Classe/race parente (ex 'Barbare') — regroupe les voies par origine dans l'UI. */
  parentName?: string;
  ranks: PathRank[];
}

export interface PathRank {
  title: string;
  description: string;
  type?: string;
}

/** Une créature du bestiaire — champs libres (stats variables selon le système), seuls Nom/Category
 *  sont structurants. Même forme que les entrées de bestiairy.json. */
export type CreatureEntry = Record<string, unknown> & { Nom: string; Category?: string };

/** Un chunk de bestiaire (groupé par catégorie) — un doc Firestore est limité à 1MB, le bestiaire
 *  D&D complet fait ~513KB : un chunk par catégorie tient largement, chunkIndex>0 ne sert que si
 *  une catégorie dépasse ~700KB sérialisés. id du doc = 'bestiary-{categorySlug}-{chunkIndex}'. */
export interface BestiaryChunkDoc extends ContentDocBase {
  kind: 'bestiary';
  category: string;
  chunkIndex: number;
  entries: Record<string, CreatureEntry>;
}

/** Index léger du bestiaire (~30KB pour 300+ créatures) — la recherche par nom ne coûte qu'UNE
 *  lecture ; le chunk complet n'est chargé qu'à l'ouverture d'une fiche. id = 'bestiary-index'. */
export interface BestiaryIndexDoc extends ContentDocBase {
  kind: 'bestiaryIndex';
  creatures: { name: string; category: string; chunkId: string }[];
}

/** Objet d'équipement — champs libres (nom/prix/dégâts/portée... selon la catégorie), seule
 *  la clé `nom` est structurante. Même forme que les entrées de data.json. */
export type EquipmentItem = Record<string, unknown> & { nom: string };

/** Une catégorie d'équipement (armes, armures, potions...) — remplace data.json.
 *  id du doc = 'equipment-{categorySlug}'. */
export interface EquipmentDoc extends ContentDocBase {
  kind: 'equipment';
  category: string;
  items: EquipmentItem[];
}

/** Descriptions d'objets nom→texte — remplace Items.json (affichage inventaire / ajout d'objet).
 *  id du doc = 'item-descriptions'. */
export interface ItemDescriptionsDoc extends ContentDocBase {
  kind: 'itemDescriptions';
  entries: Record<string, string>;
}

/** Un lieu (planète, ville, plan...) — nom/description/image toujours présents, `values` porte les
 *  champs additionnels définis par le MJ (GameSystemDefinition.locationFields), clé = LocationFieldDefinition.key.
 *  id du doc = 'location-{slug}'. */
export interface LocationDoc extends ContentDocBase {
  kind: 'location';
  description?: string;
  image?: string;
  values: Record<string, string>;
}

/** Une Spécialisation (ex système narratif type EotE) — domaine d'expertise donnant accès à un arbre de
 *  talents exclusif + 4 compétences ciblées. id du doc = slug libre (généré côté UI). */
export interface SpecializationDoc extends ContentDocBase {
  kind: 'specialization';
  description?: string;
  image?: string;
  /** IDs des ProfileDefinition (Carrières) donnant accès à cette spécialisation SANS le surcoût XP
   *  hors-carrière (cf specializationPurchaseCost). Vide = accessible à toutes les carrières au même coût. */
  careerIds: string[];
  /** Les 4 compétences de carrière ciblées par cette spécialisation (clés SkillDefinition.key). */
  grantedSkillKeys: string[];
  talents: TalentNode[];
}

/** Un fichier de script embarqué par un bundle de règles zip (scripts/**.tsx) — transpilé par
 *  sucrase à l'IMPORT (jamais à l'exécution), évalué au chargement de la salle par l'ExtensionHost
 *  (src/modules/bundle-scripts/). Confiance totale, même modèle que les modules externes chargés
 *  par URL : avertissement explicite à l'import, le MJ est l'auteur de confiance. */
export interface ScriptDoc extends ContentDocBase {
  kind: 'script';
  /** Chemin du fichier dans le bundle (ex 'scripts/main.tsx') — identifiant de module du require()
   *  relatif du linker. */
  path: string;
  /** Source original — conservé pour ré-export JSON et debug. */
  source: string;
  /** Code transpilé (CJS : transforms typescript+jsx+imports, JSX classic → React.createElement). */
  compiled: string;
}

/** Une feuille de style embarquée par un bundle de règles zip (styles/**.css) — injectée telle
 *  quelle dans <head> au chargement de la salle (GameSystemStyles.tsx), retirée à la sortie. Les
 *  chemins d'assets du bundle (url(assets/...)) sont réécrits en URLs R2 à l'import. Surcharger les
 *  variables du thème (--bg-card, --accent-brown...) se fait via `:root, :root[class] { ... }` —
 *  la variante [class] bat les classes de thème (.dark, .tavern...) de globals.css. */
export interface StyleDoc extends ContentDocBase {
  kind: 'style';
  /** Chemin du fichier dans le bundle (ex 'styles/theme.css'). */
  path: string;
  /** Contenu CSS, chemins d'assets déjà réécrits en URLs R2. */
  css: string;
}

export type ContentDoc = PathDoc | BestiaryChunkDoc | BestiaryIndexDoc | EquipmentDoc | ItemDescriptionsDoc | LocationDoc | SpecializationDoc | ScriptDoc | StyleDoc;
