'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Monitor, MonitorOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
      if (popup.closed) { clearInterval(check); channel.close(); setIsOpen(false); }
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
    <Button
      variant={isOpen ? 'destructive' : 'secondary'}
      size="sm"
      onClick={isOpen ? closePopup : openPopup}
      title={isOpen ? 'Fermer le stream' : 'Partager l\'écran'}
    >
      {isOpen ? <MonitorOff className="w-4 h-4 mr-1" /> : <Monitor className="w-4 h-4 mr-1" />}
      {isOpen ? 'Arrêter' : 'Partager'}
    </Button>
  );
}
