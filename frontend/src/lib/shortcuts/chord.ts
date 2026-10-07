/**
 * Touches des raccourcis (docs/raccourcis.md § 3) : lire une frappe, valider, afficher.
 *
 * - `Chord` : modificateurs puis touche, `Mod+Shift+KeyK`. `Mod` : ⌘ sur Mac, Ctrl ailleurs ;
 *   `Ctrl` n'existe que sur Mac (la touche Contrôle, distincte de ⌘).
 * - Touche : la lettre tapée pour une lettre (`KeyA` pour la touche marquée A, AZERTY comme
 *   QWERTY), la position pour un chiffre (`Digit1`, pavé numérique compris), le caractère pour
 *   un symbole (`Char:?`, sans ⇧ : il sert à le produire), sinon le code (`Space`, `Enter`…).
 * - `Binding` : 1 à 3 `Chord` séparés par une espace (`Space Enter`), une séquence.
 */
import { translate } from '@/i18n/runtime';

export const IS_MAC =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform ?? '');

const MODIFIERS = ['Mod', 'Ctrl', 'Alt', 'Shift'] as const;
const MODIFIER_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'AltGraph', 'CapsLock', 'Fn']);
const KEY = /^(Key[A-Z]|Digit\d|Char:.|F\d{1,2}|[A-Z][A-Za-z]+)$/;
export const MAX_SEQUENCE = 3;

export interface KeyLike {
  key: string;
  code: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Touche d'une frappe, sans modificateurs ; null pour un modificateur seul. */
function keyToken(e: KeyLike): { key: string; symbol: boolean } | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  // ⌥ change la lettre produite (⌥P donne « π » sur Mac) : on garde la position
  if (e.altKey && /^Key[A-Z]$/.test(e.code)) return { key: e.code, symbol: false };
  if (/^[a-z]$/i.test(e.key)) return { key: `Key${e.key.toUpperCase()}`, symbol: false };
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (digit) return { key: `Digit${digit[1]}`, symbol: false };
  if (e.key.length === 1 && e.key !== ' ' && !/\p{L}|\p{N}/u.test(e.key))
    return { key: `Char:${e.key}`, symbol: true };
  if (!e.code || e.code === 'Unidentified') return null;
  return { key: e.code, symbol: false };
}

/** Touche normalisée d'une frappe, ou null (modificateur seul, touche inconnue). */
export function chordFromEvent(e: KeyLike, mac = IS_MAC): string | null {
  const token = keyToken(e);
  if (!token) return null;
  const mods: string[] = [];
  if (mac ? e.metaKey : e.ctrlKey) mods.push('Mod');
  if (mac && e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey && !token.symbol) mods.push('Shift');
  return [...mods, token.key].join('+');
}

/** Touche valide : modificateurs connus, sans doublon, dans l'ordre, puis une touche. */
export function isChord(chord: string): boolean {
  const parts = splitChord(chord);
  const key = parts.at(-1)!;
  const mods = parts.slice(0, -1);
  if (!KEY.test(key) || (MODIFIERS as readonly string[]).includes(key)) return false;
  let last = -1;
  for (const m of mods) {
    const i = (MODIFIERS as readonly string[]).indexOf(m);
    if (i <= last) return false;
    last = i;
  }
  return true;
}

/** `Mod+Char:+` : le « + » d'un symbole n'est pas un séparateur. */
function splitChord(chord: string): string[] {
  const char = chord.indexOf('Char:');
  if (char < 0) return chord.split('+');
  const head = chord.slice(0, char);
  return [...(head ? head.slice(0, -1).split('+') : []), chord.slice(char)];
}

/** Les touches d'un raccourci, ou null s'il est mal formé. */
export function parseBinding(binding: string | null | undefined): string[] | null {
  if (!binding) return null;
  const chords = binding.trim().split(/\s+/);
  if (chords.length > MAX_SEQUENCE || !chords.every(isChord)) return null;
  return chords;
}

/** Deux raccourcis se gênent : identiques, ou l'un commence l'autre (séquence). */
export function bindingsClash(a: string, b: string): boolean {
  const x = parseBinding(a);
  const y = parseBinding(b);
  if (!x || !y) return false;
  const n = Math.min(x.length, y.length);
  return x.slice(0, n).every((c, i) => c === y[i]);
}

/** Touches écrites en symbole, les mêmes dans toutes les langues. */
const KEY_SYMBOLS: Record<string, string> = {
  Backspace: '⌫',
  Tab: 'Tab', // i18n-ignore
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  PageUp: 'Pg↑',
  PageDown: 'Pg↓',
};

/** Touches nommées dans la langue de la page (`shortcuts.keys`). */
const KEY_NAMES = {
  Space: 'space',
  Enter: 'enter',
  Escape: 'escape',
  Delete: 'delete',
  Home: 'home',
  End: 'end',
} as const;

function keyLabel(key: string): string {
  if (key.startsWith('Char:')) return key.slice(5);
  if (/^Key[A-Z]$/.test(key)) return key.slice(3);
  if (/^Digit\d$/.test(key)) return key.slice(5);
  if (key in KEY_NAMES)
    return translate(`shortcuts.keys.${KEY_NAMES[key as keyof typeof KEY_NAMES]}`);
  return KEY_SYMBOLS[key] ?? key;
}

/** `Mod+Shift+KeyK` → `⌘⇧K` (Mac) ou `Ctrl+Maj+K`. */
export function chordLabel(chord: string, mac = IS_MAC): string {
  const parts = splitChord(chord);
  const key = keyLabel(parts.at(-1)!);
  const mods = parts.slice(0, -1);
  if (mac) {
    const sym: Record<string, string> = { Mod: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧' };
    return mods.map((m) => sym[m]).join('') + key;
  }
  const word: Record<string, string> = { Mod: 'Ctrl', Ctrl: 'Ctrl', Alt: 'Alt', Shift: '⇧' };
  const shiftOnly = mods.length === 1 && mods[0] === 'Shift';
  if (shiftOnly) return `⇧${key}`;
  return [...mods.map((m) => word[m]), key].join('+');
}

/** Raccourci affiché (`Espace Entrée`), ou null s'il n'y en a pas. */
export function bindingLabel(binding: string | null | undefined, mac = IS_MAC): string | null {
  const chords = parseBinding(binding);
  return chords ? chords.map((c) => chordLabel(c, mac)).join(' ') : null;
}

/** Valeur de `aria-keyshortcuts` (`Shift+N`, `Meta+K`), ou undefined. */
export function bindingAria(binding: string | null | undefined, mac = IS_MAC): string | undefined {
  const chords = parseBinding(binding);
  if (!chords) return undefined;
  const aria = (chord: string) =>
    splitChord(chord)
      .map((p) => {
        if (p === 'Mod') return mac ? 'Meta' : 'Control';
        if (p === 'Ctrl') return 'Control';
        if (p.startsWith('Char:')) return p.slice(5);
        if (/^Key[A-Z]$/.test(p)) return p.slice(3);
        if (/^Digit\d$/.test(p)) return p.slice(5);
        return p;
      })
      .join('+');
  return chords.map(aria).join(' ');
}
