/**
 * Plateau de dés de `/roll` sans argument : un message éphémère à boutons, un bouton par dé du
 * système de la salle active. Sans état côté serveur : la sélection voyage dans le custom_id
 * de chaque bouton (100 caractères au plus), avec le système pour lequel elle a été faite.
 *
 *   tray:<action>:<systemId>:<quantités séparées par des points>:<modificateur>
 *   actions : a<i> (un dé de plus), m+ / m- (modificateur), clear, roll
 */
import {
  MAX_MODIFIER,
  MAX_PER_DIE,
  describe,
  isEmpty,
  type DiceSet,
  type Selection,
} from './dice-set.js';
import {
  ButtonStyle,
  EPHEMERAL,
  type ActionRow,
  type Button,
  type Message,
} from './discord/types.js';

export const TRAY_PREFIX = 'tray';

export type TrayAction =
  | { kind: 'add'; index: number }
  | { kind: 'modifier'; delta: 1 | -1 }
  | { kind: 'clear' }
  | { kind: 'roll' };

export interface TrayState {
  action: TrayAction;
  systemId: string;
  selection: Selection;
}

function encodeAction(a: TrayAction): string {
  switch (a.kind) {
    case 'add':
      return `a${a.index}`;
    case 'modifier':
      return a.delta > 0 ? 'm+' : 'm-';
    default:
      return a.kind;
  }
}

function decodeAction(raw: string): TrayAction | null {
  if (raw === 'clear' || raw === 'roll') return { kind: raw };
  if (raw === 'm+' || raw === 'm-') return { kind: 'modifier', delta: raw === 'm+' ? 1 : -1 };
  const add = /^a(\d{1,2})$/.exec(raw);
  return add ? { kind: 'add', index: Number(add[1]) } : null;
}

export function encodeTray(action: TrayAction, systemId: string, s: Selection): string {
  return [TRAY_PREFIX, encodeAction(action), systemId, s.counts.join('.'), s.modifier].join(':');
}

export function decodeTray(customId: string): TrayState | null {
  const parts = customId.split(':');
  if (parts.length !== 5 || parts[0] !== TRAY_PREFIX) return null;
  const [, rawAction, systemId, rawCounts, rawModifier] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  const action = decodeAction(rawAction);
  if (!action || !/^[a-z0-9-]{1,40}$/.test(systemId)) return null;
  const counts = rawCounts === '' ? [] : rawCounts.split('.').map(Number);
  const modifier = Number(rawModifier);
  if (
    counts.some((c) => !Number.isInteger(c) || c < 0 || c > MAX_PER_DIE) ||
    !Number.isInteger(modifier) ||
    Math.abs(modifier) > MAX_MODIFIER
  )
    return null;
  return { action, systemId, selection: { counts, modifier } };
}

/** Sélection après le clic (le lancer, lui, ne la change pas). */
export function apply(set: DiceSet, state: TrayState): Selection {
  const counts = set.dice.map((_, i) => state.selection.counts[i] ?? 0);
  const { action } = state;
  if (action.kind === 'clear') return { counts: counts.map(() => 0), modifier: 0 };
  if (action.kind === 'add' && action.index < counts.length)
    counts[action.index] = Math.min(MAX_PER_DIE, counts[action.index]! + 1);
  let modifier = state.selection.modifier;
  if (action.kind === 'modifier')
    modifier = Math.max(-MAX_MODIFIER, Math.min(MAX_MODIFIER, modifier + action.delta));
  return { counts, modifier };
}

const empty = (set: DiceSet): Selection => ({ counts: set.dice.map(() => 0), modifier: 0 });

/** Message du plateau pour cette sélection (éphémère). */
export function trayMessage(
  set: DiceSet,
  campaignName: string,
  s: Selection = empty(set),
): Message {
  const button = (label: string, action: TrayAction, style: number, disabled = false): Button => ({
    type: 2,
    style,
    label,
    custom_id: encodeTray(action, set.systemId, s),
    disabled,
  });

  const diceButtons = set.dice.map((d, i) => {
    const n = s.counts[i] ?? 0;
    return button(
      n ? `${d.label} ×${n}` : d.label,
      { kind: 'add', index: i },
      n ? ButtonStyle.Primary : ButtonStyle.Secondary,
    );
  });
  const rows: ActionRow[] = [];
  for (let i = 0; i < diceButtons.length && rows.length < 4; i += 5)
    rows.push({ type: 1, components: diceButtons.slice(i, i + 5) });

  const controls: Button[] = [];
  if (set.kind === 'numeric') {
    controls.push(button('−1', { kind: 'modifier', delta: -1 }, ButtonStyle.Secondary));
    controls.push(button('+1', { kind: 'modifier', delta: 1 }, ButtonStyle.Secondary));
  }
  controls.push(button('Vider', { kind: 'clear' }, ButtonStyle.Danger, isEmpty(s) && !s.modifier));
  controls.push(button('Lancer', { kind: 'roll' }, ButtonStyle.Success, isEmpty(s)));
  rows.push({ type: 1, components: controls });

  return {
    content: `**${campaignName}** · ${describe(set, s) || '—'}`,
    components: rows,
    flags: EPHEMERAL,
  };
}
