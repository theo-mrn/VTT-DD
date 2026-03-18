import { doc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { Point, Character, MusicZone } from '@/app/[roomid]/map/types';

// ── Types ────────────────────────────────────────────────────────────────────

export interface TempZoneData {
  name: string;
  url: string;
  radius: number;
  volume: number;
}

export interface UseMusicZoneActionsParams {
  roomId: string;
  selectedCityId: string | null;

  // Data
  musicZones: MusicZone[];
  characters: Character[];

  // Music zone dialog state
  audioCharacterId: string | null;
  newMusicZonePos: Point | null;
  tempZoneData: TempZoneData;
  editingMusicZoneId: string | null;

  // Setters
  setShowMusicDialog: (v: boolean) => void;
  setShowEditMusicDialog: (v: boolean) => void;
  setAudioCharacterId: (v: string | null) => void;
  setNewMusicZonePos: (v: Point | null) => void;
  setTempZoneData: (v: TempZoneData) => void;
  setEditingMusicZoneId: (v: string | null) => void;
  setSelectedMusicZoneIds: React.Dispatch<React.SetStateAction<string[]>>;

  // Firebase history
  updateWithHistory: (
    collectionName: string,
    docId: string,
    updates: Record<string, any>,
    description: string
  ) => Promise<void>;
}

export interface UseMusicZoneActionsReturn {
  handleConfigureCharacterAudio: (characterId: string) => void;
  saveMusicZone: () => Promise<void>;
  openEditDialog: (zoneId: string) => void;
  saveEditedMusicZone: () => Promise<void>;
  deleteMusicZone: (id: string) => Promise<void>;
  updateMusicZonePosition: (id: string, x: number, y: number) => Promise<void>;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useMusicZoneActions(params: UseMusicZoneActionsParams): UseMusicZoneActionsReturn {
  const {
    roomId, selectedCityId,
    musicZones, characters,
    audioCharacterId, newMusicZonePos, tempZoneData, editingMusicZoneId,
    setShowMusicDialog, setShowEditMusicDialog,
    setAudioCharacterId, setNewMusicZonePos, setTempZoneData,
    setEditingMusicZoneId, setSelectedMusicZoneIds,
    updateWithHistory,
  } = params;

  const handleConfigureCharacterAudio = (characterId: string) => {
    const char = characters.find(c => c.id === characterId);
    if (!char) return;
    setAudioCharacterId(characterId);
    setTempZoneData({
      name: char.audio?.name || char.name,
      url: char.audio?.url || '',
      radius: char.audio?.radius || 200,
      volume: char.audio?.volume ?? 0.5
    });
    setShowMusicDialog(true);
  };

  const saveMusicZone = async () => {
    if (!roomId) return;

    // Character Audio Mode
    if (audioCharacterId) {
      if (!tempZoneData.url) return;

      const updates = {
        audio: {
          name: tempZoneData.name,
          url: tempZoneData.url,
          radius: Number(tempZoneData.radius),
          volume: Number(tempZoneData.volume),
          loop: true
        }
      };
      await updateDoc(doc(db, 'cartes', roomId, 'characters', audioCharacterId), updates);
      setShowMusicDialog(false);
      setAudioCharacterId(null);
      setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
      return;
    }

    // Standard Music Zone Mode
    if (!newMusicZonePos || !tempZoneData.name || !tempZoneData.url) return;

    const newZone: Omit<MusicZone, 'id'> = {
      x: newMusicZonePos.x,
      y: newMusicZonePos.y,
      radius: parseFloat(tempZoneData.radius.toString()),
      url: tempZoneData.url,
      name: tempZoneData.name,
      volume: parseFloat(tempZoneData.volume.toString()),
      cityId: selectedCityId
    };

    await addDoc(collection(db, 'cartes', roomId, 'musicZones'), newZone);
    setShowMusicDialog(false);
    setNewMusicZonePos(null);
    setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
  };

  const openEditDialog = (zoneId: string) => {
    const zone = musicZones.find(z => z.id === zoneId);
    if (zone) {
      setEditingMusicZoneId(zoneId);
      setTempZoneData({
        name: zone.name || '',
        url: zone.url || '',
        radius: zone.radius,
        volume: zone.volume
      });
      setShowEditMusicDialog(true);
    }
  };

  const saveEditedMusicZone = async () => {
    if (!editingMusicZoneId || !tempZoneData.name || !tempZoneData.url || !roomId) return;

    await updateDoc(doc(db, 'cartes', roomId, 'musicZones', editingMusicZoneId), {
      name: tempZoneData.name,
      url: tempZoneData.url,
      radius: parseFloat(tempZoneData.radius.toString()),
      volume: parseFloat(tempZoneData.volume.toString())
    });

    setShowEditMusicDialog(false);
    setEditingMusicZoneId(null);
    setTempZoneData({ name: '', url: '', radius: 200, volume: 0.5 });
  };

  const deleteMusicZone = async (id: string) => {
    if (!roomId) return;
    await deleteDoc(doc(db, 'cartes', roomId, 'musicZones', id));
    setSelectedMusicZoneIds(prev => prev.filter(zid => zid !== id));
  };

  const updateMusicZonePosition = async (id: string, x: number, y: number) => {
    if (!roomId) return;
    const zone = musicZones.find(z => z.id === id);
    await updateWithHistory(
      'musicZones',
      id,
      { x, y },
      `Déplacement de la zone musicale${zone?.name ? ` "${zone.name}"` : ''}`
    );
  };

  return {
    handleConfigureCharacterAudio,
    saveMusicZone,
    openEditDialog,
    saveEditedMusicZone,
    deleteMusicZone,
    updateMusicZonePosition,
  };
}
