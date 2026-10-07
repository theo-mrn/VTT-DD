import type fr from '../fr/diceSkins';
import type { Translation } from '../../types';

export default {
  resine_marbre: {
    name: 'Marble Resin',
    description: 'Ivory resin veined with gold, under a glossy varnish.',
  },
  resine_nuit: {
    name: 'Night Resin',
    description: 'Deep midnight blue, clouds of ink and silver flakes.',
  },
  resine_fumee: { name: 'Smoke Resin', description: 'Smoky amber laced with milky swirls.' },
  resine_jade: { name: 'Jade Resin', description: 'Marbled jade with pale inclusions.' },
  kyber_bleu: {
    name: 'Kyber Crystal — Blue',
    description: 'The heart of a Jedi saber. The blade still hums, trapped in the crystal.',
  },
  kyber_vert: {
    name: 'Kyber Crystal — Green',
    description: 'Cut on a forgotten moon. The guardian’s serenity, forged into a blade.',
  },
  kyber_violet: {
    name: 'Kyber Crystal — Amethyst',
    description: 'A color only one master dared to wear. Neither quite light, nor quite shadow.',
  },
  kyber_rouge: {
    name: 'Kyber Crystal — Bled',
    description: 'A crystal broken by hatred until it bled. Its light is a wound.',
  },
  kyber_or: {
    name: 'Kyber Crystal — Gold',
    description: 'The crystal of masters. Its golden blade never wavers — the mark of triumph.',
  },
  etoile_mort: {
    name: 'Death Star',
    description:
      'This battle station is your ultimate weapon. The superlaser charges with every roll.',
  },
  cote_obscur: {
    name: 'Dark Side',
    description: 'The Force in anger. Lightning crawls beneath the surface, seeking prey.',
  },
  cote_lumineux: {
    name: 'Light Side',
    description:
      'The Force at peace. A serene energy flows beneath the surface, watching over its bearer.',
  },
  esprit_force: {
    name: 'Spirit of the Force',
    description: 'The Force itself: light and darkness intertwined, forever in balance.',
  },
  hyperespace: {
    name: 'Hyperspace Jump',
    description: 'Hold on. The stars stretch and the universe races by — off to lightspeed.',
  },
  aqua_orb: {
    name: 'Aquatic Orb',
    description: 'A living glass shell with a floating heart of light.',
  },
  eye_orb: {
    name: 'Guardian’s Eye',
    description: 'An ancient eye sealed in glass. It is watching you.',
  },
  shield_orb: { name: 'Guardian', description: 'No blade has ever breached this protection.' },
  book_orb: {
    name: 'Ancient Grimoire',
    description: 'Forbidden knowledge, sealed away for the good of all.',
  },
  potion_orb: {
    name: 'Mystic Elixir',
    description: 'A shimmering brew whose effect no one knows.',
  },
  mug_orb: {
    name: 'Innkeeper’s Tankard',
    description: 'Always full, never empty. Every adventurer’s dream.',
  },
  mimique_orb: {
    name: 'Captive Mimic',
    description: 'A chest that bites, prisoner of its own greed.',
  },
  ring_orb: {
    name: 'Sealed Ring',
    description: 'A ring of power sealed in glass. One alone binds it.',
  },
  beholder_orb: {
    name: 'Tyrant Eye',
    description: 'A miniature beholder sealed in a glass sphere.',
  },
  butterfly_orb: {
    name: 'Ephemeral Butterfly',
    description: 'A light soul, frozen mid-flight in the glass.',
  },
  singularite: {
    name: 'Singularity',
    description:
      'A fragment of the universe, stolen from the sky of a night that no longer exists.',
  },
  prism: {
    name: 'Prismatic Opal',
    description: 'Every angle reveals a color no one else will ever see.',
  },
  magma: {
    name: 'Magma Heart',
    description: 'The blood of the earth still flows beneath its broken crust.',
  },
  storm: {
    name: 'Heart of the Storm',
    description: 'The storm lives inside. Every roll wakes the lightning.',
  },
  eclipse: {
    name: 'Eclipse',
    description: 'A dead sun, crowned with a fire that refuses to die.',
  },
  spectre: {
    name: 'Wandering Soul',
    description: 'A captive soul, forever adrift between two worlds.',
  },
  ocean_heart: {
    name: 'Heart of the Ocean',
    description: 'A whole ocean sealed in glass. The waves have never stopped rolling.',
  },
  ecailles_ancestrales: {
    name: 'Ancestral Scales',
    description:
      'The shed skin of an ancient dragon, each scale still warm with the memory of its bearer.',
  },
  bismuth: {
    name: 'Bismuth Ziggurat',
    description:
      'A stepped mineral crystal, where each step steals a different color from the light.',
  },
  poison: {
    name: 'Corrosive Bile',
    description: 'A poison so virulent it eats away at reality itself.',
  },
  onyx_dore: {
    name: 'Golden Onyx',
    description: 'Polished darkness, veined with pure gold. Wealth in the shadows.',
  },
  sang_ancien: {
    name: 'Ancient Blood',
    description: 'The blood of a fallen god still flows through its veins.',
  },
  gold: { name: 'Royal Gold', description: 'Timeless elegance for wealthy adventurers.' },
  silver: { name: 'Silver', description: 'Bright and pure, effective against lycanthropes.' },
  ruby: { name: 'Ruby', description: 'A fiery gem pulsing with magical energy.' },
  obsidian: {
    name: 'Obsidian',
    description: 'Forged in darkness, for those who embrace the shadow.',
  },
  jade: { name: 'Jade', description: 'A symbol of serenity and luck.' },
  crystal: { name: 'Crystal', description: 'As transparent as your intentions... or not.' },
  sapphire: { name: 'Sapphire', description: 'As deep as the ocean, as hard as steel.' },
  amethyst: { name: 'Amethyst', description: 'Mystical and regal, favored by mages.' },
  inferno: {
    name: 'Inferno',
    description: 'Burns with an eternal flame that only consumes your enemies.',
  },
  frost: { name: 'Frost', description: 'Cold as death, sharp as a blizzard.' },
  cyber_neon: { name: 'Cyber Neon', description: 'A lost technology from another dimension.' },
  bleu_marble: { name: 'Blue Marble', description: 'Classic elegance with a royal touch.' },
  cosmos: { name: 'Cosmos', description: 'Holds entire galaxies in every face.' },
  space: { name: 'Space', description: 'The endless void between the stars.' },
  ocean: { name: 'Ocean', description: 'For those who hear the call of the open sea.' },
  metal_lourd: { name: 'Heavy Metal', description: 'A sturdy alloy, forged to last.' },
  merveille: { name: 'Marvel', description: 'A marvel of magical craftsmanship.' },
  ancient_bone: {
    name: 'Ancient Bone',
    description: 'Carved from the bones of a forgotten creature.',
  },
  void_walker: { name: 'Void Walker', description: 'There is nothing here... absolutely nothing.' },
  celestial_starlight: {
    name: 'Starlight',
    description: 'Guides lost travelers through the night.',
  },
  blood_pact: { name: 'Blood Pact', description: 'An oath that cannot be broken.' },
  steampunk_copper: {
    name: 'Steampunk Copper',
    description: 'Gears and steam, for the modern engineer.',
  },
  galactic_nebula: { name: 'Nebula', description: 'Where stars are born.' },
  dragon_scale: { name: 'Dragon Scale', description: 'Hard, shiny and extremely precious.' },
  moonstone: { name: 'Moonstone', description: 'Bathed in the light of Selûne.' },
  bois_noble: {
    name: 'Noble Wood',
    description: 'Simple, sturdy and reliable. Like a good dwarf.',
  },
  cuir_ancien: { name: 'Ancient Leather', description: 'Smells of old books and adventure.' },
  pierre_donjon: { name: 'Dungeon Stone', description: 'As cold as a cell floor.' },
  fer_rouille: { name: 'Rusted Iron', description: 'Long forgotten, but still solid.' },
  roche_volcanique: { name: 'Volcanic Rock', description: 'Careful, it’s hot!' },
  glace_eternelle: { name: 'Eternal Ice', description: 'Never melts, even in a volcano.' },
  ecorce_ancienne: { name: 'Ancient Bark', description: 'Nature always takes back what is hers.' },
  parchemin_ancien: { name: 'Ancient Parchment', description: 'Words have power.' },
  meteore_sang: { name: 'Meteor', description: 'Fallen from the sky during a blood eclipse.' },
  marbre_saphir: {
    name: 'Sapphire Marble',
    description: 'Deep midnight blue, streaked with veins of lunar silver.',
  },
  royal_marble: { name: 'Royal Marble', description: 'Worthy of a throne.' },
  marbre_blanc: {
    name: 'White Marble',
    description: 'Polished to perfection, veined with gold, for sacred temples.',
  },
  marbre_emeraude: {
    name: 'Emerald Marble',
    description: 'An elegant blend of emerald waves and golden veins.',
  },
  marbre_ambre: {
    name: 'Amber Marble',
    description: 'An elegant blend of amber waves and golden veins.',
  },
} satisfies Translation<typeof fr>;
