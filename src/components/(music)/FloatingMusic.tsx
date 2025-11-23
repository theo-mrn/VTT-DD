'use client'

import { useState } from 'react';
import MJMusicPlayer from '@/components/(music)/MJMusicPlayer';
import PlayerMusicControl from '@/components/(music)/PlayerMusicControl';
import { useGame } from '@/contexts/GameContext';
import { Music, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface FloatingMusicProps {
  roomId: string;
}

export default function FloatingMusic({ roomId }: FloatingMusicProps) {
  const { isMJ } = useGame();
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
      <div 
        className={`fixed bottom-4 right-4 z-50 transition-all duration-300 shadow-2xl rounded-3xl overflow-hidden ${
          isMJ ? 'w-[90vw] max-w-5xl h-[650px]' : 'w-96'
        } ${
          !isVisible ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
        }`}
        style={{
          backgroundImage: 'url(/bg-img.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        {/* Overlay pour contraste */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

        {/* Content wrapper */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-white/20 bg-black/30 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-white" />
              <span className="text-sm font-bold text-white drop-shadow-lg">
                {isMJ ? 'Bibliothèque Musicale - MJ' : 'Musique'}
              </span>
            </div>
            
            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white hover:bg-white/20"
              onClick={() => setIsVisible(false)}
              title="Masquer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Content - Différent selon MJ ou Joueur */}
          <div className="p-4 flex-1 overflow-auto">
            {isMJ ? (
              <MJMusicPlayer roomId={roomId} />
            ) : (
              <PlayerMusicControl roomId={roomId} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

