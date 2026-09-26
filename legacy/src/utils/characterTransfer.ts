import {
  db,
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
} from '@/lib/firebase';
import { Character, CustomCompetence } from '@/contexts/CharacterContext';

const EXPORT_VERSION = 1;

interface InventoryItemExport {
  id: string;
  data: Record<string, any>;
}

interface BonusExport {
  id: string;
  data: Record<string, any>;
}

export interface CharacterExportData {
  exportVersion: number;
  exportedAt: string;
  character: Omit<Character, 'id'>;
  customCompetences: CustomCompetence[];
  inventory: InventoryItemExport[];
  bonuses: BonusExport[];
}

// Champs liés à la room/position qui ne doivent pas suivre le personnage vers une autre room
const TRANSIENT_FIELDS = [
  'x', 'y', 'positions', 'cityId', 'visibilityRadius',
];

export async function buildCharacterExport(roomId: string, character: Character): Promise<CharacterExportData> {
  const { id, ...characterRest } = character;

  const cleanCharacter: Record<string, any> = { ...characterRest };
  TRANSIENT_FIELDS.forEach(field => delete cleanCharacter[field]);

  const customCompetencesSnap = await getDocs(collection(db, `cartes/${roomId}/characters/${id}/customCompetences`));
  const customCompetences: CustomCompetence[] = customCompetencesSnap.docs.map(d => d.data() as CustomCompetence);

  const inventorySnap = await getDocs(collection(db, `Inventaire/${roomId}/${character.Nomperso}`));
  const inventory: InventoryItemExport[] = inventorySnap.docs.map(d => ({ id: d.id, data: d.data() }));

  const bonusesSnap = await getDocs(collection(db, `Bonus/${roomId}/${character.Nomperso}`));
  const bonuses: BonusExport[] = bonusesSnap.docs.map(d => ({ id: d.id, data: d.data() }));

  return {
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    character: cleanCharacter as Omit<Character, 'id'>,
    customCompetences,
    inventory,
    bonuses,
  };
}

export function downloadCharacterExport(exportData: CharacterExportData) {
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportData.character.Nomperso || 'personnage'}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function parseCharacterExport(raw: string): CharacterExportData {
  const json = JSON.parse(raw);
  if (!json.character || !json.character.Nomperso) {
    throw new Error('Fichier invalide : personnage introuvable dans le JSON.');
  }
  return {
    exportVersion: json.exportVersion ?? 1,
    exportedAt: json.exportedAt ?? new Date().toISOString(),
    character: json.character,
    customCompetences: Array.isArray(json.customCompetences) ? json.customCompetences : [],
    inventory: Array.isArray(json.inventory) ? json.inventory : [],
    bonuses: Array.isArray(json.bonuses) ? json.bonuses : [],
  };
}

async function findAvailableName(roomId: string, baseName: string): Promise<string> {
  const charactersSnap = await getDocs(collection(db, `cartes/${roomId}/characters`));
  const existingNames = new Set(charactersSnap.docs.map(d => d.data().Nomperso));

  if (!existingNames.has(baseName)) return baseName;

  let suffix = 2;
  let candidate = `${baseName} (${suffix})`;
  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName} (${suffix})`;
  }
  return candidate;
}

// Recrée le personnage, ses compétences personnalisées, son inventaire et les bonus associés dans la room cible.
// Génère toujours un nouveau personnage (jamais d'écrasement) ; renomme si le nom existe déjà dans la room.
export async function importCharacterExport(roomId: string, exportData: CharacterExportData): Promise<string> {
  const finalName = await findAvailableName(roomId, exportData.character.Nomperso);

  const newCharacterData: Record<string, any> = {
    ...exportData.character,
    Nomperso: finalName,
  };
  Object.keys(newCharacterData).forEach(key => {
    if (newCharacterData[key] === undefined) delete newCharacterData[key];
  });

  const newCharRef = await addDoc(collection(db, `cartes/${roomId}/characters`), newCharacterData);
  const newCharacterId = newCharRef.id;

  const batch = writeBatch(db);

  exportData.customCompetences.forEach(comp => {
    const ref = doc(collection(db, `cartes/${roomId}/characters/${newCharacterId}/customCompetences`));
    batch.set(ref, comp);
  });

  exportData.inventory.forEach(item => {
    // Garder le même id que l'item exporté : les bonus d'objets sont liés par cet id (Bonus/{roomId}/{playerName}/{itemId})
    const ref = doc(db, `Inventaire/${roomId}/${finalName}`, item.id);
    batch.set(ref, item.data);
  });

  exportData.bonuses.forEach(bonus => {
    const ref = doc(db, `Bonus/${roomId}/${finalName}/${bonus.id}`);
    batch.set(ref, bonus.data);
  });

  await batch.commit();

  return newCharacterId;
}
