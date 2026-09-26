import type { Character, LightSource, MapObject, MusicZone, Point, Portal } from '@/app/[roomid]/map/types';
import type { DetectedElement } from '@/components/(map)/ElementSelectionMenu';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';

// ── Types ────────────────────────────────────────────────────────────────────

export interface UseElementDetectionParams {
  // Identity
  isMJ: boolean;
  persoId: string | null;
  selectedCityId: string | null;
  zoom: number;

  // Data arrays
  lights: LightSource[];
  portals: Portal[];
  musicZones: MusicZone[];
  characters: Character[];
  objects: MapObject[];

  // Refs
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Setters for selection state
  setDetectedElements: (v: DetectedElement[]) => void;
  setShowElementSelectionMenu: (v: boolean) => void;
  setActiveElementType: (v: 'light' | 'portal' | 'musicZone' | 'character' | 'object' | null) => void;
  setActiveElementId: (v: string | null) => void;

  // Setters for context menus / selection indices
  setContextMenuOpen: (v: boolean) => void;
  setContextMenuCharacterId: (v: string | null) => void;
  setContextMenuLightId: (v: string | null) => void;
  setContextMenuPortalId: (v: string | null) => void;
  setSelectedCharacterIndex: (v: number | null) => void;
  setSelectedObjectIndices: (v: number[]) => void;
  setSelectedMusicZoneIds: (v: string[]) => void;
}

export interface UseElementDetectionReturn {
  detectElementsAtPosition: (clickX: number, clickY: number) => DetectedElement[];
  handleElementSelection: (element: DetectedElement, screenX: number, screenY: number) => void;
  resetActiveElementSelection: () => void;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useElementDetection(params: UseElementDetectionParams): UseElementDetectionReturn {
  const {
    isMJ, persoId, selectedCityId, zoom,
    lights, portals, musicZones, characters, objects,
    bgImageObject, containerRef,
    setDetectedElements, setShowElementSelectionMenu,
    setActiveElementType, setActiveElementId,
    setContextMenuOpen, setContextMenuCharacterId,
    setContextMenuLightId, setContextMenuPortalId,
    setSelectedCharacterIndex, setSelectedObjectIndices, setSelectedMusicZoneIds,
  } = params;

  const detectElementsAtPosition = (clickX: number, clickY: number): DetectedElement[] => {
    const detected: DetectedElement[] = [];

    let worldRadius = 50;

    if (bgImageObject && containerRef.current) {
      const { width: imgWidth, height: imgHeight } = getMediaDimensions(bgImageObject);
      const cWidth = containerRef.current.clientWidth;
      const cHeight = containerRef.current.clientHeight;
      const scale = Math.min(cWidth / imgWidth, cHeight / imgHeight);
      if (scale > 0) {
        worldRadius = 30 / scale;
      }
    }

    const DETECTION_RADIUS = Math.max(worldRadius, 20 / zoom);

    console.log(`🔍 Détection @ ${Math.round(clickX)},${Math.round(clickY)} - Radius: ${Math.round(DETECTION_RADIUS)}`);

    // Detect light sources (MJ only)
    if (isMJ) {
      lights.forEach(light => {
        if (!light.cityId || light.cityId === selectedCityId) {
          const dist = Math.sqrt(Math.pow(light.x - clickX, 2) + Math.pow(light.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: light.id,
              type: 'light',
              name: light.name || 'Source de Lumière',
              position: { x: light.x, y: light.y }
            });
          }
        }
      });
    }

    // Detect portals (MJ only)
    if (isMJ) {
      portals
        .filter(p => !p.cityId || p.cityId === selectedCityId)
        .forEach(portal => {
          const dist = Math.sqrt(Math.pow(portal.x - clickX, 2) + Math.pow(portal.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: portal.id,
              type: 'portal',
              name: portal.name || 'Portail',
              position: { x: portal.x, y: portal.y }
            });
          }
        });
    }

    // Detect music zones (MJ only)
    if (isMJ) {
      musicZones.forEach(zone => {
        const dist = Math.sqrt(Math.pow(zone.x - clickX, 2) + Math.pow(zone.y - clickY, 2));
        if (dist < DETECTION_RADIUS) {
          detected.push({
            id: zone.id,
            type: 'musicZone',
            name: zone.name || 'Zone de Musique',
            position: { x: zone.x, y: zone.y }
          });
        }
      });
    }

    // Detect characters (NPC and players)
    characters.forEach(char => {
      if (typeof char.x === 'number' && typeof char.y === 'number') {
        const dist = Math.sqrt(Math.pow(char.x - clickX, 2) + Math.pow(char.y - clickY, 2));
        if (dist < DETECTION_RADIUS) {
          let imgUrl: string | null = null;
          if (char.image) {
            imgUrl = typeof char.image === 'string' ? char.image : char.image.src;
          } else if (char.imageUrl) {
            imgUrl = typeof char.imageUrl === 'string' ? char.imageUrl : char.imageUrl.src;
          }

          detected.push({
            id: char.id,
            type: 'character',
            name: char.name || 'Personnage',
            position: { x: char.x, y: char.y },
            image: imgUrl
          });
        }
      }
    });

    // Detect objects (MJ only)
    if (isMJ) {
      objects
        .filter(obj => !obj.cityId || obj.cityId === selectedCityId)
        .forEach(obj => {
          const dist = Math.sqrt(Math.pow(obj.x - clickX, 2) + Math.pow(obj.y - clickY, 2));
          if (dist < DETECTION_RADIUS) {
            detected.push({
              id: obj.id,
              type: 'object',
              name: obj.name || 'Objet',
              position: { x: obj.x, y: obj.y },
              image: obj.imageUrl
            });
          }
        });
    }

    return detected;
  };

  const handleElementSelection = (element: DetectedElement, screenX: number, screenY: number) => {
    // Check permissions BEFORE applying selection
    if (element.type === 'character') {
      const charIndex = characters.findIndex(c => c.id === element.id);
      if (charIndex !== -1) {
        const char = characters[charIndex];
        const canControl = isMJ || (char.type === 'joueurs' && char.id === persoId) || char.visibility === 'ally';

        if (!canControl) {
          setContextMenuCharacterId(char.id);
          setContextMenuOpen(true);
          setShowElementSelectionMenu(false);
          return;
        }
      }
    }

    setActiveElementType(element.type);
    setActiveElementId(element.id);
    setShowElementSelectionMenu(false);

    switch (element.type) {
      case 'light':
        setContextMenuLightId(element.id);
        break;
      case 'portal':
        setContextMenuPortalId(element.id);
        break;
      case 'musicZone':
        setSelectedMusicZoneIds([element.id]);
        break;
      case 'character': {
        const charIndex = characters.findIndex(c => c.id === element.id);
        if (charIndex !== -1) {
          setSelectedCharacterIndex(charIndex);
        }
        break;
      }
      case 'object': {
        const objIndex = objects.findIndex(o => o.id === element.id);
        if (objIndex !== -1) {
          setSelectedObjectIndices([objIndex]);
        }
        break;
      }
    }
  };

  const resetActiveElementSelection = () => {
    setActiveElementType(null);
    setActiveElementId(null);
    setDetectedElements([]);
    setShowElementSelectionMenu(false);
  };

  return {
    detectElementsAtPosition,
    handleElementSelection,
    resetActiveElementSelection,
  };
}
