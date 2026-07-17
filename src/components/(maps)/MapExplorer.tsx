"use client";

import { useEffect, useState } from "react";
import { Pencil, ChevronDown, Plus, X } from "lucide-react";
import { useGameSystem } from "@/modules/game-system/useGameSystem";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MapCanvas } from "./MapCanvas";
import { MapDetail, MapMarkerDetail, makeMapId } from "@/components/(fiches)/game-system/MapPanel";
import type { MapConfig } from "@/modules/game-system/types";

// ─────────────────────────────────────────────────────────────────────────────
// Panel "Carte" — onglet natif de sidebar TOUJOURS visible (MJ + joueurs), même sans carte encore
// créée : affiche alors un message d'invite plutôt que d'être masqué. Plusieurs cartes distinctes
// possibles (gameSystem.maps) — un sélecteur apparaît dès qu'il y en a plus d'une. Pour le MJ, la
// gestion complète (ajout/suppression de carte, upload d'image, placement de marqueurs) se fait
// DIRECTEMENT ici via updateMaps() du hook (pas besoin de repasser par l'éditeur de règles complet) —
// mêmes composants que MapPanel.tsx (GameSystemManagerPanel), réutilisés tels quels.
// ─────────────────────────────────────────────────────────────────────────────

export default function MapExplorer({ roomId, isMJ }: { roomId: string; isMJ: boolean }) {
  const { gameSystem, updateMaps } = useGameSystem(roomId);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const maps = gameSystem.maps ?? [];
  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0];

  useEffect(() => {
    if ((!activeMap || !maps.some((m) => m.id === activeMapId)) && maps[0]) setActiveMapId(maps[0].id);
  }, [activeMap, activeMapId, maps]);

  const selected = activeMap?.markers.find((m) => m.id === selectedMarkerId);

  const handleAddMap = () => {
    const id = makeMapId();
    const next: MapConfig = { id, label: '', image: '', markers: [] };
    updateMaps([...maps, next]);
    setActiveMapId(id);
    setIsEditing(true);
  };
  const handleRemoveMap = (id: string) => {
    updateMaps(maps.filter((m) => m.id !== id));
    setIsEditing(false);
  };

  if (maps.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 text-sm text-center" style={{ color: "var(--text-secondary)", background: "var(--bg-card)" }}>
        <div>
          Aucune carte configurée pour ce système.
          {isMJ && (
            <button onClick={handleAddMap} className="flex items-center gap-1.5 mx-auto mt-3 text-xs px-3 py-2 rounded-lg border transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]" style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}>
              <Plus size={14} /> Créer une carte
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!activeMap) return null;

  return (
    <div className="w-full h-full flex flex-col" style={{ background: "var(--bg-card)" }}>
      <div className="p-3 border-b flex items-center justify-between shrink-0 gap-2" style={{ borderColor: "var(--border-color)" }}>
        {maps.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 text-base font-bold hover:opacity-80 min-w-0" style={{ fontFamily: "var(--font-title)", color: "var(--text-primary)" }}>
                <span className="truncate">{activeMap.label || "(sans nom)"}</span> <ChevronDown size={16} className="shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {maps.map((m) => (
                <DropdownMenuItem key={m.id} onClick={() => { setActiveMapId(m.id); setSelectedMarkerId(null); }}>
                  {m.label || "(sans nom)"}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <h2 className="text-base font-bold truncate" style={{ fontFamily: "var(--font-title)", color: "var(--text-primary)" }}>{activeMap.label || "(sans nom)"}</h2>
        )}
        {isMJ && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleAddMap}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors hover:border-[var(--accent-brown)] hover:text-[var(--accent-brown)]"
              style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
            >
              <Plus size={12} /> Nouvelle carte
            </button>
            <button
              onClick={() => setIsEditing((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors"
              style={{
                borderColor: isEditing ? 'var(--accent-brown)' : 'var(--border-color)',
                color: isEditing ? 'var(--accent-brown)' : 'var(--text-secondary)',
              }}
            >
              {isEditing ? <X size={12} /> : <Pencil size={12} />} {isEditing ? 'Terminer' : 'Éditer'}
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {isMJ && isEditing ? (
          <div className="p-4">
            <MapDetail
              maps={maps}
              onChange={updateMaps}
              roomId={roomId}
              mapId={activeMap.id}
              onRemove={() => handleRemoveMap(activeMap.id)}
              onSelectMarker={setSelectedMarkerId}
            />
            {selectedMarkerId && activeMap.markers.some((m) => m.id === selectedMarkerId) && (
              <div className="mt-6 pt-6 border-t" style={{ borderColor: 'var(--border-color)' }}>
                <MapMarkerDetail maps={maps} onChange={updateMaps} mapId={activeMap.id} markerId={selectedMarkerId} />
              </div>
            )}
          </div>
        ) : activeMap.image ? (
          <MapCanvas backgroundUrl={activeMap.image} markers={activeMap.markers} mode="view" onMarkerClick={setSelectedMarkerId} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sm text-center p-6" style={{ color: "var(--text-secondary)" }}>
            Cette carte n&apos;a pas encore d&apos;image de fond.
          </div>
        )}
      </div>

      <Dialog open={!isEditing && !!selected} onOpenChange={(open) => !open && setSelectedMarkerId(null)}>
        <DialogContent borderTrail className="bg-transparent border-none shadow-none p-0 max-w-md">
          <DialogTitle className="sr-only">{selected?.name || "Marqueur"}</DialogTitle>
          {selected && (
            <div className="p-6 rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
              <h3 className="text-xl font-bold mb-3" style={{ color: "var(--accent-brown)", fontFamily: "var(--font-title)" }}>
                {selected.name || "(sans nom)"}
              </h3>
              {selected.image && <img src={selected.image} alt="" className="w-full rounded-lg mb-3" />}
              {selected.description && <p className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>{selected.description}</p>}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
