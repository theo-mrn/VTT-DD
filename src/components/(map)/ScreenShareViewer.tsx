'use client';

import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, PauseCircle } from 'lucide-react';
import { realtimeDb } from '@/lib/firebase.js';
import { ref as dbRef, set, onValue, off, remove } from 'firebase/database';

interface Props {
  roomId: string;
  userId: string;
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'turn:76.13.44.160:3478', username: 'vtt', credential: 'vttpass' },
];

export default function ScreenShareViewer({ roomId, userId }: Props) {
  const [hasTrack, setHasTrack] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let destroyed = false;

    const offerRef = dbRef(realtimeDb, `stream/${roomId}/offer`);

    const unsubOffer = onValue(offerRef, async snap => {
      const offer = snap.val();
      if (!offer) {
        pc?.close(); pc = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setHasTrack(false);
        setExpanded(false);
        return;
      }
      if (destroyed) return;

      // Nettoie l'ancienne connexion si nouvelle offre
      if (pc) { pc.close(); pc = null; setHasTrack(false); }

      pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;

      pc.ontrack = (e) => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = e.streams[0];
        el.play().catch(() => {});
        setHasTrack(true);
      };

      pc.onicecandidate = async ({ candidate }) => {
        if (candidate) {
          const key = candidate.candidate.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20);
          await set(dbRef(realtimeDb, `stream/${roomId}/viewer_ice/${key}`), candidate.toJSON());
        }
      };

      // Écoute les ICE du MJ
      const mjIceRef = dbRef(realtimeDb, `stream/${roomId}/mj_ice`);
      onValue(mjIceRef, snap => {
        snap.forEach(child => {
          const c = child.val();
          if (c?.candidate && pc?.remoteDescription) {
            pc.addIceCandidate({ candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null }).catch(() => {});
          }
        });
      });

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await set(dbRef(realtimeDb, `stream/${roomId}/answer`), { type: answer.type, sdp: answer.sdp });
    });

    const unsubPaused = onValue(dbRef(realtimeDb, `stream/${roomId}/paused`), snap => {
      setPaused(snap.val() === true);
    });

    return () => {
      destroyed = true;
      unsubOffer();
      unsubPaused();
      off(dbRef(realtimeDb, `stream/${roomId}/mj_ice`));
      pc?.close();
      pcRef.current = null;
      setHasTrack(false);
    };
  }, [roomId]);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay playsInline muted
        onClick={() => hasTrack && !expanded && setExpanded(true)}
        className={
          !hasTrack
            ? 'fixed -left-[9999px]'
            : expanded
            ? 'fixed inset-4 z-[100] w-[80vw] h-[80vh] m-auto object-cover bg-black rounded-xl cursor-default'
            : 'fixed bottom-24 right-4 z-50 w-56 rounded-xl object-contain bg-black border border-white/10 shadow-2xl cursor-pointer'
        }
      />
      {hasTrack && !expanded && (
        <div
          className="fixed bottom-24 right-4 z-[51] w-56 rounded-xl flex items-center justify-center opacity-0 hover:opacity-100 hover:bg-black/30 transition-all pointer-events-none"
          style={{ aspectRatio: '16/9' }}
        >
          <Maximize2 className="w-8 h-8 text-white drop-shadow" />
        </div>
      )}
      {hasTrack && paused && (
        <div className={`${expanded ? 'fixed inset-4 z-[101]' : 'fixed bottom-24 right-4 z-[52] w-56'} flex items-center justify-center bg-black/70 rounded-xl`}
          style={expanded ? {} : { aspectRatio: '16/9' }}>
          <div className="flex flex-col items-center gap-2 text-white/80">
            <PauseCircle className="w-8 h-8" />
            <span className="text-xs font-medium">En pause</span>
          </div>
        </div>
      )}
      {hasTrack && expanded && (
        <button
          className="fixed top-4 right-4 z-[101] text-white/60 hover:text-white"
          onClick={() => setExpanded(false)}
        >
          <Minimize2 className="w-6 h-6" />
        </button>
      )}
    </>
  );
}
