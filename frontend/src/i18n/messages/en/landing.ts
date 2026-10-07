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
      'The Yner game table: a tavern at night, the party facing bandits, the combat initiative order at the top of the screen.',
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
      text: 'Fog of war, lines of sight, dynamic lights and weather: the map reveals itself as the party explores, and whatever lurks in the shadows stays there.',
      points: {
        first: 'Fog and lines of sight',
        second: 'Real-time lights and shadows',
        third: 'Rain, snow, embers, storms',
      },
      imageAlt:
        'A player’s view in a graveyard: the chapel and graves in sight, a tomb’s shadow hiding what lies behind it, fog on the side.',
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
      text: 'Letters, maps and clues, shown to the players at the right moment.',
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
