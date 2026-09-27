'use client';

/**
 * Bouton « Partager l'écran » du MJ. Le partage d'écran de l'ancienne app
 * passait par une fenêtre `/{roomId}/stream-view` et une signalisation WebRTC
 * dans la RTDB (`rooms/{r}/stream`) : pas encore d'équivalent (le canal
 * éphémère du temps réel pourra porter la signalisation). Le bouton reste à sa
 * place et l'annonce.
 */
import { Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

interface Props {
  roomId: string;
  userId: string;
  onStreamChange?: (isStreaming: boolean) => void;
}

export default function ScreenShareProducer(_props: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => toast.info('Bientôt disponible', { description: "Partage d'écran" })}
          className={cn(
            'h-9 w-9 rounded-lg transition-all duration-200',
            'text-gray-400 hover:bg-white/10 hover:text-white',
          )}
        >
          <Monitor size={18} strokeWidth={2} />
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="border-[var(--border-color)] bg-black/90 text-xs font-medium text-white"
      >
        <p>Partager l&apos;écran (bientôt disponible)</p>
      </TooltipContent>
    </Tooltip>
  );
}
