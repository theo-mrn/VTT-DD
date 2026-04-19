'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Monitor, MonitorOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface Props {
  roomId: string;
  userId: string;
  onStreamChange?: (isStreaming: boolean) => void;
}

export default function ScreenShareProducer({ roomId, userId, onStreamChange }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const openPopup = useCallback(() => {
    const popup = window.open(
      `/${roomId}/stream-view`,
      'vtt-stream',
      'width=480,height=300,menubar=no,toolbar=no,location=no,status=no'
    );
    if (!popup) return;
    popupRef.current = popup;

    const channel = new BroadcastChannel(`vtt-stream-${roomId}`);
    channelRef.current = channel;
    channel.onmessage = (e) => {
      if (e.data.type === 'ready') channel.postMessage({ type: 'init', userId });
    };

    const check = setInterval(() => {
      if (popup.closed) { clearInterval(check); channel.close(); setIsOpen(false); onStreamChange?.(false); }
    }, 1000);

    setIsOpen(true);
    onStreamChange?.(true);
  }, [roomId, userId, onStreamChange]);

  const closePopup = useCallback(() => {
    popupRef.current?.close();
    channelRef.current?.close();
    setIsOpen(false);
    onStreamChange?.(false);
  }, [onStreamChange]);

  useEffect(() => () => closePopup(), [closePopup]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={isOpen ? closePopup : openPopup}
          className={cn(
            'h-9 w-9 rounded-lg transition-all duration-200',
            isOpen
              ? 'bg-red-600/80 text-white hover:bg-red-600'
              : 'text-gray-400 hover:text-white hover:bg-white/10'
          )}
        >
          {isOpen ? <MonitorOff size={18} strokeWidth={2} /> : <Monitor size={18} strokeWidth={2} />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" className="bg-black/90 border-[#333] text-white text-xs font-medium">
        <p>{isOpen ? 'Arrêter le stream' : 'Partager l\'écran'}</p>
      </TooltipContent>
    </Tooltip>
  );
}
