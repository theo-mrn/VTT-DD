/**
 * Hors combat (docs/combat.md § 4.2, § 12.3) : le panneau montre déjà l'ordre, rempli par les
 * personnages de la scène (présélection de `startCandidates`). Le MJ écarte (case), cache
 * (œil) ou marque « Surpris » chacun, puis « Lancer l'initiative » démarre le combat avec eux
 * et tire l'initiative en un clic, ou « Démarrer sans initiative ». Calculs purs : les choix
 * du MJ par-dessus la présélection, le résumé, le corps de `POST …/combat`.
 */
import type {
  ActionParams,
  CampaignSide,
  CombatMode,
  CombatSettings,
  CombatState,
  SideParams,
  StartCombat,
} from '@vtt/contracts';
import { DEFAULT_COMBAT_SETTINGS } from '@vtt/contracts';
import { SIDES, type StartCandidate } from './model';

/** Choix du MJ pour un personnage, par-dessus la présélection. */
export interface SetupChoice {
  checked: boolean;
  hidden: boolean;
  surprised: boolean;
}

export type SetupChoices = Readonly<Record<string, Partial<SetupChoice>>>;

export interface SetupRow extends StartCandidate {
  surprised: boolean;
}

/** Lignes de l'ordre hors combat : la présélection, corrigée par les choix du MJ. */
export function setupRows(
  candidates: readonly StartCandidate[],
  choices: SetupChoices,
): SetupRow[] {
  return candidates.map((c) => {
    const pick = choices[c.characterId] ?? {};
    const checked = pick.checked ?? c.checked;
    return {
      ...c,
      checked,
      // Un héros n'est jamais caché aux joueurs (seuls PNJ et alliés le sont, embuscade)
      hidden: c.side !== 'players' && (pick.hidden ?? c.hidden),
      surprised: pick.surprised ?? false,
    };
  });
}

/** Choix mis à jour pour un personnage (sans perdre ceux déjà faits). */
export function withChoice(
  choices: SetupChoices,
  row: SetupRow,
  patch: Partial<SetupChoice>,
): Record<string, Partial<SetupChoice>> {
  return {
    ...choices,
    [row.characterId]: {
      checked: row.checked,
      hidden: row.hidden,
      surprised: row.surprised,
      ...patch,
    },
  };
}

/** Choix qui ne concernent plus aucun candidat (personnage parti de la scène) retirés. */
export function pruneChoices(
  choices: SetupChoices,
  candidates: readonly StartCandidate[],
): SetupChoices {
  const known = new Set(candidates.map((c) => c.characterId));
  const kept = Object.entries(choices).filter(([id]) => known.has(id));
  return kept.length === Object.keys(choices).length ? choices : Object.fromEntries(kept);
}

export interface SetupSummary {
  chosen: number;
  bySide: Record<CampaignSide, number>;
  hidden: number;
  surprised: number;
  /** Camps présents parmi les cochés, dans l'ordre des camps. */
  sides: CampaignSide[];
}

export function setupSummary(rows: readonly SetupRow[]): SetupSummary {
  const bySide: Record<CampaignSide, number> = { players: 0, enemies: 0, allies: 0 };
  let hidden = 0;
  let surprised = 0;
  for (const r of rows) {
    if (!r.checked) continue;
    bySide[r.side] += 1;
    if (r.hidden) hidden += 1;
    if (r.surprised) surprised += 1;
  }
  const chosen = bySide.players + bySide.enemies + bySide.allies;
  return { chosen, bySide, hidden, surprised, sides: SIDES.filter((s) => bySide[s] > 0) };
}

/** Réglages qui s'écartent du défaut (seuls envoyés). */
export function changedSettings(settings: CombatSettings): Partial<CombatSettings> | undefined {
  const out: Partial<CombatSettings> = {};
  for (const k of Object.keys(DEFAULT_COMBAT_SETTINGS) as (keyof CombatSettings)[])
    if (settings[k] !== DEFAULT_COMBAT_SETTINGS[k]) out[k] = settings[k];
  return Object.keys(out).length ? out : undefined;
}

/** Paramètres par camp prêts à envoyer (camps sans choix retirés) ; undefined si rien. */
export function sideParamsBody(
  value: Partial<Record<CampaignSide, ActionParams>>,
): SideParams | undefined {
  const out: Partial<Record<CampaignSide, ActionParams>> = {};
  for (const side of SIDES) {
    const v = value[side];
    if (v && Object.keys(v).length) out[side] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Corps de `POST …/combat` : les cochés, cachés et surpris ; l'initiative tout de suite (avec
 * les paramètres par camp) ou non ; le mode et les réglages seulement s'ils s'écartent du
 * défaut. Null : personne de coché.
 */
export function startCombatBody(
  rows: readonly SetupRow[],
  opts: {
    rollInitiative: boolean;
    mode?: CombatMode | null;
    settings?: CombatSettings;
    sideParams?: Partial<Record<CampaignSide, ActionParams>>;
  },
): StartCombat | null {
  const chosen = rows.filter((r) => r.checked);
  if (!chosen.length) return null;
  const hidden = chosen.filter((r) => r.hidden).map((r) => r.characterId);
  const surprised = chosen.filter((r) => r.surprised).map((r) => r.characterId);
  const settings = opts.settings ? changedSettings(opts.settings) : undefined;
  const paramsBySide =
    opts.rollInitiative && opts.sideParams ? sideParamsBody(opts.sideParams) : undefined;
  return {
    participants: chosen.map((r) => r.characterId),
    ...(opts.mode ? { mode: opts.mode } : {}),
    ...(hidden.length ? { hidden } : {}),
    ...(surprised.length ? { surprised } : {}),
    ...(settings ? { settings } : {}),
    ...(opts.rollInitiative ? { rollInitiative: true } : {}),
    ...(paramsBySide ? { paramsBySide } : {}),
  };
}

/**
 * Paramètres d'initiative par camp retenus au dernier jet (`initiative.params` des
 * participants) : le premier participant de chaque camp qui a choisi `paramIds` donne le choix
 * du camp. Sert de valeur de départ aux listes « Joueurs / Ennemis » de l'en-tête.
 */
export function sideParamsFromCombat(
  combat: Pick<CombatState, 'order'> | null | undefined,
  paramIds: readonly string[],
): Partial<Record<CampaignSide, ActionParams>> {
  const out: Partial<Record<CampaignSide, ActionParams>> = {};
  if (!combat || !paramIds.length) return out;
  for (const p of combat.order) {
    const params = p.initiative?.params;
    if (!params) continue;
    for (const id of paramIds) {
      const v = params[id];
      if (v === undefined) continue;
      const side = (out[p.side] ??= {});
      if (side[id] === undefined) side[id] = v;
    }
  }
  return out;
}
