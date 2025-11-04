'use client'

import { useState } from 'react';
import SyncedYouTubePlayer from '@/components/SyncedYouTubePlayer';
import { Music, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FloatingMusicProps {
  roomId: string;
}

export default function FloatingMusic({ roomId }: FloatingMusicProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      {/* Bouton flottant pour ouvrir */}
      <Button
        onClick={() => setIsVisible(true)}
        className={`fixed bottom-4 right-4 z-50 shadow-lg h-12 w-12 rounded-full transition-opacity ${
          isVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        size="icon"
        title="Ouvrir le lecteur musical"
      >
        <Music className="h-5 w-5" />
      </Button>

      {/* Panneau de contrôle - Toujours dans le DOM mais caché avec CSS */}
      <Card 
        className={`fixed bottom-4 right-4 z-50 transition-all duration-300 shadow-2xl w-96 ${
          !isVisible ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/50">
          <div className="flex items-center gap-2">
            <Music className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Musique</span>
          </div>
          
          {/* Close */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsVisible(false)}
            title="Masquer"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content - Le lecteur YouTube reste TOUJOURS monté */}
        <div className="p-4">
          <SyncedYouTubePlayer roomId={roomId} />
        </div>
      </Card>
    </>
  );
}

