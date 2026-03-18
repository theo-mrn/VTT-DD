"use client"

import { useRef, useCallback } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { type NPC } from '@/components/(personnages)/personnages';
import { type Obstacle, type EdgeMeta } from '@/lib/visibility';
import {
  findNearestWallSegment,
  calculateSplitPoints,
  determineOneWayDirection,
} from '@/lib/obstacle-utils';
import { getMediaDimensions } from '@/app/[roomid]/map/utils/coordinates';
import type { Point, ObjectTemplate, MusicZone } from '@/app/[roomid]/map/types';

// ---- Types ----

export type DragFeaturePreview = {
  projected: Point;
  obstacle: Obstacle;
  segmentIndex: number;
  featureType: 'door' | 'one-way-wall' | 'window';
} | null;

export interface UseDragAndDropParams {
  // Canvas refs
  bgCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Background
  bgImageObject: HTMLImageElement | HTMLVideoElement | null;

  // View state (read-only)
  zoom: number;
  offset: { x: number; y: number };

  // Identity
  roomId: string;
  selectedCityId: string | null;

  // Data (read-only)
  obstacles: Obstacle[];

  // Visibility state (read-only)
  visibilityMode: boolean;

  // Modal state setters
  showPlaceModal: boolean;
  setShowPlaceModal: (v: boolean) => void;
  showPlaceObjectModal: boolean;
  setShowPlaceObjectModal: (v: boolean) => void;

  // NPC template state
  draggedTemplate: NPC | null;
  setDraggedTemplate: (v: NPC | null) => void;
  dropPosition: Point | null;
  setDropPosition: (v: Point | null) => void;

  // Object template state
  draggedObjectTemplateForPlace: ObjectTemplate | null;
  setDraggedObjectTemplateForPlace: (v: ObjectTemplate | null) => void;
  dropObjectPosition: Point | null;
  setDropObjectPosition: (v: Point | null) => void;

  // Feature preview state
  dragFeaturePreview: DragFeaturePreview;
  setDragFeaturePreview: (v: DragFeaturePreview) => void;

  // Firebase callbacks
  addWithHistory: (
    collectionName: string,
    data: any,
    description: string
  ) => Promise<any>;
  deleteFromRtdbWithHistory: (
    collectionName: string,
    id: string,
    description: string
  ) => Promise<void>;
  saveObstacle: (
    type: 'wall' | 'polygon' | 'one-way-wall' | 'door' | 'window',
    points: Point[],
    additionalProps?: {
      direction?: 'north' | 'south' | 'east' | 'west';
      isOpen?: boolean;
      edges?: EdgeMeta[];
    }
  ) => Promise<void>;
}

export interface UseDragAndDropReturn {
  handleCanvasDrop: (e: React.DragEvent) => Promise<void>;
  handleCanvasDragOver: (e: React.DragEvent) => void;
  handlePlaceConfirm: (config: {
    nombre: number;
    visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom' | 'invisible';
  }) => Promise<void>;
  handlePlaceObjectConfirm: (config: {
    nombre: number;
    visibility: 'visible' | 'hidden' | 'custom';
    visibleToPlayerIds: string[];
  }) => Promise<void>;
}

// ---- Hook ----

export function useDragAndDrop(params: UseDragAndDropParams): UseDragAndDropReturn {
  const {
    bgCanvasRef,
    containerRef,
    bgImageObject,
    zoom,
    offset,
    roomId,
    selectedCityId,
    obstacles,
    visibilityMode,
    setShowPlaceModal,
    setShowPlaceObjectModal,
    draggedTemplate,
    setDraggedTemplate,
    setDropPosition,
    draggedObjectTemplateForPlace,
    setDraggedObjectTemplateForPlace,
    dropObjectPosition,
    setDropObjectPosition,
    dropPosition,
    dragFeaturePreview,
    setDragFeaturePreview,
    addWithHistory,
    deleteFromRtdbWithHistory,
    saveObstacle,
  } = params;

  // Throttle ref for dragover updates (~30fps)
  const dragOverThrottleRef = useRef<number>(0);

  // ---------------------------------------------------------
  // handleCanvasDrop
  // ---------------------------------------------------------
  const handleCanvasDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()

    const canvas = bgCanvasRef.current
    const image = bgImageObject
    if (!canvas || !image) {
      return
    }
    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);

    // Get template data from dataTransfer
    const templateData = e.dataTransfer.getData('application/json')

    if (!templateData) {
      return
    }

    try {
      // Handle obstacle feature drop (door / one-way-wall on existing wall)
      if (templateData.includes('"type":"obstacle_feature"')) {
        const data = JSON.parse(templateData) as { type: string; featureType: 'door' | 'one-way-wall' | 'window' };
        setDragFeaturePreview(null);

        const rect = canvas.getBoundingClientRect()
        const containerWidth = containerRef.current?.clientWidth || rect.width
        const containerHeight = containerRef.current?.clientHeight || rect.height
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
        const scaledWidth = imgWidth * scale * zoom
        const scaledHeight = imgHeight * scale * zoom
        const dropX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
        const dropY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight
        const dropPoint: Point = { x: dropX, y: dropY };

        // Find the nearest wall segment
        const nearest = findNearestWallSegment(dropPoint, obstacles, 30 / zoom);
        if (!nearest) {
          toast.error('Aucun mur à proximité', { description: 'Glissez plus près d\'un mur existant.', duration: 2000 });
          return;
        }

        const { obstacle: targetObstacle, projected } = nearest;

        {
          const p1 = targetObstacle.points[0];
          const p2 = targetObstacle.points[1];
          const { c1, c2, skipBefore, skipAfter } = calculateSplitPoints(p1, p2, projected);

          // Delete the original obstacle
          await deleteFromRtdbWithHistory('obstacles', targetObstacle.id, 'Split d\'un mur');

          // Create the new segments
          if (!skipBefore) {
            await saveObstacle('wall', [p1, c1]);
          }

          // Create the feature (door or one-way-wall)
          const featureProps: any = {};
          if (data.featureType === 'door') {
            featureProps.isOpen = false;
          } else if (data.featureType === 'one-way-wall') {
            featureProps.direction = determineOneWayDirection(c1, c2);
          }
          await saveObstacle(data.featureType, [c1, c2], featureProps);

          if (!skipAfter) {
            await saveObstacle('wall', [c2, p2]);
          }

          toast.success(data.featureType === 'door' ? 'Porte ajoutée' : data.featureType === 'window' ? 'Fenêtre ajoutée' : 'Mur à sens unique ajouté', { duration: 1500 });
        }
        return;
      }

      if (templateData.includes('"type":"object_template"')) {
        const template = JSON.parse(templateData)

        // Logic similar for Object
        const rect = canvas.getBoundingClientRect()
        const containerWidth = containerRef.current?.clientWidth || rect.width
        const containerHeight = containerRef.current?.clientHeight || rect.height
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
        const scaledWidth = imgWidth * scale * zoom
        const scaledHeight = imgHeight * scale * zoom
        const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
        const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight


        setDraggedObjectTemplateForPlace(template)
        setDropObjectPosition({ x, y })
        setShowPlaceObjectModal(true)
        return
      }

      // Handle sound_template drop
      if (templateData.includes('"type":"sound_template"')) {
        const sound = JSON.parse(templateData)

        const rect = canvas.getBoundingClientRect()
        const containerWidth = containerRef.current?.clientWidth || rect.width
        const containerHeight = containerRef.current?.clientHeight || rect.height
        const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
        const scaledWidth = imgWidth * scale * zoom
        const scaledHeight = imgHeight * scale * zoom
        const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
        const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight

        // Create a music zone with the sound
        const newZone: Omit<MusicZone, 'id'> = {
          x,
          y,
          radius: 200, // Default radius
          url: sound.soundUrl,
          name: sound.name,
          volume: 0.5, // Default volume
          cityId: selectedCityId
        }

        await addDoc(collection(db, 'cartes', roomId, 'musicZones'), newZone)

        toast.success(`Zone sonore "${sound.name}" ajoutée sur la carte`, { duration: 1000 })
        return
      }

      const template = JSON.parse(templateData) as NPC
      const rect = canvas.getBoundingClientRect()
      const containerWidth = containerRef.current?.clientWidth || rect.width
      const containerHeight = containerRef.current?.clientHeight || rect.height

      // Calcul de l'échelle et des dimensions scalées (même logique que drawMap)
      const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
      const scaledWidth = imgWidth * scale * zoom
      const scaledHeight = imgHeight * scale * zoom

      // IMPORTANT: Utiliser la même formule que handleCanvasMouseMove
      // Le canvas utilise ctx.scale(sizeMultiplier) donc pas besoin de diviser par sizeMultiplier
      const x = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
      const y = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight


      setDraggedTemplate(template)
      setDropPosition({
        x: Math.max(0, Math.min(imgWidth, x)),
        y: Math.max(0, Math.min(imgHeight, y))
      })
      setShowPlaceModal(true)
    } catch (error) {
      console.error('Error parsing template data:', error)
      toast.error('Erreur lors du placement de l\'élément')
    }
  }, [
    bgCanvasRef, containerRef, bgImageObject, zoom, offset,
    roomId, selectedCityId, obstacles,
    setDragFeaturePreview, setDraggedTemplate, setDropPosition,
    setDraggedObjectTemplateForPlace, setDropObjectPosition,
    setShowPlaceModal, setShowPlaceObjectModal,
    addWithHistory, deleteFromRtdbWithHistory, saveObstacle,
  ]);

  // ---------------------------------------------------------
  // handleCanvasDragOver
  // ---------------------------------------------------------
  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'

    // Preview for obstacle feature drag (door/one-way-wall on walls)
    const canvas = bgCanvasRef.current
    const image = bgImageObject
    if (!canvas || !image) return;

    // Check if we're dragging an obstacle feature by trying to read types
    // Note: dataTransfer.getData() is not available during dragover (security),
    // but we can check types
    const hasJson = e.dataTransfer.types.includes('application/json');
    // Allow preview when dragging an obstacle_feature from ANY drawer (including embedded in UnifiedSearchDrawer)
    const isDraggingObstacleFeature = (window as any).__isDraggingObstacleFeature === true;
    if (!hasJson || (!visibilityMode && !isDraggingObstacleFeature)) {
      if (dragFeaturePreview) setDragFeaturePreview(null);
      return;
    }

    // Throttle dragover updates to ~30fps for performance
    const now = Date.now();
    if (now - dragOverThrottleRef.current < 33) return;
    dragOverThrottleRef.current = now;

    const { width: imgWidth, height: imgHeight } = getMediaDimensions(image);
    const rect = canvas.getBoundingClientRect()
    const containerWidth = containerRef.current?.clientWidth || rect.width
    const containerHeight = containerRef.current?.clientHeight || rect.height
    const scale = Math.min(containerWidth / imgWidth, containerHeight / imgHeight)
    const scaledWidth = imgWidth * scale * zoom
    const scaledHeight = imgHeight * scale * zoom
    const dropX = ((e.clientX - rect.left + offset.x) / scaledWidth) * imgWidth
    const dropY = ((e.clientY - rect.top + offset.y) / scaledHeight) * imgHeight

    const nearest = findNearestWallSegment({ x: dropX, y: dropY }, obstacles, 30 / zoom);
    if (nearest) {
      setDragFeaturePreview({
        projected: nearest.projected,
        obstacle: nearest.obstacle,
        segmentIndex: nearest.segmentIndex,
        featureType: 'door', // We can't know the exact type during dragover
      });
    } else {
      setDragFeaturePreview(null);
    }
  }, [
    bgCanvasRef, containerRef, bgImageObject, zoom, offset,
    obstacles, visibilityMode, dragFeaturePreview, setDragFeaturePreview,
  ]);

  // ---------------------------------------------------------
  // handlePlaceConfirm
  // ---------------------------------------------------------
  const handlePlaceConfirm = useCallback(async (config: {
    nombre: number; visibility?: 'public' | 'gm_only' | 'ally' | 'hidden' | 'visible' | 'custom' | 'invisible';
  }) => {
    if (!draggedTemplate || !dropPosition) return

    try {
      // Create instances based on nombre
      for (let i = 0; i < config.nombre; i++) {
        const offsetX = i * 50 // Offset each instance slightly
        const offsetY = i * 50

        const finalX = dropPosition.x + offsetX
        const finalY = dropPosition.y + offsetY

        const characterData = {
          Nomperso: config.nombre > 1 ? `${draggedTemplate.Nomperso} ${i + 1}` : draggedTemplate.Nomperso,
          type: 'pnj',
          imageURL2: draggedTemplate.imageURL2 || '',
          niveau: draggedTemplate.niveau,
          PV: draggedTemplate.PV,
          PV_Max: draggedTemplate.PV_Max,
          Defense: draggedTemplate.Defense,
          FOR: draggedTemplate.FOR ?? 10,
          DEX: draggedTemplate.DEX ?? 10,
          CON: draggedTemplate.CON ?? 10,
          INT: draggedTemplate.INT ?? 10,
          SAG: draggedTemplate.SAG ?? 10,
          CHA: draggedTemplate.CHA ?? 10,
          Contact: draggedTemplate.Contact ?? 0,
          Distance: draggedTemplate.Distance ?? 0,
          Magie: draggedTemplate.Magie ?? 0,
          INIT: draggedTemplate.INIT ?? 0,
          Actions: draggedTemplate.Actions || [],
          visibility: config.visibility,
          visibilityRadius: 100, // Default visibility radius
          cityId: selectedCityId, // Associate with current city
          x: finalX,
          y: finalY,
          createdAt: new Date()
        };

        await addWithHistory(
          'characters',
          characterData,
          `Ajout de "${characterData.Nomperso}"`
        );
      }

      // Toast de succès
      if (config.nombre > 1) {
        toast.success(`${config.nombre} PNJ "${draggedTemplate.Nomperso}" ajoutés sur la carte`)
      } else {
        toast.success(`PNJ "${draggedTemplate.Nomperso}" ajouté sur la carte`)
      }

    } catch (error) {
      console.error('Error placing NPC:', error)
      toast.error('Erreur lors du placement du PNJ')
    } finally {
      setShowPlaceModal(false)
      setDraggedTemplate(null)
      setDropPosition(null)
    }
  }, [
    draggedTemplate, dropPosition, selectedCityId,
    addWithHistory, setShowPlaceModal, setDraggedTemplate, setDropPosition,
  ]);

  // ---------------------------------------------------------
  // handlePlaceObjectConfirm
  // ---------------------------------------------------------
  const handlePlaceObjectConfirm = useCallback(async (config: {
    nombre: number;
    visibility: 'visible' | 'hidden' | 'custom';
    visibleToPlayerIds: string[];
  }) => {
    if (!draggedObjectTemplateForPlace || !dropObjectPosition || !selectedCityId) return

    try {
      for (let i = 0; i < config.nombre; i++) {
        // Add slight offset for multiple objects so they don't stack perfectly
        const offsetX = i * 20
        const offsetY = i * 20

        // Calculate width/height (same logic as before)
        let width = 100;
        let height = 100;

        try {
          // Preload image to get dimensions if possible, or just default
        } catch (e) {
          // ignore
        }

        // Let's re-implement the ratio logic briefly
        if (draggedObjectTemplateForPlace.imageUrl) {
          try {
            const img = new Image();
            img.src = draggedObjectTemplateForPlace.imageUrl;
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
            });
            if (img.width && img.height) {
              const ratio = img.width / img.height;
              height = width / ratio;
            }
          } catch (e) {
            console.warn("Could not load image for aspect ratio", e);
          }
        }

        const objectData: any = {
          x: dropObjectPosition.x + offsetX,
          y: dropObjectPosition.y + offsetY,
          width,
          height,
          rotation: 0,
          imageUrl: draggedObjectTemplateForPlace.imageUrl,
          name: draggedObjectTemplateForPlace.name,
          cityId: selectedCityId,
          createdAt: new Date(),
          visibility: config.visibility,
          visibleToPlayerIds: config.visibility === 'custom' ? config.visibleToPlayerIds : [],
          type: 'decors',
          visible: config.visibility === 'visible' || (config.visibility === 'custom' && config.visibleToPlayerIds.length > 0), // Basic visibility fallback
          isLocked: false
        };

        await addWithHistory(
          'objects',
          objectData,
          `Ajout de l'objet (${i + 1}/${config.nombre}) "${draggedObjectTemplateForPlace.name}"`
        );
      }

      if (config.nombre > 1) {
        toast.success(`${config.nombre} objets "${draggedObjectTemplateForPlace.name}" ajoutés`)
      } else {
        toast.success(`Objet "${draggedObjectTemplateForPlace.name}" ajouté`)
      }

    } catch (error) {
      console.error('Error placing object:', error);
      toast.error("Erreur lors du placement de l'objet");
    } finally {
      setDraggedObjectTemplateForPlace(null)
      setDropObjectPosition(null)
      setShowPlaceObjectModal(false)
    }
  }, [
    draggedObjectTemplateForPlace, dropObjectPosition, selectedCityId,
    addWithHistory, setDraggedObjectTemplateForPlace, setDropObjectPosition,
    setShowPlaceObjectModal,
  ]);

  return {
    handleCanvasDrop,
    handleCanvasDragOver,
    handlePlaceConfirm,
    handlePlaceObjectConfirm,
  };
}
