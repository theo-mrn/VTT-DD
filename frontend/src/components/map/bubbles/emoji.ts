/**
 * Emoji des bulles : « Partie » (combat, magie, table, trésors) puis toutes les catégories
 * Unicode (emoji-unicode.ts). Natifs : aucune police ni bibliothèque.
 */
import { UNICODE_EMOJI } from './emoji-unicode';

export interface EmojiCategory {
  id: string;
  label: string;
  /** Emoji de l'onglet. */
  icon: string;
  emojis: readonly string[];
}

const ICONS: Record<string, string> = {
  people: '😀',
  nature: '🦋',
  foods: '🍺',
  activity: '🎲',
  places: '🏰',
  objects: '💰',
  symbols: '❤️',
  flags: '🏳️',
};

export const EMOJI_CATEGORIES: readonly EmojiCategory[] = [
  {
    id: 'game',
    label: 'Partie',
    icon: '⚔️',
    emojis:
      '⚔️ 🗡️ 🛡️ 🏹 🪓 🔪 🪃 🔨 ⛏️ 🪚 🔱 💣 🧨 🪤 ⛓️ 🩸 🩹 🩼 💥 💢 💫 💨 🎯 🏰 🏯 ⛺ 🗺️ 🧭 🏴 🏳️ 🚩 🎌 👑 🪖 ⛑️ 🐎 🏇 🤺 🥷 🧙 🧝 🧛 🧟 🧞 🧜 🔮 🪄 🧿 🪬 📿 🕯️ 🧪 ⚗️ 🧫 💎 🪙 🌟 ⭐ 🌠 ☄️ 🔥 ❄️ ⚡ 🌪️ 🌊 💧 🌈 ☀️ 🌙 🌑 🌕 ☁️ 🌫️ 🌋 🗻 🌲 🌳 🍄 🌿 🍀 🌸 🥀 🌹 🪨 🪵 🌀 ♨️ 🫧 🌌 🕳️ 🎲 🃏 🀄 🎴 🎭 🎻 🪕 🥁 🎶 🎵 💃 🕺 🎉 🎊 💰 💸 💵 💍 🏺 ⚱️ 🗝️ 🔑 🔒 🔓 🚪 🪜 🧰 🪝 📜 📖 📚 ✉️ 📦 🎒 👜 🧳 ⌛ ⏳ 🕰️ 🔭 🔦 🏮 🪔'.split(
        ' ',
      ),
  },
  ...UNICODE_EMOJI.map((c) => ({
    id: c.id,
    label: c.label,
    icon: ICONS[c.id] ?? c.emojis.split(' ')[0]!,
    emojis: c.emojis.split(' '),
  })),
];
