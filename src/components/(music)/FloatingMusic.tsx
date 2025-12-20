'use client'

import { useState } from 'react';
import MJMusicPlayer from '@/components/(music)/MJMusicPlayer';
import PlayerMusicControl from '@/components/(music)/PlayerMusicControl';
import { useGame } from '@/contexts/GameContext';
import { Music, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        className={`fixed bottom-4 right-4 z-[5] shadow-lg h-12 w-12 rounded-full transition-opacity bg-[#c0a080] hover:bg-[#b09070] text-black ${isVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        size="icon"
        title="Ouvrir le lecteur musical"
      >
        <Music className="h-5 w-5" />
      </Button>

      {/* Panneau de contrôle - Toujours dans le DOM mais caché avec CSS */}
      <div
        className={`fixed bottom-4 right-4 z-[5] transition-all duration-300 shadow-2xl rounded-lg overflow-hidden border border-[#333] bg-[#1a1a1a] ${isMJ ? 'w-[90vw] max-w-5xl h-[650px]' : 'w-96'
          } ${!isVisible ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100 scale-100'
          }`}
      >
        {/* Content wrapper */}
        <div className="relative z-10 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-[#141414] border-b border-[#333]">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#c0a080]/10 rounded-lg border border-[#c0a080]/20">
                <Music className="h-5 w-5 text-[#c0a080]" />
              </div>
              <span className="text-lg font-bold text-[#c0a080] tracking-tight">
                {isMJ ? 'Bibliothèque Musicale - MJ' : 'Musique'}
              </span>
            </div>

            {/* Close */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#333]"
              onClick={() => setIsVisible(false)}
              title="Masquer"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {/* Content - Différent selon MJ ou Joueur */}
          <div className="flex-1 overflow-hidden bg-[#1a1a1a]">
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

