'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Monitor, Square, Pause, Play } from 'lucide-react';
import { realtimeDb } from '@/lib/firebase.js';
import { ref as dbRef, set, onValue, remove } from 'firebase/database';

const FALLBACK_ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const res = await fetch('/api/turn-credentials');
    if (!res.ok) return FALLBACK_ICE_SERVERS;
    const { iceServers } = await res.json();
    return iceServers ?? FALLBACK_ICE_SERVERS;
  } catch {
    return FALLBACK_ICE_SERVERS;
  }
}

export default function StreamViewPage() {
  const params = useParams();
  const roomId = params.roomid as string;
  const [isSharing, setIsSharing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const unsubsRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    const channel = new BroadcastChannel(`vtt-stream-${roomId}`);
    channel.onmessage = (e) => {
      if (e.data.type === 'init') setUserId(e.data.userId);
    };
    channel.postMessage({ type: 'ready' });
    return () => channel.close();
  }, [roomId]);

  const stopSharing = useCallback(async () => {
    unsubsRef.current.forEach(unsub => unsub());
    unsubsRef.current = [];
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
    await remove(dbRef(realtimeDb, `rooms/${roomId}/stream`));
    setIsSharing(false);
    setIsPaused(false);
  }, [roomId]);

  const startSharing = useCallback(async () => {
    if (!userId) return;
    try {
      setIsConnecting(true);

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } } as any,
        audio: false,
      });
      streamRef.current = stream;
      stream.getVideoTracks()[0].onended = () => stopSharing();

      if (previewRef.current) {
        previewRef.current.srcObject = stream;
        previewRef.current.play().catch(() => {});
      }

      const pc = new RTCPeerConnection({ iceServers: await getIceServers() });
      pcRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) {
          const key = candidate.candidate.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
          await set(dbRef(realtimeDb, `rooms/${roomId}/stream/mj_ice/${key}`), candidate.toJSON());
        }
      };

      const unsubAnswer = onValue(dbRef(realtimeDb, `rooms/${roomId}/stream/answer`), async snap => {
        const answer = snap.val();
        if (answer && pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
      });

      const unsubViewerIce = onValue(dbRef(realtimeDb, `rooms/${roomId}/stream/viewer_ice`), snap => {
        snap.forEach(child => {
          const c = child.val();
          if (c?.candidate && pc.remoteDescription) {
            pc.addIceCandidate({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null }).catch(() => {});
          }
        });
      });

      unsubsRef.current.push(unsubAnswer, unsubViewerIce);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await set(dbRef(realtimeDb, `rooms/${roomId}/stream/offer`), { type: offer.type, sdp: offer.sdp });

      setIsSharing(true);
    } catch (e) {
      console.error('[Stream]', e);
    } finally {
      setIsConnecting(false);
    }
  }, [roomId, userId, stopSharing]);

  useEffect(() => () => { stopSharing(); }, [stopSharing]);

  return (
    <div className="h-screen bg-zinc-950 flex flex-col">
      {/* Preview */}
      <div className="flex-1 relative bg-black overflow-hidden min-h-0">
        <video
          ref={previewRef}
          autoPlay playsInline muted
          className={`w-full h-full object-contain transition-opacity duration-300 ${isSharing ? 'opacity-100' : 'opacity-0'}`}
        />
        {!isSharing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/20">
            <Monitor className="w-12 h-12" />
            <span className="text-sm">Aucun stream actif</span>
          </div>
        )}
        {isSharing && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 text-white text-xs font-semibold px-2.5 py-1 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            EN DIRECT
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 flex items-center justify-center gap-3 border-t border-white/5">
        {!isSharing ? (
          <button
            onClick={startSharing}
            disabled={isConnecting || !userId}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
          >
            <Monitor className="w-4 h-4" />
            {isConnecting ? 'Connexion…' : 'Démarrer le stream'}
          </button>
        ) : (
          <>
            <button
              onClick={async () => {
                const track = streamRef.current?.getVideoTracks()[0];
                if (!track) return;
                track.enabled = !track.enabled;
                setIsPaused(!track.enabled);
                await set(dbRef(realtimeDb, `rooms/${roomId}/stream/paused`), !track.enabled);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium transition-colors"
            >
              {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              {isPaused ? 'Reprendre' : 'Pause'}
            </button>
            <button
              onClick={stopSharing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors"
            >
              <Square className="w-4 h-4 fill-white" />
              Arrêter
            </button>
          </>
        )}
      </div>
    </div>
  );
}
