'use client';

import React, { useState } from 'react';
import { Trash2, Upload, Loader2 } from 'lucide-react';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { uploadWithQuota } from '@/lib/storageHelper';
import { toast } from 'sonner';
import { MapCanvas } from '@/components/(maps)/MapCanvas';
import type { MapConfig, MapMarker } from '@/modules/game-system/types';

// ─────────────────────────────────────────────────────────────────────────────
// Gestion des Cartes génériques (fond image + marqueurs cliquables, ex carte galactique) — utilisé à
// la fois par l'éditeur de règles complet (GameSystemManagerPanel.tsx, liste à gauche/détail à droite,
// même convention que SpecializationsPanel.tsx/LocationsPanel) ET directement depuis l'onglet Carte
// (MapExplorer.tsx) pour que le MJ puisse gérer ses cartes (ajouter/supprimer/uploader) SANS repasser
// par l'éditeur de règles. D'où la forme générique `maps`/`onChange` (pas `Draft`/`onSave`) : chaque
// appelant sait où écrire (GameSystemManagerPanel via son Draft local, MapExplorer via
// useGameSystem().updateMaps qui résout lui-même le bon doc Firestore). Plusieurs cartes distinctes
// possibles (galaxie, ville...), chacune avec son propre fond + ses propres marqueurs. Contrairement
// aux Lieux/Spécialisations, les cartes vivent INLINE sur GameSystemDefinition.maps (pas un ContentDoc
// Firestore séparé) pour voyager dans le MÊME export JSON que le reste des règles — l'upload d'image
// est la seule écriture Firestore/Storage directe ici (Firebase Storage, même mécanisme que les images
// de personnage/PNJ, cf personnages.tsx), qui ne renvoie qu'une URL ensuite stockée via onChange.
// ─────────────────────────────────────────────────────────────────────────────

export function makeMapId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `map-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeMarkerId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `marker-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MapsOverviewPanel({ count }: { count: number }) {
  return (
    <div>
      <div className="space-y-0.5 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}>Cartes</h3>
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          Des cartes de fond zoomables avec des marqueurs cliquables (ex Carte Galactique, Carte de Ville).
          Une par une dans la liste à gauche — le joueur choisit la carte à consulter si plusieurs existent.
        </p>
      </div>
      <p className="text-[11px] max-w-md" style={{ color: 'var(--text-secondary)' }}>{count} carte{count > 1 ? 's' : ''} définie{count > 1 ? 's' : ''}.</p>
    </div>
  );
}

export function MapDetail({ maps, onChange, roomId, mapId, onRemove, onSelectMarker }: {
  maps: MapConfig[];
  onChange: (next: MapConfig[]) => void | Promise<void>;
  roomId?: string | null;
  mapId: string;
  onRemove: () => void;
  /** Optionnel : appelé au clic sur un marqueur existant (en plus de son déplacement au glisser) —
   *  utilisé par MapExplorer.tsx pour ouvrir MapMarkerDetail sans dupliquer un second aperçu. */
  onSelectMarker?: (markerId: string) => void;
}) {
  const [isUploading, setIsUploading] = useState(false);
  const map = maps.find((m) => m.id === mapId);
  if (!map) return null;

  const updateMap = (patch: Partial<MapConfig>) => {
    onChange(maps.map((m) => (m.id === mapId ? { ...m, ...patch } : m)));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setIsUploading(true);
    try {
      const storage = getStorage();
      const path = `maps/${mapId}-${Date.now()}-${file.name}`;
      const imageRef = ref(storage, path);
      const url = roomId ? await uploadWithQuota(imageRef, file, roomId) : await (async () => { await uploadBytes(imageRef, file); return getDownloadURL(imageRef); })();
      updateMap({ image: url });
    } catch (error) {
      console.error('[MapDetail] erreur upload image:', error);
      toast.error("Erreur lors de l'envoi de l'image.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleAddMarker = (x: number, y: number) => {
    const next: MapMarker = { id: makeMarkerId(), name: '', x, y };
    updateMap({ markers: [...map.markers, next] });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={map.label}
          onChange={(e) => updateMap({ label: e.target.value })}
          placeholder="Nom de la carte (ex Carte Galactique)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={onRemove} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>Image de fond</label>
          <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border border-dashed cursor-pointer transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)] w-fit" style={{ borderColor: 'var(--border-color)', color: 'var(--text-secondary)' }}>
            {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {isUploading ? 'Envoi en cours…' : map.image ? "Remplacer l'image" : 'Uploader une image'}
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isUploading} />
          </label>
        </div>

        {map.image ? (
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider block" style={{ color: 'var(--text-secondary)' }}>
              Aperçu — cliquez pour ajouter un marqueur, glissez un marqueur existant pour le repositionner
            </label>
            <div className="h-[420px] rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border-color)' }}>
              <MapCanvas
                backgroundUrl={map.image}
                markers={map.markers}
                mode="edit"
                onBackgroundClick={handleAddMarker}
                onMarkerMove={(id, x, y) => updateMap({ markers: map.markers.map((m) => (m.id === id ? { ...m, x, y } : m)) })}
                onMarkerClick={onSelectMarker}
              />
            </div>
          </div>
        ) : (
          <p className="text-[11px] italic" style={{ color: 'var(--text-secondary)' }}>Uploadez une image de fond pour commencer à placer des marqueurs.</p>
        )}

        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{map.markers.length} marqueur{map.markers.length > 1 ? 's' : ''} défini{map.markers.length > 1 ? 's' : ''}.</p>
      </div>
    </div>
  );
}

export function MapMarkerDetail({ maps, onChange, mapId, markerId }: {
  maps: MapConfig[];
  onChange: (next: MapConfig[]) => void | Promise<void>;
  mapId: string;
  markerId: string;
}) {
  const map = maps.find((m) => m.id === mapId);
  const marker = map?.markers.find((m) => m.id === markerId);
  if (!map || !marker) return null;

  const updateMarker = (patch: Partial<MapMarker>) => {
    onChange(maps.map((m) => (m.id === mapId ? { ...m, markers: m.markers.map((mk) => (mk.id === markerId ? { ...mk, ...patch } : mk)) } : m)));
  };
  const removeMarker = () => {
    onChange(maps.map((m) => (m.id === mapId ? { ...m, markers: m.markers.filter((mk) => mk.id !== markerId) } : m)));
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pb-4 mb-4 border-b" style={{ borderColor: 'var(--border-color)' }}>
        <input
          value={marker.name}
          onChange={(e) => updateMarker({ name: e.target.value })}
          placeholder="Nom du marqueur (ex Coruscant)"
          className="text-lg font-bold bg-transparent border-none outline-none flex-1 min-w-0 placeholder:opacity-40"
          style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-title)' }}
        />
        <button onClick={removeMarker} className="text-[var(--text-secondary)] hover:text-red-400 transition-colors p-1.5 shrink-0"><Trash2 size={16} /></button>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-secondary)' }}>Description</label>
          <textarea
            value={marker.description ?? ''}
            onChange={(e) => updateMarker({ description: e.target.value })}
            rows={4}
            className="w-full bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm resize-y"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>

        <label className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
          Image (URL)
          <input
            type="text"
            value={marker.image ?? ''}
            onChange={(e) => updateMarker({ image: e.target.value })}
            placeholder="https://..."
            className="flex-1 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
            style={{ color: 'var(--text-primary)' }}
          />
        </label>

        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <label className="flex items-center gap-1.5">
            Position X (%)
            <input
              type="number" min={0} max={100} step={0.1}
              value={Math.round(marker.x * 1000) / 10}
              onChange={(e) => updateMarker({ x: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
              className="w-20 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </label>
          <label className="flex items-center gap-1.5">
            Position Y (%)
            <input
              type="number" min={0} max={100} step={0.1}
              value={Math.round(marker.y * 1000) / 10}
              onChange={(e) => updateMarker({ y: Math.min(1, Math.max(0, Number(e.target.value) / 100)) })}
              className="w-20 bg-[var(--bg-dark)] border border-[var(--border-color)] rounded px-2 py-1.5 text-sm"
              style={{ color: 'var(--text-primary)' }}
            />
          </label>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>Le déplacement principal se fait en glissant le marqueur sur l&apos;aperçu de la carte.</p>
      </div>
    </div>
  );
}
