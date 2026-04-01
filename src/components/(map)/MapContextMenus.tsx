'use client'

import React from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';

import ContextMenuPanel from '@/components/(overlays)/ContextMenuPanel';
import ObstacleContextMenu from '@/components/(overlays)/ObstacleContextMenu';
import ObjectContextMenu from '@/components/(overlays)/ObjectContextMenu';
import MusicZoneContextMenu from '@/components/(overlays)/MusicZoneContextMenu';
import MeasurementContextMenu from '@/components/(overlays)/MeasurementContextMenu';
import LightContextMenu from '@/components/(overlays)/LightContextMenu';
import PortalContextMenu from '@/components/(overlays)/PortalContextMenu';
import { BulkCharacterContextMenu } from '@/components/(overlays)/BulkCharacterContextMenu';
import MeasurementPanel from '@/components/(map)/MeasurementPanel';

import {
  type Character,
  type MapObject,
  type MusicZone,
  type LightSource,
  type Portal,
  type VendorInteraction,
  type GameInteraction,
  type LootInteraction,
} from '@/app/[roomid]/map/types';
import type { Obstacle } from '@/lib/visibility';
import type { SharedMeasurement } from '@/app/[roomid]/map/measurements';
import type { MeasurementShape } from '@/components/(map)/MeasurementPanel';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface MapContextMenusProps {
  // Room
  roomId: string;
  isMJ: boolean;

  // Identity
  persoId: string | null;
  activePlayerId: string | null;

  // Characters
  characters: Character[];
  setCharacters: React.Dispatch<React.SetStateAction<Character[]>>;
  selectedCharacters: number[];

  // Bulk character context menu
  bulkContextMenuOpen: boolean;
  setBulkContextMenuOpen: (v: boolean) => void;
  handleBulkVisibilityChange: (visibility: 'visible' | 'hidden' | 'ally' | 'custom' | 'invisible') => Promise<void>;
  handleBulkConditionToggle: (conditionId: string) => Promise<void>;
  handleBulkDelete: () => void;

  // Obstacle context menu
  obstacles: Obstacle[];
  selectedObstacleIds: string[];
  setSelectedObstacleIds: (ids: string[]) => void;
  handleObstacleDelete: (obstacleId: string) => void;
  handleObstacleDeleteConnected: (obstacleId: string) => void;
  toggleDoorState: (obstacleId: string) => void;
  toggleLockDoor: (obstacleId: string) => void;
  handleObstacleInvertDirection: (obstacleId: string) => void;
  handleObstacleConvertTo: (obstacleId: string, newType: 'wall' | 'one-way-wall' | 'door' | 'window') => void;
  handleToggleRoomMode: (obstacleId: string) => void;
  findClosedLoops: (obstacles: Obstacle[]) => { wallObstacles: Obstacle[] }[];

  // Object context menu
  objects: MapObject[];
  contextMenuObjectOpen: boolean;
  setContextMenuObjectOpen: (v: boolean) => void;
  contextMenuObjectId: string | null;
  handleObjectAction: (action: string, objectId: string, value?: any) => void;
  isBackgroundEditMode: boolean;

  // Music zone context menu
  musicZones: MusicZone[];
  contextMenuMusicZoneOpen: boolean;
  setContextMenuMusicZoneOpen: (v: boolean) => void;
  contextMenuMusicZoneId: string | null;
  handleMusicZoneAction: (action: string, zoneId: string, value?: any) => void;

  // Measurement context menu
  measurements: SharedMeasurement[];
  contextMenuMeasurementOpen: boolean;
  setContextMenuMeasurementOpen: (v: boolean) => void;
  contextMenuMeasurementId: string | null;
  handleMeasurementAction: (action: string, measurementId: string) => void;

  // Measurement panel
  measureMode: boolean;
  setMeasureMode: (v: boolean) => void;
  isMeasurementPanelOpen: boolean;
  measurementShape: MeasurementShape;
  setMeasurementShape: (shape: MeasurementShape) => void;
  isCalibrating: boolean;
  setIsCalibrating: (v: boolean) => void;
  setMeasureStart: (v: { x: number; y: number } | null) => void;
  setMeasureEnd: (v: { x: number; y: number } | null) => void;
  handleClearMeasurements: () => void;
  isPermanent: boolean;
  setIsPermanent: (v: boolean) => void;
  coneAngle: number;
  setConeAngle: (v: number) => void;
  coneShape: 'flat' | 'rounded';
  setConeShape: (v: 'flat' | 'rounded') => void;
  coneMode: 'angle' | 'dimensions';
  setConeMode: (v: 'angle' | 'dimensions') => void;
  coneWidth: number | undefined;
  setConeWidth: (v: number | undefined) => void;
  coneLength: number | undefined;
  setConeLength: (v: number | undefined) => void;
  lockWidthHeight: boolean;
  setLockWidthHeight: (v: boolean) => void;
  selectedSkin: string;
  setSelectedSkin: (v: string) => void;

  // Light context menu
  lights: LightSource[];
  contextMenuLightOpen: boolean;
  setContextMenuLightOpen: (v: boolean) => void;
  contextMenuLightId: string | null;
  handleLightAction: (action: string, lightId: string, value?: any) => void;

  // Portal context menu
  portals: Portal[];
  contextMenuPortalOpen: boolean;
  setContextMenuPortalOpen: (v: boolean) => void;
  contextMenuPortalId: string | null;
  handlePortalAction: (action: string, portalId: string) => void;

  // Map context menu
  showAllBadges: boolean;
  setShowAllBadges: (v: boolean) => void;

  // ContextMenuPanel (character panel)
  contextMenuOpen: boolean;
  setContextMenuOpen: (v: boolean) => void;
  contextMenuCharacterId: string | null;
  setContextMenuCharacterId: (v: string | null) => void;
  setSelectedCharacterIndex: (v: number | null) => void;
  pixelsPerUnit: number;
  unitName: string;

  // ContextMenuPanel onAction dependencies
  setSelectedCharacterForSheet: (v: string) => void;
  setShowCharacterSheet: (v: boolean) => void;
  setAttackerId: (v: string | null) => void;
  setTargetId: (v: string | null) => void;
  setTargetIds: (v: string[]) => void;
  setCombatOpen: (v: boolean) => void;
  setInteractionConfigTarget: (v: Character | null) => void;
  setActiveInteraction: (v: { interaction: VendorInteraction | GameInteraction | LootInteraction; host: Character | MapObject } | null) => void;
  deleteWithHistory: (collection: string, id: string, description: string) => Promise<void>;
  resetActiveElementSelection: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MapContextMenus(props: MapContextMenusProps) {
  const {
    roomId,
    isMJ,
    persoId,
    activePlayerId,
    characters,
    setCharacters,
    selectedCharacters,

    // Bulk
    bulkContextMenuOpen,
    setBulkContextMenuOpen,
    handleBulkVisibilityChange,
    handleBulkConditionToggle,
    handleBulkDelete,

    // Obstacles
    obstacles,
    selectedObstacleIds,
    setSelectedObstacleIds,
    handleObstacleDelete,
    handleObstacleDeleteConnected,
    toggleDoorState,
    toggleLockDoor,
    handleObstacleInvertDirection,
    handleObstacleConvertTo,
    handleToggleRoomMode,
    findClosedLoops,

    // Objects
    objects,
    contextMenuObjectOpen,
    setContextMenuObjectOpen,
    contextMenuObjectId,
    handleObjectAction,
    isBackgroundEditMode,

    // Music zones
    musicZones,
    contextMenuMusicZoneOpen,
    setContextMenuMusicZoneOpen,
    contextMenuMusicZoneId,
    handleMusicZoneAction,

    // Measurements
    measurements,
    contextMenuMeasurementOpen,
    setContextMenuMeasurementOpen,
    contextMenuMeasurementId,
    handleMeasurementAction,

    // Measurement panel
    measureMode,
    setMeasureMode,
    isMeasurementPanelOpen,
    measurementShape,
    setMeasurementShape,
    isCalibrating,
    setIsCalibrating,
    setMeasureStart,
    setMeasureEnd,
    handleClearMeasurements,
    isPermanent,
    setIsPermanent,
    coneAngle,
    setConeAngle,
    coneShape,
    setConeShape,
    coneMode,
    setConeMode,
    coneWidth,
    setConeWidth,
    coneLength,
    setConeLength,
    lockWidthHeight,
    setLockWidthHeight,
    selectedSkin,
    setSelectedSkin,

    // Lights
    lights,
    contextMenuLightOpen,
    setContextMenuLightOpen,
    contextMenuLightId,
    handleLightAction,

    // Portals
    portals,
    contextMenuPortalOpen,
    setContextMenuPortalOpen,
    contextMenuPortalId,
    handlePortalAction,

    // Map context menu
    showAllBadges,
    setShowAllBadges,

    // Character panel
    contextMenuOpen,
    setContextMenuOpen,
    contextMenuCharacterId,
    setContextMenuCharacterId,
    setSelectedCharacterIndex,
    pixelsPerUnit,
    unitName,

    // Character panel onAction deps
    setSelectedCharacterForSheet,
    setShowCharacterSheet,
    setAttackerId,
    setTargetId,
    setTargetIds,
    setCombatOpen,
    setInteractionConfigTarget,
    setActiveInteraction,
    deleteWithHistory,
    resetActiveElementSelection,
  } = props;

  // -------------------------------------------------------------------------
  // onUploadFile for ContextMenuPanel
  // -------------------------------------------------------------------------
  const onUploadFile = async (file: File): Promise<string> => {
    if (!roomId) throw new Error("No Room ID");
    const storage = getStorage();
    const storageRef = ref(storage, `audio/${roomId}/${file.name}-${Date.now()}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  };

  // -------------------------------------------------------------------------
  // ContextMenuPanel onAction handler
  // -------------------------------------------------------------------------
  const handleContextMenuAction = async (action: string, characterId: string, value?: any) => {
    const char = characters.find(c => c.id === characterId);
    if (!char) return;

    if (action === 'openSheet') {
      setSelectedCharacterForSheet(characterId);
      setShowCharacterSheet(true);
      setContextMenuOpen(false);
    } else if (action === 'attack') {
      if (isMJ) {
        if (activePlayerId) {
          setAttackerId(activePlayerId);
          setTargetId(characterId);
          setTargetIds([]);
          setCombatOpen(true);
        } else {
          alert("Aucun personnage actif sélectionné pour attaquer (Tour du joueur)");
        }
      } else {
        if (persoId) {
          setAttackerId(persoId);
          setTargetId(characterId);
          setTargetIds([]);
          setCombatOpen(true);
        }
      }
    } else if (action === 'updateCharacterAudio') {
      await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
        audio: value
      });
    } else if (action === 'updatePV') {
      if (roomId) {
        const newPV = Number(value);
        await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), { PV: newPV });
        setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, PV: newPV } : c));
      }
    } else if (action === 'updateStat') {
      if (isMJ && roomId) {
        const { key, value: newValue } = value as { key: string; value: number };
        await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), { [key]: newValue });
        setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, [key]: newValue } : c));
      }
    } else if (action === 'updateImage') {
      if (isMJ && roomId) {
        try {
          const img = value as HTMLImageElement;
          const storage = getStorage();
          const imageRef = ref(storage, `characters/${char.name}-${Date.now()}`);
          const response = await fetch(img.src);
          const blob = await response.blob();
          await uploadBytes(imageRef, blob);
          const imageURL = await getDownloadURL(imageRef);
          await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), { imageURL2: imageURL });
          setCharacters(prev => prev.map(c => c.id === characterId ? { ...c, image: imageURL } : c));
          toast.success(`Image de ${char.name} mise à jour`);
        } catch (error) {
          console.error("Erreur lors du changement d'image :", error);
          toast.error("Erreur lors du changement d'image");
        }
      }
    } else if (action === 'updateShape') {
      await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
        shape: value
      });
    } else if (action === 'deleteCharacterAudio') {
      await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
        audio: null
      });
    } else if (action === 'toggleAudioPlay') {
      const newVolume = (char.audio?.volume || 0) > 0 ? 0 : 0.5;
      await updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
        'audio.volume': newVolume
      });
    } else if (action === 'delete') {
      if (isMJ && roomId) {
        try {
          await deleteWithHistory('characters', characterId, `Suppression de "${char.name}"`);
          setCharacters(characters.filter((c) => c.id !== characterId));
          setSelectedCharacterIndex(null);
          resetActiveElementSelection();
          toast.success(`Personnage "${char.name}" supprimé`);
          setContextMenuOpen(false);
          setContextMenuCharacterId(null);
        } catch (error) {
          console.error("Erreur lors de la suppression du personnage :", error);
          toast.error(`Erreur lors de la suppression du personnage "${char.name}"`);
        }
      }
    } else if (action === 'edit') {
      if (isMJ && roomId) {
        const editedChar = value as Character;
        try {
          const updatedData: Record<string, any> = {
            Nomperso: editedChar.name,
            niveau: editedChar.niveau,
            PV: editedChar.PV,
            Defense: editedChar.Defense,
            Contact: editedChar.Contact,
            Distance: editedChar.Distance,
            Magie: editedChar.Magie,
            INIT: editedChar.INIT,
            FOR: editedChar.FOR,
            DEX: editedChar.DEX,
            CON: editedChar.CON,
            SAG: editedChar.SAG,
            INT: editedChar.INT,
            CHA: editedChar.CHA,
            visibility: editedChar.visibility,
            visibilityRadius: editedChar.visibilityRadius,
          };

          const editingCharImageSrc = editedChar?.image ? (typeof editedChar.image === 'string' ? editedChar.image : editedChar.image.src) : null;
          const charToUpdateImageSrc = char.image ? (typeof char.image === 'string' ? char.image : char.image.src) : null;

          if (editingCharImageSrc !== charToUpdateImageSrc) {
            const storage = getStorage();
            const imageRef = ref(storage, `characters/${editedChar.name}-${Date.now()}`);
            const response = await fetch(editingCharImageSrc as string);
            const blob = await response.blob();
            await uploadBytes(imageRef, blob);
            const imageURL = await getDownloadURL(imageRef);
            updatedData.imageURL2 = imageURL;
          }

          await updateDoc(doc(db, 'cartes', String(roomId), 'characters', characterId), updatedData);
          toast.success(`${char.name} a été mis à jour`);

          setCharacters((prevCharacters) =>
            prevCharacters.map((c) =>
              c.id === characterId ? { ...c, ...updatedData } : c
            )
          );
          setSelectedCharacterIndex(null);
        } catch (error) {
          console.error("Erreur lors de la mise à jour du personnage :", error);
        }
      }
    } else if (action === 'setVisibility') {
      if (isMJ && roomId) {
        const newVisibility = value;
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        if (newVisibility === 'custom') {
          const currentPlayerIds = char.visibleToPlayerIds || [];
          updateDoc(charRef, {
            visibility: newVisibility,
            visibleToPlayerIds: currentPlayerIds
          });
        } else {
          updateDoc(charRef, { visibility: newVisibility });
        }
      }
    } else if (action === 'updateRadius') {
      if (isMJ && roomId) {
        const newRadius = value;
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        updateDoc(charRef, { visibilityRadius: newRadius });
      }
    } else if (action === 'updateScale') {
      if (isMJ && roomId) {
        const newScale = value;
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        updateDoc(charRef, { scale: newScale });
      }
    } else if (action === 'updateVisibilityRadius') {
      if (isMJ && roomId) {
        const newRadius = Number(value);
        console.log('[DEBUG] Updating visibilityRadius:', { characterId, oldValue: char.visibilityRadius, newValue: newRadius, type: typeof newRadius });
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        updateDoc(charRef, { visibilityRadius: newRadius }).then(() => {
          console.log('[DEBUG] visibilityRadius updated in Firebase');
        }).catch((error) => {
          console.error('[DEBUG] Error updating visibilityRadius:', error);
        });
      }
    } else if (action === 'toggleCondition') {
      if (isMJ && roomId) {
        const condition = value;
        const currentConditions = char.conditions || [];
        let newConditions;
        if (currentConditions.includes(condition)) {
          newConditions = currentConditions.filter((c: string) => c !== condition);
        } else {
          newConditions = [...currentConditions, condition];
        }
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        updateDoc(charRef, { conditions: newConditions });
      }
    } else if (action === 'updateVisiblePlayers') {
      if (isMJ && roomId) {
        const newPlayerIds = value;
        const charRef = doc(db, 'cartes', roomId, 'characters', characterId);
        updateDoc(charRef, { visibleToPlayerIds: newPlayerIds });
      }
    } else if (action === 'updateNotes') {
      if (roomId) {
        updateDoc(doc(db, 'cartes', roomId, 'characters', characterId), {
          notes: value
        });
      }
    } else if (action === 'configureInteraction') {
      setInteractionConfigTarget(char);
      setContextMenuOpen(false);
    } else if (action === 'interact') {
      const interaction = char.interactions?.find(i => i.id === value);
      if (interaction) {
        if (interaction.type === 'vendor') {
          setActiveInteraction({ interaction: interaction as VendorInteraction, host: char });
          setContextMenuOpen(false);
        } else if (interaction.type === 'game') {
          setActiveInteraction({ interaction: interaction as GameInteraction, host: char });
          setContextMenuOpen(false);
        } else if (interaction.type === 'loot') {
          setActiveInteraction({ interaction: interaction as LootInteraction, host: char });
          setContextMenuOpen(false);
        }
      }
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <>
      {/* BULK CHARACTER CONTEXT MENU */}
      <BulkCharacterContextMenu
        isOpen={bulkContextMenuOpen}
        selectedCount={selectedCharacters.length}
        onClose={() => {
          setBulkContextMenuOpen(false);
        }}
        onVisibilityChange={async (visibility) => {
          await handleBulkVisibilityChange(visibility);
          setBulkContextMenuOpen(false);
        }}
        onConditionToggle={async (conditionId) => {
          await handleBulkConditionToggle(conditionId);
        }}
        onDelete={() => {
          handleBulkDelete();
          setBulkContextMenuOpen(false);
        }}
      />

      {/* Obstacle Context Menu */}
      <ObstacleContextMenu
        obstacles={obstacles}
        selectedIds={selectedObstacleIds}
        isOpen={selectedObstacleIds.length > 0 && (isMJ || obstacles.find(o => o.id === selectedObstacleIds[0])?.type === 'door')}
        isInClosedLoop={selectedObstacleIds.length > 0 && findClosedLoops(obstacles).some(l => l.wallObstacles.some(w => w.id === selectedObstacleIds[0]))}
        isMJ={isMJ}
        onClose={() => setSelectedObstacleIds([])}
        onDelete={handleObstacleDelete}
        onDeleteConnected={handleObstacleDeleteConnected}
        onToggleDoor={toggleDoorState}
        onToggleLock={toggleLockDoor}
        onInvertDirection={handleObstacleInvertDirection}
        onConvertTo={handleObstacleConvertTo}
        onToggleRoomMode={handleToggleRoomMode}
      />

      {/* Object Context Menu */}
      <ObjectContextMenu
        object={contextMenuObjectId ? objects.find(o => o.id === contextMenuObjectId) || null : null}
        isOpen={contextMenuObjectOpen}
        onClose={() => setContextMenuObjectOpen(false)}
        onAction={handleObjectAction}
        isMJ={isMJ}
        isBackgroundEditMode={isBackgroundEditMode}
        players={characters.filter(c => c.type === 'joueurs')}
      />

      {/* Music Zone Context Menu */}
      <MusicZoneContextMenu
        zone={contextMenuMusicZoneId ? musicZones.find(z => z.id === contextMenuMusicZoneId) || null : null}
        isOpen={contextMenuMusicZoneOpen}
        onClose={() => setContextMenuMusicZoneOpen(false)}
        onAction={handleMusicZoneAction}
        isMJ={isMJ}
      />

      <MeasurementContextMenu
        measurement={contextMenuMeasurementId ? measurements.find(m => m.id === contextMenuMeasurementId) || null : null}
        isOpen={contextMenuMeasurementOpen}
        onClose={() => setContextMenuMeasurementOpen(false)}
        onAction={handleMeasurementAction}
      />

      {measureMode && isMeasurementPanelOpen && (
        <MeasurementPanel
          selectedShape={measurementShape}
          onShapeChange={setMeasurementShape}

          isCalibrating={isCalibrating}
          onStartCalibration={() => {
            setIsCalibrating(true);
            setMeasurementShape('line');
            setMeasureStart(null);
            setMeasureEnd(null);
          }}
          onCancelCalibration={() => setIsCalibrating(false)}

          onClearMeasurements={handleClearMeasurements}

          isPermanent={isPermanent}
          onPermanentChange={setIsPermanent}

          coneAngle={coneAngle}
          setConeAngle={setConeAngle}
          coneShape={coneShape}
          setConeShape={setConeShape}
          coneMode={coneMode}
          setConeMode={setConeMode}
          coneWidth={coneWidth}
          setConeWidth={setConeWidth}
          coneLength={coneLength}
          setConeLength={setConeLength}
          lockWidthHeight={lockWidthHeight}
          setLockWidthHeight={setLockWidthHeight}

          selectedSkin={selectedSkin}
          onSkinChange={setSelectedSkin}

          onClose={() => setMeasureMode(false)}
        />
      )}

      {/* LIGHT SOURCE CONTEXT MENU */}
      <LightContextMenu
        light={contextMenuLightId ? lights.find(l => l.id === contextMenuLightId) || null : null}
        isOpen={contextMenuLightOpen}
        onClose={() => setContextMenuLightOpen(false)}
        onAction={handleLightAction}
        isMJ={isMJ}
      />

      {/* Portal Context Menu */}
      <PortalContextMenu
        portal={contextMenuPortalId ? portals.find(p => p.id === contextMenuPortalId) || null : null}
        isOpen={contextMenuPortalOpen}
        onClose={() => setContextMenuPortalOpen(false)}
        onAction={handlePortalAction}
        isMJ={isMJ}
      />


      <ContextMenuPanel
        character={contextMenuCharacterId ? characters.find(c => c.id === contextMenuCharacterId) || null : null}
        isOpen={contextMenuOpen}
        onClose={() => {
          setContextMenuOpen(false);
          setContextMenuCharacterId(null);
          setSelectedCharacterIndex(null);
        }}
        isMJ={isMJ}
        players={characters.filter(c => c.type === 'joueurs')}
        onUploadFile={onUploadFile}
        pixelsPerUnit={pixelsPerUnit}
        unitName={unitName}
        onAction={handleContextMenuAction}
      />
    </>
  );
}
