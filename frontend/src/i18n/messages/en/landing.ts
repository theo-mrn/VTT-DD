import type fr from '../fr/landing';
import type { Translation } from '../../types';

export default {
  nav: {
    label: 'Main navigation',
    home: 'Yner, home',
    features: 'Features',
    signIn: 'Sign in',
    start: 'Get started',
  },
  cta: {
    startFree: 'Start for free',
    openApp: 'Open Yner',
  },
  hero: {
    eyebrow: 'Online tabletop roleplaying',
    title: 'Your campaigns deserve <accent>a real table</accent>',
    lead: 'Living maps, fog of war, character sheets that do the math for you, and 3D dice. Everything you need to play, right in your browser.',
    discover: 'Discover',
    perks: {
      free: 'Free',
      noInstall: 'Nothing to install',
      systems: 'D&D, Star Wars and more',
    },
    imageAlt:
      'The Yner game table: flying over an animated goblin camp, the party and the goblins on the map.',
  },
  features: {
    title: 'Everything to play, nothing in the way',
    lead: 'The game master prepares, the players play. Yner takes care of the rest.',
    combat: {
      eyebrow: 'Combat',
      title: 'Fights that run themselves',
      text: 'Initiative is rolled, the order displayed, each turn highlighted. Attacks and damage apply straight to the character sheets, with no math by hand.',
      points: {
        first: 'Automatic initiative',
        second: 'Turn by turn or by side',
        third: 'Damage applied to the sheets',
      },
      imageAlt:
        'A fight in progress: the initiative order at the top of the map, Borin the dwarf’s turn highlighted.',
    },
    vision: {
      eyebrow: 'Vision',
      title: 'Your players only see what their character sees',
      text: 'Walls, shadows and fog, live: the GM draws a wall, your players’ view is cut instantly. Whatever lurks in the shadows stays there.',
      points: {
        first: 'Fog and lines of sight',
        second: 'Real-time lights and shadows',
        third: 'Rain, snow, embers, storms',
      },
      imageAlt:
        'Kaelith’s view in a graveyard: as she walks, the tombs’ shadows turn; a wall drawn by the GM cuts her view.',
    },
    sheets: {
      eyebrow: 'Sheets',
      title: 'Character sheets that do the math',
      text: 'Abilities, defense, bonuses and powers: the system’s rules are applied for you. Your character grows, the sheet keeps up.',
      points: {
        first: 'Guided, step-by-step creation',
        second: 'D&D, Star Wars and more',
        third: 'Abilities, inventory and progression',
      },
      imageAlt:
        'The sheet of Aelwen, elf ranger: portrait, abilities, hit points, defense, attacks and ability paths.',
    },
    weather: {
      eyebrow: 'Weather',
      title: 'Storm, blizzard, fog: change the mood in one click',
      text: 'Set the weather on the map and tune it down to the wind. The whole table sees it fall, live.',
      points: {
        first: 'Rain, snow, embers, storm, fog',
        second: 'Adjustable intensity and wind',
        third: 'Seen by the whole table',
      },
      imageAlt: 'The goblin camp under a storm, then a blizzard, then fog.',
    },
    attack: {
      eyebrow: 'Attack',
      title: 'Aim, pick your weapon, the GM decides',
      text: 'One click on the target, a weapon from your inventory, the dice are rolled. The report reaches the GM, who applies or adjusts it.',
      points: {
        first: 'Inventory weapons, dice and bonuses included',
        second: 'Report sent to the GM',
        third: 'Half, double, resistance, condition',
      },
      imageAlt: 'Borin attacks a skeleton with his axe, then the GM applies the damage.',
    },
    audio: {
      eyebrow: 'Sound zones',
      title: 'Get closer: the sound swells',
      text: 'Place music or an ambience on the map. Each player hears it according to their character’s distance.',
      points: {
        first: 'Volume follows distance',
        second: 'Built-in ambiences, files or YouTube',
        third: 'One zone per place, nothing to tweak',
      },
      imageAlt: 'Vorthax walks toward the campfire, the ambience volume rises.',
    },
  },
  dice: {
    eyebrow: '3D dice',
    title: 'Dice you can’t wait to roll',
    lead: 'More than 70 3D dice, rolled with real physics: precious metals, crystals, resins and enchanted orbs. All free.',
    points: {
      visibility: 'Public, private or GM-only rolls',
      symbols: 'Symbol dice for Star Wars',
      skins: 'Every player picks their own skin',
    },
    rollD20: 'Roll a d20',
    videoAlt:
      'Six dice from the shop in 3D close-up: Wandering Soul, Cyber Neon, Eclipse, Singularity, Sapphire Marble, Smoked Resin.',
    rollHint: 'Roll a die',
  },
  tools: {
    title: 'And the rest of the table',
    lead: 'From your first session to your hundredth, it’s all already there.',
    sound: {
      title: 'Soundscapes',
      text: 'Music placed on the map that swells as you get closer. Files or YouTube.',
      track: 'The Elfsong Tavern',
      zone: 'Music zone · 6 squares',
    },
    chat: {
      title: 'Table chat',
      text: 'Write to the whole table or in private, mention a player.',
    },
    ping: {
      title: 'Ping',
      text: 'Alt + click: the whole table looks at the same spot.',
    },
    voice: {
      title: 'Voice at the table',
      text: 'Talk to each other directly, in Table or Proximity mode.',
    },
    bestiary: {
      title: 'Bestiary',
      text: 'Drop a creature in one click: its full stat block comes along, ready to fight.',
      count: 'D&D creatures',
    },
    discord: {
      title: 'Discord bot',
      text: 'Roll your character’s dice right from your server.',
    },
    invite: {
      title: 'One-code invites',
      text: 'Your players join the campaign with six characters.',
    },
    weather: {
      title: 'Weather',
      text: 'Rain, snow, embers or storms, tuned down to the wind.',
    },
    templates: {
      title: 'Spell templates',
      text: 'Cones, circles and lines to aim true.',
    },
    systems: {
      title: 'Several game systems',
      text: 'Each system’s rules are applied for you: creation, sheets, combat.',
      dnd: 'Classic D&D',
      starWars: 'Star Wars — Edge of the Empire',
      nooblies: 'Nooblies Chronicles',
    },
    notes: {
      title: 'Notes and handouts',
      text: 'Everyone keeps their own notes: journals, NPCs, places, quests. Share what you want.',
    },
    history: {
      title: 'History',
      text: 'Every roll, every blow, every discovery, kept for what comes next.',
    },
    library: {
      title: 'Library',
      text: 'Nearly 4,000 maps, portraits and objects ready to drop.',
    },
    portals: {
      title: 'Portals and scenes',
      text: 'Stairs, doors and passages that lead the party from one map to the next.',
    },
    layers: {
      title: 'GM layers',
      text: 'Prepare behind the scenes, reveal when the time is right.',
    },
    realtime: {
      title: 'Real time',
      text: 'Every move syncs instantly for the whole table.',
    },
  },
  promo: {
    eyebrow: 'On video',
    title: 'Two minutes around the table',
    lead: 'A session at the goblin camp, filmed in Yner.',
    play: 'Play the video',
  },
  finalCta: {
    title: 'Your next session <accent>starts here</accent>',
    lead: 'Set up your table in a minute, invite your players with a code.',
    button: 'Create my table',
  },
  footer: {
    notice: 'Legal notice',
    privacy: 'Privacy',
    terms: 'Terms',
    credits: 'Credits',
  },
} satisfies Translation<typeof fr>;
