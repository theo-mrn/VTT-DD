"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapPin, Play, Pause, Volume2, VolumeX } from "lucide-react";
import type { MapMarker } from "@/modules/game-system/types";

// ─────────────────────────────────────────────────────────────────────────────
// Moteur de rendu générique zoom/pan + marqueurs positionnés (fraction 0-1 de l'image de fond),
// partagé par l'éditeur MJ (mode "edit") et la vue joueur (mode "view"). Pas de canvas : une simple
// image + des <div> de marqueurs positionnés en absolu dans un conteneur transformé (translate+scale),
// suffisant ici car il n'y a pas de scène complexe à redessiner à chaque frame (contrairement à la
// carte de table principale). Formules de zoom autour d'un point réimplémentées ici en autonome
// (inspirées de src/app/[roomid]/map/page.tsx, jamais importées — ce panel n'a pas besoin du reste
// de la logique de la carte tactique : obstacles, personnages, calques...).
// ─────────────────────────────────────────────────────────────────────────────

// zoom=1 correspond à fitScale (l'image "contient" tout juste le conteneur, cf fitScale ci-dessous) —
// interdit de dézoomer plus bas, sinon l'image flotte dans un vide au lieu que ses bords touchent
// systématiquement au moins un côté du conteneur. Pas de borne maximale : on peut zoomer à l'infini.
const MIN_ZOOM = 1;

/** Extensions vidéo reconnues pour le fond de carte — mêmes conteneurs que ceux acceptés à l'upload
 *  (cf MapPanel.tsx). L'URL Firebase Storage porte le nom de fichier d'origine (avec extension) avant
 *  la query string `?alt=media&token=…`, d'où le découpage sur '?' avant test. */
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv', '.ogg', '.mov', '.m4v'];

/** Vrai si l'URL de fond désigne une vidéo plutôt qu'une image. Heuristique sur l'extension : le
 *  champ `image` de MapConfig ne stocke qu'une URL, sans type MIME — et une data: URL porte son type
 *  directement. Se trompe silencieusement du bon côté : un faux négatif rend une <img> cassée, jamais
 *  un crash. */
export function isVideoUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return url.startsWith('data:video/');
  const withoutQuery = url.split('?')[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

export interface MapCanvasProps {
  backgroundUrl: string;
  markers: MapMarker[];
  /** 'view' : clic sur un marqueur => onMarkerClick (lecture seule, pas de déplacement).
   *  'edit' : clic sur le fond => onBackgroundClick(x,y) (nouveau marqueur) ; marqueurs existants
   *  déplaçables au glisser => onMarkerMove(id,x,y) en fin de geste. */
  mode: "view" | "edit";
  onMarkerClick?: (id: string) => void;
  onBackgroundClick?: (x: number, y: number) => void;
  onMarkerMove?: (id: string, x: number, y: number) => void;
  selectedMarkerId?: string | null;
}

function clamp(min: number, max: number, v: number): number {
  return Math.min(max, Math.max(min, v));
}

export function MapCanvas({
  backgroundUrl,
  markers,
  mode,
  onMarkerClick,
  onBackgroundClick,
  onMarkerMove,
  selectedMarkerId,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  const panStateRef = useRef<{ startX: number; startY: number; startOffset: { x: number; y: number } } | null>(null);
  const pinchStateRef = useRef<{ distance: number; zoom: number; worldX: number; worldY: number } | null>(null);
  const dragMarkerRef = useRef<{ id: string; moved: boolean } | null>(null);
  const draggingBackgroundRef = useRef(false);
  // Position temporaire du marqueur en cours de glisser (mode edit) — le parent (source de vérité)
  // ne reçoit la position finale qu'au pointerup via onMarkerMove ; jamais de mutation des props.
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);

  const fitScale = (() => {
    if (!naturalSize || !containerRef.current) return 1;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return 1;
    return Math.min(rect.width / naturalSize.width, rect.height / naturalSize.height);
  })();

  // Empêche l'image scalée de se décoller des bords du conteneur (jamais de vide visible autour) :
  // borne offset.x/y entre 0 (bord gauche/haut aligné) et (taille scalée - taille conteneur) (bord
  // droit/bas aligné). Si l'image scalée est plus petite que le conteneur sur un axe (peut arriver au
  // MIN_ZOOM exact selon l'arrondi), centre cet axe au lieu de le coller à 0.
  const clampOffset = useCallback(
    (raw: { x: number; y: number }, atZoom: number) => {
      if (!naturalSize || !containerRef.current) return raw;
      const rect = containerRef.current.getBoundingClientRect();
      const scaledWidth = naturalSize.width * fitScale * atZoom;
      const scaledHeight = naturalSize.height * fitScale * atZoom;
      const clampAxis = (value: number, scaledSize: number, containerSize: number) => {
        if (scaledSize <= containerSize) return (scaledSize - containerSize) / 2;
        return clamp(0, scaledSize - containerSize, value);
      };
      return {
        x: clampAxis(raw.x, scaledWidth, rect.width),
        y: clampAxis(raw.y, scaledHeight, rect.height),
      };
    },
    [naturalSize, fitScale],
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current!.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      return {
        worldX: (pointerX + offset.x) / (fitScale * zoom),
        worldY: (pointerY + offset.y) / (fitScale * zoom),
        pointerX,
        pointerY,
      };
    },
    [offset, fitScale, zoom],
  );

  const zoomAroundPoint = useCallback(
    (pointerX: number, pointerY: number, worldX: number, worldY: number, newZoomRaw: number) => {
      const newZoom = Math.max(MIN_ZOOM, newZoomRaw);
      setOffset(clampOffset({
        x: worldX * fitScale * newZoom - pointerX,
        y: worldY * fitScale * newZoom - pointerY,
      }, newZoom));
      setZoom(newZoom);
    },
    [fitScale, clampOffset],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      const { worldX, worldY, pointerX, pointerY } = screenToWorld(e.clientX, e.clientY);
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAroundPoint(pointerX, pointerY, worldX, worldY, zoom * factor);
    },
    [screenToWorld, zoomAroundPoint, zoom],
  );

  // Écouteur natif non-passif : un onWheel JSX classique reste "passif" sur certains
  // navigateurs (le wheel du composant zoome/scrolle ALORS AUSSI la page entière derrière), rendant
  // preventDefault() inefficace — { passive: false } est indispensable pour bloquer réellement le
  // scroll/zoom natif de la page pendant qu'on zoome la carte.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Pan (glisser le fond) ──
  const handleBackgroundMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      draggingBackgroundRef.current = true;
      panStateRef.current = { startX: e.clientX, startY: e.clientY, startOffset: offset };
    },
    [offset],
  );

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragMarkerRef.current && naturalSize) {
      const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
      dragMarkerRef.current.moved = true;
      setDragPreview({
        id: dragMarkerRef.current.id,
        x: clamp(0, 1, worldX / naturalSize.width),
        y: clamp(0, 1, worldY / naturalSize.height),
      });
      return;
    }
    if (draggingBackgroundRef.current && panStateRef.current) {
      const { startX, startY, startOffset } = panStateRef.current;
      setOffset(clampOffset({ x: startOffset.x - (e.clientX - startX), y: startOffset.y - (e.clientY - startY) }, zoom));
    }
  }, [screenToWorld, naturalSize, clampOffset, zoom]);

  const handleMouseUp = useCallback(() => {
    draggingBackgroundRef.current = false;
    panStateRef.current = null;
    if (dragMarkerRef.current) {
      const { id, moved } = dragMarkerRef.current;
      if (moved && dragPreview && onMarkerMove) onMarkerMove(id, dragPreview.x, dragPreview.y);
      dragMarkerRef.current = null;
      setDragPreview(null);
    }
  }, [dragPreview, onMarkerMove]);

  const handleBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (mode !== "edit" || !onBackgroundClick || !naturalSize) return;
      const { worldX, worldY } = screenToWorld(e.clientX, e.clientY);
      onBackgroundClick(clamp(0, 1, worldX / naturalSize.width), clamp(0, 1, worldY / naturalSize.height));
    },
    [mode, onBackgroundClick, naturalSize, screenToWorld],
  );

  const handleMarkerMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (mode === "edit") {
        dragMarkerRef.current = { id, moved: false };
      }
    },
    [mode],
  );

  const handleMarkerClick = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (dragMarkerRef.current?.moved) return; // évite d'ouvrir la popup juste après un glisser
      onMarkerClick?.(id);
    },
    [onMarkerClick],
  );

  // ── Pincement tactile (2 doigts) : zoome autour du point médian, formule identique au wheel ──
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;
    const [t1, t2] = [e.touches[0], e.touches[1]];
    const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    const midX = (t1.clientX + t2.clientX) / 2;
    const midY = (t1.clientY + t2.clientY) / 2;
    const { worldX, worldY } = screenToWorld(midX, midY);
    pinchStateRef.current = { distance, zoom, worldX, worldY };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length === 2 && pinchStateRef.current) {
        e.preventDefault();
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        const midX = (t1.clientX + t2.clientX) / 2;
        const midY = (t1.clientY + t2.clientY) / 2;
        const { distance: startDistance, zoom: startZoom, worldX, worldY } = pinchStateRef.current;
        const newZoom = startZoom * (distance / startDistance);
        const rect = containerRef.current!.getBoundingClientRect();
        zoomAroundPoint(midX - rect.left, midY - rect.top, worldX, worldY, newZoom);
        return;
      }
      if (e.touches.length === 1 && !pinchStateRef.current) {
        e.preventDefault();
        const touch = e.touches[0];
        if (!panStateRef.current) {
          panStateRef.current = { startX: touch.clientX, startY: touch.clientY, startOffset: offset };
        } else {
          const { startX, startY, startOffset } = panStateRef.current;
          setOffset(clampOffset({ x: startOffset.x - (touch.clientX - startX), y: startOffset.y - (touch.clientY - startY) }, zoom));
        }
      }
    },
    [zoomAroundPoint, offset, clampOffset, zoom],
  );

  const handleTouchEnd = useCallback(() => {
    pinchStateRef.current = null;
    panStateRef.current = null;
  }, []);

  const isVideo = isVideoUrl(backgroundUrl);

  // ── Contrôles du fond vidéo ────────────────────────────────────────────────
  // L'état miroir (isPlaying/isMuted) suit les événements de l'élément plutôt que d'être la source de
  // vérité : la lecture peut changer sans passer par nos boutons (autoplay refusé par le navigateur,
  // onde de fin de boucle, contrôles natifs de l'OS), et un état piloté uniquement par les clics
  // finirait désynchronisé de la vidéo réellement affichée.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // React n'applique pas fiablement l'attribut JSX `muted` à la PROPRIÉTÉ DOM correspondante (écart
  // connu attribut/propriété) ; sans cette pose explicite, l'autoplay peut être refusé par le
  // navigateur qui considère la vidéo comme non muette.
  const applyVideoRef = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) el.muted = true;
  }, []);
  const [isPlaying, setIsPlaying] = useState(true);
  // Démarre muet : `muted` est la condition pour que l'autoplay soit autorisé. Le son ne peut être
  // activé qu'ensuite, par un geste explicite de l'utilisateur — ce que fait le bouton.
  const [isMuted, setIsMuted] = useState(true);
  const [volume, setVolume] = useState(1);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => { /* lecture refusée : l'événement onPause garde l'état juste */ });
    else el.pause();
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const nextMuted = !el.muted;
    el.muted = nextMuted;
    // Rallumer le son alors que le volume est à zéro ne produirait rien d'audible : on remonte à un
    // niveau utile plutôt que de laisser croire à une panne.
    if (!nextMuted && el.volume === 0) {
      el.volume = 1;
      setVolume(1);
    }
    setIsMuted(nextMuted);
  }, []);

  const handleVolumeChange = useCallback((next: number) => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = next;
    // Descendre à 0 revient à couper le son ; en remonter le rétablit — sinon le bouton et le curseur
    // afficheraient deux vérités différentes.
    el.muted = next === 0;
    setVolume(next);
    setIsMuted(next === 0);
  }, []);

  // Dimensions naturelles du média (image OU vidéo) : identiques dans leurs effets, seule la source
  // de l'information diffère (naturalWidth vs videoWidth). Centre le média dès le chargement — zoom=1
  // (== fitScale) ne remplit exactement le conteneur que sur UN axe ; sans ceci l'autre resterait
  // collé en haut/gauche. Calcul local (pas clampOffset, qui dépend d'un naturalSize pas encore
  // reflété dans le state).
  const handleMediaSize = useCallback((width: number, height: number) => {
    if (!width || !height) return;
    setNaturalSize({ width, height });
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect && rect.width > 0 && rect.height > 0) {
      const initialFitScale = Math.min(rect.width / width, rect.height / height);
      setOffset({
        x: (width * initialFitScale - rect.width) / 2,
        y: (height * initialFitScale - rect.height) / 2,
      });
    }
  }, []);

  // Changement de fond (ex le MJ remplace l'image par une vidéo) : les dimensions du média précédent
  // ne valent plus rien. Sans reset, fitScale resterait calculé sur l'ancienne taille jusqu'au
  // chargement du nouveau média, avec un cadrage faux entre-temps.
  useEffect(() => {
    setNaturalSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    // L'état des contrôles décrit le média PRÉCÉDENT : une nouvelle vidéo redémarre en lecture
    // automatique et muette (seul mode où l'autoplay est autorisé), pas dans l'état laissé par
    // l'ancienne — sinon les boutons afficheraient "en pause" sur une vidéo qui joue.
    setIsPlaying(true);
    setIsMuted(true);
    setVolume(1);
  }, [backgroundUrl]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-black/40 select-none"
      style={{ cursor: mode === "edit" ? "crosshair" : draggingBackgroundRef.current ? "grabbing" : "grab" }}
      onMouseDown={handleBackgroundMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleBackgroundClick}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <div
        style={{
          position: "absolute",
          width: naturalSize?.width ?? 0,
          height: naturalSize?.height ?? 0,
          transform: `translate(${-offset.x}px, ${-offset.y}px) scale(${fitScale * zoom})`,
          transformOrigin: "top left",
        }}
      >
        {isVideo ? (
          // Fond vidéo : mêmes dimensions naturelles (videoWidth/Height) et même centrage initial que
          // l'image, donc tout le zoom/pan/positionnement des marqueurs fonctionne à l'identique.
          // muted est requis pour que l'autoplay démarre (politique des navigateurs) ; playsInline
          // évite le passage en plein écran sur iOS.
          <video
            ref={applyVideoRef}
            src={backgroundUrl}
            autoPlay
            loop
            muted
            playsInline
            draggable={false}
            className="max-w-none pointer-events-none"
            onLoadedMetadata={(e) => handleMediaSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onVolumeChange={(e) => {
              setIsMuted(e.currentTarget.muted);
              setVolume(e.currentTarget.volume);
            }}
          />
        ) : (
          <img
            src={backgroundUrl}
            alt=""
            draggable={false}
            className="max-w-none pointer-events-none"
            onLoad={(e) => handleMediaSize(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          />
        )}
        {naturalSize &&
          markers.map((marker) => {
            const pos = dragPreview?.id === marker.id ? dragPreview : marker;
            return (
            <div
              key={marker.id}
              onMouseDown={(e) => handleMarkerMouseDown(e, marker.id)}
              onClick={(e) => handleMarkerClick(e, marker.id)}
              style={{
                position: "absolute",
                left: pos.x * naturalSize.width,
                top: pos.y * naturalSize.height,
                transform: `translate(-50%, -100%) scale(${1 / (fitScale * zoom)})`,
                transformOrigin: "bottom center",
                cursor: mode === "edit" ? "grab" : "pointer",
              }}
              className="flex flex-col items-center group"
            >
              <MapPin
                className="w-6 h-6 drop-shadow-md transition-transform group-hover:scale-110"
                style={{ color: selectedMarkerId === marker.id ? "var(--accent-brown)" : "#e2c98f" }}
                fill="currentColor"
                strokeWidth={1.5}
              />
              <span className="text-[10px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded whitespace-nowrap -mt-1">
                {marker.name || "(sans nom)"}
              </span>
            </div>
            );
          })}
      </div>

      {/* Contrôles du fond vidéo — HORS du conteneur transformé, sinon ils seraient zoomés/déplacés
          avec la carte. stopPropagation sur les gestes : sans ça, cliquer un bouton déclencherait
          aussi le pan du fond (et, en mode edit, la création d'un marqueur sous la barre). */}
      {isVideo && naturalSize && (
        <div
          className="absolute bottom-3 left-3 z-10 flex items-center gap-1 rounded-lg px-1.5 py-1 backdrop-blur-sm"
          style={{ background: "rgba(0,0,0,0.65)", border: "1px solid rgba(255,255,255,0.12)" }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <button
            onClick={togglePlay}
            title={isPlaying ? "Pause" : "Lecture"}
            aria-label={isPlaying ? "Mettre en pause la vidéo de fond" : "Lire la vidéo de fond"}
            className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isPlaying ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={toggleMute}
            title={isMuted ? "Activer le son" : "Couper le son"}
            aria-label={isMuted ? "Activer le son de la vidéo de fond" : "Couper le son de la vidéo de fond"}
            className="p-1.5 rounded text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => handleVolumeChange(Number(e.target.value))}
            title="Volume"
            aria-label="Volume de la vidéo de fond"
            className="w-20 h-1 cursor-pointer"
            style={{ accentColor: "var(--accent-brown)" }}
          />
        </div>
      )}
    </div>
  );
}
