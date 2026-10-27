import type fr from '../fr/landing';
import type { Translation } from '../../types';

export default {
  play: 'Play video',
  skip: 'Skip to content',
  nav: {
    label: 'Main navigation',
    home: 'Yner, home',
    benefices: 'Features',
    etapes: 'How it works',
    faq: 'Questions',
    signIn: 'Sign in',
    start: 'Create my table',
    openMenu: 'Open the menu',
    closeMenu: 'Close the menu',
  },
  cta: {
    start: 'Create my table for free',
    openApp: 'Open Yner',
  },
  hero: {
    eyebrow: 'Online tabletop roleplaying',
    title: '<l>Run your campaign online</l><l>without juggling five tools</l>',
    lead: 'A map with fog and lines of sight, sheets that apply the rules, combat, 3D dice and voice: the whole game fits in one browser tab. For D&D classic, Nooblies Chroniques and Star Wars.',
    proof: 'Free and nothing to install. Nearly 4,000 maps, portraits and objects ready to place.',
    imageAlt:
      'The Yner game table: a flyover of an animated goblin camp, with the party and the goblins placed on the map.',
  },
  problem: {
    title: 'An online game often means five open tabs',
    text: 'One app for the map, a PDF for the sheets, a dice bot, a voice channel and a separate playlist. The GM spends the session juggling while the table waits.',
    answer:
      'On Yner, everything sits on the same table, and your system’s rules are applied for you.',
    tools: {
      map: { before: 'A map app', after: 'Scenes with walls and fog' },
      sheets: { before: 'PDF character sheets', after: 'Sheets that do the math' },
      dice: { before: 'A dice bot', after: '3D dice tied to the sheets' },
      voice: { before: 'A voice channel', after: 'Voice built into the table' },
      music: { before: 'A separate playlist', after: 'Music placed on the map' },
    },
  },
  benefits: {
    title: 'The GM tells the story, the table does the rest',
    lead: 'Four things you will no longer handle by hand, filmed in Yner.',
    combat: {
      eyebrow: 'Combat',
      title: 'Less math, more play',
      text: 'Initiative rolls itself and every attack reaches the GM with its dice and bonuses. One click applies it, and hit points follow on the sheets.',
      points: {
        first: 'Automatic initiative and turn order',
        second: 'Attack in three clicks: target, weapon, dice',
        third: 'Half, double, resistance and conditions applied to sheets',
      },
      imageAlt:
        'A fight in progress: the initiative order at the top of the map, Borin the dwarf’s turn highlighted.',
    },
    vision: {
      eyebrow: 'Vision',
      title: 'Mystery that holds until the end',
      text: 'Walls, fog and lights shape what each character sees, live. What lurks in the shadows stays there until you decide to show it.',
      points: {
        first: 'Lines of sight for each character',
        second: 'Fog that lifts as the party explores',
        third: 'Lights and shadows in real time',
      },
      imageAlt:
        'Kaelith’s view in a graveyard: as she walks, the tombs’ shadows turn; a wall placed by the GM cuts her sight.',
    },
    sheets: {
      eyebrow: 'Sheets',
      title: 'Sheets that are right from creation',
      text: 'Abilities, defense, bonuses and features follow the system’s rules. Creation guides you step by step, and the sheet follows every level.',
      points: {
        first: 'Guided creation, paths and abilities your way',
        second: 'D&D classic, Nooblies Chroniques and Star Wars',
        third: 'Import a Noobliés sheet from its link',
      },
      imageAlt:
        'Aelwen’s sheet, an elf ranger: portrait, abilities, hit points, defense, attacks and ability paths.',
    },
    mood: {
      eyebrow: 'Atmosphere',
      title: 'An atmosphere you set in one click',
      text: 'Storm, blizzard or mist on the map, music that rises as you near the campfire. The whole table sees it and hears it at the same moment.',
      points: {
        first: 'Rain, snow, embers, storm and fog',
        second: 'Sound zones that follow distance',
        third: 'Voice for the whole table or by proximity',
      },
      imageAlt: 'The goblin camp in a storm, then a blizzard, then fog.',
    },
  },
  tagline: {
    first: 'You prepare the story.',
    second: 'Yner keeps the map, the sheets and the dice.',
  },
  scene: {
    label: 'An encounter at the tavern',
    imageAlt:
      'The Elfsong tavern on Yner: Borin, Vorthax, Kaelith and Sylvara facing the bandit captain and his three men',
    chapters: {
      dark: {
        eyebrow: 'Character vision',
        title: 'Your players walk into the dark',
        text: 'Each one sees only what their character sees: the glow of their torch, not a step further.',
      },
      reveal: {
        eyebrow: 'GM reveal',
        title: 'You spring the ambush',
        text: 'One click lights the room: the captain and his three bandits were waiting at the back. Your ping shows the whole table where to look.',
      },
      grid: {
        eyebrow: 'Grid',
        title: 'The grid settles on the map',
        text: 'Squares aligned to the map, under the tokens: everyone counts their movement and spell range at a glance.',
      },
      initiative: {
        eyebrow: 'Initiative',
        title: 'Combat sorts itself out',
        text: 'Initiative is rolled for every hero and every bandit, the turn order lines up, and one click moves to the next.',
      },
    },
  },
  steps: {
    title: 'Your first session in three steps',
    create: {
      title: 'Create your campaign',
      text: 'Pick D&D classic, Nooblies Chroniques or Star Wars: rules, sheets and combat are ready.',
      systems: { dnd: 'D&D classic', nooblies: 'Nooblies Chroniques', starwars: 'Star Wars' },
    },
    invite: {
      title: 'Invite your players',
      text: 'Share a six character code. They join from their browser, with nothing to install.',
      code: 'Campaign code',
      joined: '{count, plural, one {# player at the table} other {# players at the table}}',
    },
    play: {
      title: 'Start the session',
      text: 'Open a scene, place the characters and creatures from the bestiary, and play.',
      imageAlt: 'A scene during a session, with the character tokens on the map',
    },
  },
  dice: {
    eyebrow: '3D dice',
    title: 'Dice you want to roll',
    lead: '3D dice thrown with real physics, on every roll at the table. Premium adds dozens of skins: precious metals, crystals, resins and enchanted orbs.',
    points: {
      visibility: 'Public, private or GM only rolls',
      symbols: 'Symbol dice for Star Wars',
      skins: 'Each player picks their own skin',
    },
    imageAlt:
      'A d20 from the shop in close up, in 3D, turning as you scroll through six skins: Wandering Soul, Cyber Neon, Eclipse, Singularity, Sapphire Marble, Smoke Resin.',
    rollD20: 'Roll a d20',
    rollHint: 'Roll a die',
  },
  tools: {
    title: 'And the rest of the table',
    lead: 'From the first session to the hundredth, it is all there.',
    voice: {
      title: 'Voice at the table',
      text: 'Talk directly, to the whole table or by how close the characters are.',
    },
    chat: {
      title: 'Chat',
      text: 'Write to the whole table or privately, mention a player.',
    },
    ping: {
      title: 'Map ping',
      text: 'Alt and click: the whole table looks at the same spot.',
    },
    bestiary: {
      title: 'Bestiary',
      text: 'Place a creature in one click: its full sheet comes with it, ready to fight.',
    },
    library: {
      title: 'Library',
      text: 'Nearly 4,000 maps, portraits and objects ready to place.',
    },
    portals: {
      title: 'Portals and scenes',
      text: 'Stairs, doors and passages that lead the party from one map to another.',
    },
    layers: {
      title: 'GM layers',
      text: 'Prepare behind the scenes, reveal when the time comes.',
    },
    notes: {
      title: 'Notes and documents',
      text: 'Journals, NPCs, places and quests: everyone keeps notes and shares what they want.',
    },
    discord: {
      title: 'Discord bot',
      text: 'Roll your character’s dice from your server.',
    },
  },
  promo: {
    eyebrow: 'On video',
    title: 'Watch a real game',
    lead: 'The goblin camp, from the first roll to the last blow, filmed in Yner.',
    play: 'Play the video',
  },
  faq: {
    title: 'Your questions before the first session',
    items: {
      free: {
        q: 'How much does Yner cost?',
        a: 'Nothing. Creating a campaign, inviting your players and playing are free. Premium is optional and adds dice skins and token frames: nothing you need to play is paid.',
      },
      install: {
        q: 'Do my players need to install anything?',
        a: 'No. A recent browser is enough, for the GM and the players alike.',
      },
      systems: {
        q: 'Which game systems are supported?',
        a: 'D&D classic, Nooblies Chroniques and Star Wars: Edge of the Empire. For each one, creation, sheets and combat apply the system’s rules.',
      },
      join: {
        q: 'How do my players join the campaign?',
        a: 'You give them a six character code, or invite them directly from your friends list.',
      },
      voice: {
        q: 'Can we talk without Discord?',
        a: 'Voice is built into the table: everyone hears everyone, or each player hears by how close the characters are. A Discord bot is still there to roll your dice from your server.',
      },
      vision: {
        q: 'Do players see the whole map?',
        a: 'No. Each player sees what their character sees: walls, fog and lights cut the view live, and the GM decides what to reveal.',
      },
      import: {
        q: 'Can I bring an existing sheet?',
        a: 'A Noobliés sheet imports from its link. During creation, you can also change paths and create your own abilities.',
      },
      prep: {
        q: 'Does it take much prep before playing?',
        a: 'No. Nearly 4,000 maps, portraits and objects are ready to place, and the bestiary places a creature with its full sheet in one click.',
      },
    },
  },
  finalCta: {
    title: 'Your next session starts here',
    lead: 'Create your table, share the code with your players, play tonight.',
    reassurance: 'Free, no credit card, nothing to install.',
  },
  footer: {
    notice: 'Legal notice',
    privacy: 'Privacy',
    terms: 'Terms',
    credits: 'Credits',
  },
} satisfies Translation<typeof fr>;
