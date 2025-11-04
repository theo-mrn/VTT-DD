'use client'

import { useState } from 'react';
import SyncedYouTubePlayer from '@/components/SyncedYouTubePlayer';
import { Music, X, Maximize2, Minimize2, ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGame } from '@/contexts/GameContext';
import { Card } from '@/components/ui/card';

interface FloatingMusicPlayerProps {
  roomId?: string;
  defaultExpanded?: boolean;
  defaultPosition?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

/**
 * Composant de lecteur musical flottant
 * 
 * Usage :
 * ```tsx
 * import FloatingMusicPlayer from '@/components/FloatingMusicPlayer';
 * 
 * // Dans votre page/composant
 * <FloatingMusicPlayer />
 * ```
 * 
 * Props :
 * - roomId: ID de la salle (optionnel, utilise user.roomId par défaut)
 * - defaultExpanded: Lecteur étendu par défaut (default: false)
 * - defaultPosition: Position du lecteur (default: 'bottom-right')
 */
export default function FloatingMusicPlayer({ 
  roomId, 
  defaultExpanded = false,
  defaultPosition = 'bottom-right'
}: FloatingMusicPlayerProps) {
  const { user } = useGame();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isVisible, setIsVisible] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const effectiveRoomId = roomId || user?.roomId;

  // Position CSS classes
  const positionClasses = {
    'bottom-right': 'bottom-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'top-right': 'top-4 right-4',
    'top-left': 'top-4 left-4'
  };

  // Si pas visible, afficher juste un bouton pour réouvrir
  if (!isVisible) {
    return (
      <Button
        onClick={() => setIsVisible(true)}
        className={`fixed ${positionClasses[defaultPosition]} z-50 shadow-lg`}
        size="icon"
        variant="default"
        title="Ouvrir le lecteur musical"
      >
        <Music className="h-4 w-4" />
      </Button>
    );
  }

  // Si pas de room, ne pas afficher
  if (!effectiveRoomId) {
    return null;
  }

  return (
    <Card 
      className={`fixed ${positionClasses[defaultPosition]} z-50 transition-all duration-300 shadow-2xl ${
        isExpanded ? 'w-96' : 'w-80'
      } ${isCollapsed ? 'h-14' : 'auto'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Musique d'ambiance</span>
        </div>
        <div className="flex gap-1">
          {/* Collapse/Expand vertically */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? "Déplier" : "Réduire"}
          >
            {isCollapsed ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Expand/Minimize horizontally */}
          {!isCollapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsExpanded(!isExpanded)}
              title={isExpanded ? "Rétrécir" : "Agrandir"}
            >
              {isExpanded ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsVisible(false)}
            title="Fermer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isCollapsed && (
        <div className="p-4">
          <SyncedYouTubePlayer roomId={effectiveRoomId} />
        </div>
      )}
    </Card>
  );
}

