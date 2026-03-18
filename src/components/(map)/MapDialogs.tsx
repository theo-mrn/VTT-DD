'use client'

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { doc, collection, updateDoc, addDoc } from 'firebase/firestore'
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db } from '@/lib/firebase'
import { toast } from 'sonner'

import PortalConfigDialog from '@/components/(map)/PortalConfigDialog'
import { CreateNoteModal } from '@/components/(map)/CreateNoteModal'
import CharacterSheet from '@/components/(fiches)/CharacterSheet'
import GlobalSettingsDialog from '@/components/(map)/GlobalSettingsDialog'
import BackgroundSelector from '@/components/(map)/BackgroundSelector'
import { DeleteConfirmationModal, type EntityToDelete } from '@/components/(map)/DeleteConfirmationModal'
import { PlaceNPCModal } from '@/components/(personnages)/PlaceNPCModal'
import { PlaceObjectModal } from '@/components/(personnages)/PlaceObjectModal'
import { NPCTemplateDrawer } from '@/components/(personnages)/NPCTemplateDrawer'
import { ObjectDrawer } from '@/components/(personnages)/ObjectDrawer'
import { SoundDrawer } from '@/components/(personnages)/SoundDrawer'
import { UnifiedSearchDrawer } from '@/components/(personnages)/UnifiedSearchDrawer'
import { VisibilityDrawer } from '@/components/(personnages)/VisibilityDrawer'
import { GMTemplatesProvider } from '@/contexts/GMTemplatesContext'
import { AudioMixerPanel } from '@/components/(audio)/AudioMixerPanel'

import type { Portal, Character, ObjectTemplate, MapText } from '@/app/[roomid]/map/types'
import type { NPC } from '@/components/(personnages)/personnages'
import type { Obstacle } from '@/lib/visibility'
import type { VisibilityState } from '@/hooks/map/useVisibilityState'
import type { TempZoneData } from '@/hooks/map/useMusicZoneActions'

// ── Props Interface ─────────────────────────────────────────────────────────

export interface MapDialogsProps {
  // General
  roomId: string
  isMJ: boolean
  selectedCityId: string | null

  // ── Portal Config Dialog ──
  showPortalConfig: boolean
  setShowPortalConfig: (v: boolean) => void
  editingPortal: Portal | null
  setEditingPortal: (v: Portal | null) => void
  newPortalPos: { x: number; y: number } | null
  setNewPortalPos: (v: { x: number; y: number } | null) => void
  firstPortalPoint: { x: number; y: number } | null
  setFirstPortalPoint: (v: { x: number; y: number } | null) => void
  firstPortalId: string | null
  setFirstPortalId: (v: string | null) => void
  portalPlacementMode: 'scene-change' | 'same-map' | null

  // ── CreateNoteModal ──
  showCreateNoteModal: boolean
  setShowCreateNoteModal: (v: boolean) => void
  editingNote: MapText | null
  setEditingNote: (v: MapText | null) => void
  handleCreateNoteConfirm: (note: { text: string; color: string; fontSize: number; fontFamily: string }) => void

  // ── CharacterSheet ──
  showCharacterSheet: boolean
  setShowCharacterSheet: (v: boolean) => void
  selectedCharacterForSheet: string | null
  setSelectedCharacterForSheet: (v: string | null) => void

  // ── Calibration Dialog ──
  calibrationDialogOpen: boolean
  setCalibrationDialogOpen: (v: boolean) => void
  tempCalibrationDistance: string
  setTempCalibrationDistance: (v: string) => void
  unitName: string
  setUnitName: (v: string) => void
  handleCalibrationSubmit: () => void

  // ── Performance CSS Injection ──
  performanceMode: 'high' | 'eco' | 'static'

  // ── Global Settings Dialog ──
  showGlobalSettingsDialog: boolean
  setShowGlobalSettingsDialog: (v: boolean) => void

  // ── Music Dialog ──
  showMusicDialog: boolean
  setShowMusicDialog: (v: boolean) => void
  audioCharacterId: string | null
  setAudioCharacterId: (v: string | null) => void
  tempZoneData: TempZoneData
  setTempZoneData: React.Dispatch<React.SetStateAction<TempZoneData>>
  saveMusicZone: () => void

  // ── GMTemplatesProvider & Drawers ──
  isNPCDrawerOpen: boolean
  setIsNPCDrawerOpen: (v: boolean) => void
  handleTemplateDragStart: (template: NPC) => void

  isObjectDrawerOpen: boolean
  setIsObjectDrawerOpen: (v: boolean) => void
  handleObjectDragStart: (template: ObjectTemplate) => void

  isSoundDrawerOpen: boolean
  setIsSoundDrawerOpen: (v: boolean) => void
  handleSoundDragStart: (sound: any) => void

  isUnifiedSearchOpen: boolean
  setIsUnifiedSearchOpen: (v: boolean) => void
  obstacles: Obstacle[]
  setObstacles: React.Dispatch<React.SetStateAction<Obstacle[]>>
  deleteFromRtdbWithHistory: (collectionName: string, docId: string, description?: string) => Promise<void>

  // ── Visibility Drawer ──
  visibilityMode: boolean
  toggleVisibilityMode: () => void
  visibilityState: VisibilityState

  // ── Audio Mixer Panel ──
  isAudioMixerOpen: boolean
  setIsAudioMixerOpen: (v: boolean) => void

  // ── Place NPC Modal ──
  showPlaceModal: boolean
  setShowPlaceModal: (v: boolean) => void
  draggedTemplate: NPC | null
  setDraggedTemplate: (v: NPC | null) => void
  setDropPosition: (v: { x: number; y: number } | null) => void
  handlePlaceConfirm: (config: { nombre: number; visibility: 'visible' | 'hidden' | 'ally' | 'invisible' }) => void

  // ── Place Object Modal ──
  showPlaceObjectModal: boolean
  setShowPlaceObjectModal: (v: boolean) => void
  draggedObjectTemplateForPlace: ObjectTemplate | null
  setDraggedObjectTemplateForPlace: (v: ObjectTemplate | null) => void
  setDropObjectPosition: (v: { x: number; y: number } | null) => void
  handlePlaceObjectConfirm: (config: { nombre: number; visibility: 'visible' | 'hidden' | 'custom'; visibleToPlayerIds: string[] }) => void
  characters: Character[]

  // ── Delete Confirmation Modal ──
  deleteModalOpen: boolean
  setDeleteModalOpen: (v: boolean) => void
  entityToDelete: EntityToDelete | null
  handleConfirmDelete: () => void

  // ── Background Selector ──
  showBackgroundSelector: boolean
  setShowBackgroundSelector: (v: boolean) => void
  handleBackgroundSelectLocal: (path: string) => void
}

// ── Component ───────────────────────────────────────────────────────────────

export default function MapDialogs(props: MapDialogsProps) {
  const {
    roomId,
    isMJ,
    selectedCityId,

    // Portal Config Dialog
    showPortalConfig,
    setShowPortalConfig,
    editingPortal,
    setEditingPortal,
    newPortalPos,
    setNewPortalPos,
    firstPortalPoint,
    setFirstPortalPoint,
    firstPortalId,
    setFirstPortalId,
    portalPlacementMode,

    // CreateNoteModal
    showCreateNoteModal,
    setShowCreateNoteModal,
    editingNote,
    setEditingNote,
    handleCreateNoteConfirm,

    // CharacterSheet
    showCharacterSheet,
    setShowCharacterSheet,
    selectedCharacterForSheet,
    setSelectedCharacterForSheet,

    // Calibration Dialog
    calibrationDialogOpen,
    setCalibrationDialogOpen,
    tempCalibrationDistance,
    setTempCalibrationDistance,
    unitName,
    setUnitName,
    handleCalibrationSubmit,

    // Performance CSS Injection
    performanceMode,

    // Global Settings Dialog
    showGlobalSettingsDialog,
    setShowGlobalSettingsDialog,

    // Music Dialog
    showMusicDialog,
    setShowMusicDialog,
    audioCharacterId,
    setAudioCharacterId,
    tempZoneData,
    setTempZoneData,
    saveMusicZone,

    // GMTemplatesProvider & Drawers
    isNPCDrawerOpen,
    setIsNPCDrawerOpen,
    handleTemplateDragStart,

    isObjectDrawerOpen,
    setIsObjectDrawerOpen,
    handleObjectDragStart,

    isSoundDrawerOpen,
    setIsSoundDrawerOpen,
    handleSoundDragStart,

    isUnifiedSearchOpen,
    setIsUnifiedSearchOpen,
    obstacles,
    setObstacles,
    deleteFromRtdbWithHistory,

    // Visibility Drawer
    visibilityMode,
    toggleVisibilityMode,
    visibilityState,

    // Audio Mixer Panel
    isAudioMixerOpen,
    setIsAudioMixerOpen,

    // Place NPC Modal
    showPlaceModal,
    setShowPlaceModal,
    draggedTemplate,
    setDraggedTemplate,
    setDropPosition,
    handlePlaceConfirm,

    // Place Object Modal
    showPlaceObjectModal,
    setShowPlaceObjectModal,
    draggedObjectTemplateForPlace,
    setDraggedObjectTemplateForPlace,
    setDropObjectPosition,
    handlePlaceObjectConfirm,
    characters,

    // Delete Confirmation Modal
    deleteModalOpen,
    setDeleteModalOpen,
    entityToDelete,
    handleConfirmDelete,

    // Background Selector
    showBackgroundSelector,
    setShowBackgroundSelector,
    handleBackgroundSelectLocal,
  } = props

  // ── Inline handler: clear all obstacles (used by UnifiedSearchDrawer + VisibilityDrawer) ──
  const handleClearAllObstacles = () => {
    const currentObstacles = [...obstacles]
    setObstacles([])
    Promise.all(currentObstacles.map(o => deleteFromRtdbWithHistory('obstacles', o.id, 'Suppression de tous les obstacles')))
  }

  return (
    <>
      {/* ── 1. Portal Config Dialog ── */}
      <PortalConfigDialog
        open={showPortalConfig}
        onOpenChange={(open) => {
          setShowPortalConfig(open)
          if (!open) {
            setFirstPortalPoint(null)
            setFirstPortalId(null)
            setNewPortalPos(null)
            setEditingPortal(null)
          }
        }}
        portal={editingPortal || (newPortalPos ? { x: newPortalPos.x, y: newPortalPos.y, radius: 50, portalType: portalPlacementMode || 'scene-change', targetSceneId: '', name: '', iconType: 'portal', visible: true, color: '#3b82f6' } : null)}
        onSave={async (portalData) => {
          if (!roomId) return

          if (editingPortal && editingPortal.id && editingPortal.portalType === 'same-map') {
            // Same-map portal: Update first portal + create second
            await updateDoc(doc(db, 'cartes', roomId, 'portals', editingPortal.id), {
              ...portalData,
              x: editingPortal.x,
              y: editingPortal.y,
              targetX: portalData.targetX,
              targetY: portalData.targetY,
              cityId: selectedCityId,
              name: portalData.name || 'Portail'
            })

            // Create Portal 2 (reverse direction)
            // IMPORTANT: Don't copy the ID from the first portal
            const { id, ...portalDataWithoutId } = portalData
            await addDoc(collection(db, 'cartes', roomId, 'portals'), {
              ...portalDataWithoutId,
              x: portalData.targetX,
              y: portalData.targetY,
              targetX: editingPortal.x,
              targetY: editingPortal.y,
              cityId: selectedCityId,
              name: portalData.name || 'Portail'
            })

            toast.success("Portails bidirectionnels créés")
          } else if (editingPortal && editingPortal.id) {
            // Update existing scene-change portal
            await updateDoc(doc(db, 'cartes', roomId, 'portals', editingPortal.id), {
              ...portalData,
              cityId: selectedCityId
            })
            toast.success("Portail modifié")
          } else if (newPortalPos) {
            // Create new portal
            if (portalData.portalType === 'same-map' && portalData.targetX !== undefined && portalData.targetY !== undefined) {
              // Same-map portal: create TWO portals for bidirectional teleportation

              // Portal 1: Entrance -> Exit
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: newPortalPos.x,
                y: newPortalPos.y,
                targetX: portalData.targetX,
                targetY: portalData.targetY,
                cityId: selectedCityId,
                name: portalData.name || 'Portail'
              })

              // Portal 2: Exit -> Entrance (reverse)
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: portalData.targetX,
                y: portalData.targetY,
                targetX: newPortalPos.x,
                targetY: newPortalPos.y,
                cityId: selectedCityId,
                name: portalData.name || 'Portail'
              })

              toast.success("Portails bidirectionnels créés")
            } else {
              // Scene-change portal: single portal
              await addDoc(collection(db, 'cartes', roomId, 'portals'), {
                ...portalData,
                x: newPortalPos.x,
                y: newPortalPos.y,
                cityId: selectedCityId
              })
              toast.success("Portail créé")
            }
          }

          setShowPortalConfig(false)
          setNewPortalPos(null)
          setEditingPortal(null)
          setFirstPortalPoint(null)
          setFirstPortalId(null)
        }}
        roomId={roomId || ''}
        currentCityId={selectedCityId}
      />

      {/* ── 2. Create Note Modal ── */}
      <CreateNoteModal
        isOpen={showCreateNoteModal}
        onClose={() => {
          setShowCreateNoteModal(false)
          setEditingNote(null)
        }}
        onConfirm={handleCreateNoteConfirm}
        initialValues={editingNote ? {
          text: editingNote.text,
          color: editingNote.color,
          fontSize: editingNote.fontSize,
          fontFamily: editingNote.fontFamily
        } : null}
      />

      {/* ── 3. Character Sheet ── */}
      {showCharacterSheet && selectedCharacterForSheet && roomId && (
        <CharacterSheet
          characterId={selectedCharacterForSheet}
          roomId={roomId}
          onClose={() => {
            setShowCharacterSheet(false)
            setSelectedCharacterForSheet(null)
          }}
        />
      )}

      {/* ── 4. Calibration Dialog ── */}
      <Dialog open={calibrationDialogOpen} onOpenChange={setCalibrationDialogOpen}>
        <DialogContent className="bg-[rgb(36,36,36)] text-[#c0a080] border-[#FFD700]">
          <DialogHeader>
            <DialogTitle>Étalonnage de la carte</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="mb-4 text-sm">Quelle distance représente la ligne que vous venez de tracer ?</p>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Label htmlFor="distVal">Distance</Label>
                <Input
                  id="distVal"
                  type="number"
                  value={tempCalibrationDistance}
                  onChange={(e) => setTempCalibrationDistance(e.target.value)}
                  placeholder="Ex: 1.5"
                  autoFocus
                />
              </div>
              <div className="w-24">
                <Label htmlFor="unitVal">Unité</Label>
                <Input
                  id="unitVal"
                  type="text"
                  value={unitName}
                  onChange={(e) => setUnitName(e.target.value)}
                  placeholder="m"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCalibrationDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleCalibrationSubmit} className="bg-[#FFD700] text-black hover:bg-[#e6c200]">Valider</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 5. Performance CSS Injection ── */}
      {performanceMode === 'static' && (
        <style dangerouslySetInnerHTML={{
          __html: `
            * {
              animation: none !important;
              transition: none !important;
            }
          `
        }} />
      )}

      {/* ── 6. Global Settings Dialog ── */}
      <GlobalSettingsDialog
        isOpen={showGlobalSettingsDialog}
        onOpenChange={setShowGlobalSettingsDialog}
        isMJ={isMJ}
      />

      {/* ── 7. Music Dialog ── */}
      {isMJ && (
        <Dialog open={showMusicDialog} onOpenChange={(open) => {
          setShowMusicDialog(open)
          if (!open) setAudioCharacterId(null)
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{audioCharacterId ? "Configurer Audio du Personnage" : "Ajouter une zone musicale"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="m-name" className="text-right">Nom</Label>
                <Input id="m-name" value={tempZoneData.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempZoneData(prev => ({ ...prev, name: e.target.value }))} className="col-span-3" />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="m-upload" className="text-right">Fichier MP3</Label>
                <div className="col-span-3 flex gap-2">
                  <Input
                    id="m-upload"
                    type="file"
                    accept="audio/*"
                    onChange={async (e: React.ChangeEvent<HTMLInputElement>) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        const storage = getStorage()
                        const storageRef = ref(storage, `audio / ${roomId}/${Date.now()}_${file.name}`)
                        try {
                          const snapshot = await uploadBytes(storageRef, file)
                          const downloadURL = await getDownloadURL(snapshot.ref)
                          setTempZoneData(prev => ({ ...prev, url: downloadURL }))
                        } catch (error) {
                          console.error("Upload failed", error)
                          alert("Upload failed!")
                        }
                      }
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="m-radius" className="text-right">Rayon</Label>
                <Input id="m-radius" type="number" value={tempZoneData.radius} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTempZoneData(prev => ({ ...prev, radius: Number(e.target.value) }))} className="col-span-3" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={saveMusicZone}>{audioCharacterId ? "Enregistrer" : "Créer"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── 8. GM Templates Provider - Drawers ── */}
      <GMTemplatesProvider roomId={roomId}>
        {/* NPC Template Drawer */}
        <NPCTemplateDrawer
          roomId={roomId}
          isOpen={isNPCDrawerOpen}
          onClose={() => setIsNPCDrawerOpen(false)}
          onDragStart={handleTemplateDragStart}
          currentCityId={selectedCityId}
        />

        <ObjectDrawer
          roomId={roomId}
          isOpen={isObjectDrawerOpen}
          onClose={() => setIsObjectDrawerOpen(false)}
          onDragStart={handleObjectDragStart}
          currentCityId={selectedCityId}
        />

        {/* Sound Drawer */}
        <SoundDrawer
          roomId={roomId}
          isOpen={isSoundDrawerOpen}
          onClose={() => setIsSoundDrawerOpen(false)}
          onDragStart={handleSoundDragStart}
          currentCityId={selectedCityId}
        />

        {/* Unified Search Drawer */}
        <UnifiedSearchDrawer
          roomId={roomId}
          isOpen={isUnifiedSearchOpen}
          onClose={() => setIsUnifiedSearchOpen(false)}
          onDragStart={(item) => {
            // Handle drag start based on item type
            if (item.type === 'sound') {
              handleSoundDragStart(item.data)
            } else if (item.type === 'object') {
              handleObjectDragStart(item.data as ObjectTemplate)
            } else if (item.type === 'npc') {
              handleTemplateDragStart(item.data as NPC)
            }
          }}
          currentCityId={selectedCityId}
          vs={visibilityState}
          onClearAllObstacles={handleClearAllObstacles}
        />
      </GMTemplatesProvider>

      {/* ── 9. Visibility Drawer ── */}
      <VisibilityDrawer
        isOpen={visibilityMode}
        onClose={toggleVisibilityMode}
        vs={visibilityState}
        onClearAllObstacles={handleClearAllObstacles}
      />

      {/* ── 10. Audio Mixer Panel ── */}
      <AudioMixerPanel
        isOpen={isAudioMixerOpen}
        onClose={() => setIsAudioMixerOpen(false)}
      />

      {/* ── 11. Place NPC Modal ── */}
      <PlaceNPCModal
        isOpen={showPlaceModal}
        template={draggedTemplate}
        onClose={() => {
          setShowPlaceModal(false)
          setDraggedTemplate(null)
          setDropPosition(null)
        }}
        onConfirm={handlePlaceConfirm}
      />

      {/* ── 12. Place Object Modal ── */}
      <PlaceObjectModal
        isOpen={showPlaceObjectModal}
        template={draggedObjectTemplateForPlace}
        players={characters.filter(c => c.type === 'joueurs')}
        onClose={() => {
          setShowPlaceObjectModal(false)
          setDraggedObjectTemplateForPlace(null)
          setDropObjectPosition(null)
        }}
        onConfirm={handlePlaceObjectConfirm}
      />

      {/* ── 13. Delete Confirmation Modal ── */}
      <DeleteConfirmationModal
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        entity={entityToDelete}
        onConfirm={handleConfirmDelete}
      />

      {/* ── 14. Background Selector ── */}
      <BackgroundSelector
        isOpen={showBackgroundSelector}
        onClose={() => setShowBackgroundSelector(false)}
        onSelectLocal={handleBackgroundSelectLocal}
        roomId={String(roomId)}
      />
    </>
  )
}
