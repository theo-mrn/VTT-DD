/**
 * Où sert un fichier, et sa catégorie à l'écran (docs/stockage.md) : d'après l'usage réservé à
 * l'envoi, sinon les tables qui le citent (tous services), sinon son dossier.
 */
import type { StorageCategory } from '@vtt/contracts';

/** Table qui cite un fichier → libellé court et catégorie. */
const PLACES: Record<string, { label: string; category: StorageCategory }> = {
  // campaign
  campaigns: { label: 'Image de la campagne', category: 'campaign' },
  maps: { label: 'Fond de scène', category: 'maps' },
  map_objects: { label: 'Objet sur la carte', category: 'objects' },
  map_tokens: { label: 'Token', category: 'characters' },
  map_drawings: { label: 'Dessin', category: 'other' },
  map_notes: { label: 'Texte de la carte', category: 'notes' },
  map_portals: { label: 'Portail', category: 'other' },
  notes: { label: 'Note', category: 'notes' },
  note_pins: { label: 'Note', category: 'notes' },
  campaign_messages: { label: 'Message', category: 'other' },
  campaign_characters: { label: 'Personnage', category: 'characters' },
  // character
  characters: { label: 'Personnage', category: 'characters' },
  npc_templates: { label: 'Modèle de PNJ', category: 'npcs' },
  object_templates: { label: 'Modèle d’objet', category: 'objects' },
  applications: { label: 'Personnage', category: 'characters' },
  application_items: { label: 'Objet d’un personnage', category: 'objects' },
  // identity, dice
  profiles: { label: 'Profil', category: 'other' },
  inventory: { label: 'Dés', category: 'other' },
};

/** Tables d'import de l'ancienne app : elles gardent une trace, pas un usage à montrer. */
const TRACE_TABLES = new Set(['legacy_ids', 'legacy_items']);

const USAGES: Record<string, StorageCategory> = {
  'map-background': 'maps',
  'map-object': 'objects',
  'npc-image': 'npcs',
  'note-image': 'notes',
  'campaign-image': 'campaign',
  portrait: 'characters',
  token: 'characters',
  sound: 'sounds',
};

/** Libellés des endroits où sert le fichier (uniques, dans l'ordre des tables). */
export function placeLabels(tables: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tables) {
    if (TRACE_TABLES.has(t)) continue;
    const label = PLACES[t]?.label ?? t;
    if (!out.includes(label)) out.push(label);
  }
  return out;
}

export function categoryOf(f: {
  key: string;
  usage: string | null;
  usedBy: readonly string[];
}): StorageCategory {
  if (f.key.startsWith('audio/')) return 'sounds';
  if (f.usage && USAGES[f.usage]) return USAGES[f.usage]!;
  for (const t of f.usedBy) {
    const c = PLACES[t]?.category;
    if (c && c !== 'other') return c;
  }
  if (f.key.startsWith('characters/')) return 'characters';
  return 'other';
}
