"use client"

import { SettingsProvider } from '@/contexts/SettingsContext';
import { GameSystemTypography } from '@/modules/game-system/GameSystemTypography';
import { GameSystemStyles } from '@/modules/game-system/GameSystemStyles';
import { ExtensionHost } from '@/modules/bundle-scripts/ExtensionHost';
import { db, doc, getDoc } from '@/lib/firebase';
import { useRouter, useParams } from 'next/navigation';
import { useEffect } from 'react';

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter();
  const params = useParams();
  const roomid = params?.roomid as string;

  // Validation en arrière-plan : ne bloque plus le rendu (page.tsx affiche déjà son propre
  // écran de chargement). GameContext fait de toute façon son propre getDoc('Salle', roomId) ;
  // ce check ne sert qu'à rediriger si la room n'existe pas, sans ajouter un second écran devant.
  useEffect(() => {
    if (!roomid) {
      router.replace('/home');
      return;
    }

    const checkRoom = async () => {
      try {
        const roomRef = doc(db, 'Salle', roomid);
        const roomDoc = await getDoc(roomRef);

        if (!roomDoc.exists()) {
          console.error("Room not found:", roomid);
          router.replace('/home');
        }
      } catch (error) {
        console.error("Error fetching room:", error);
        router.replace('/home');
      }
    };

    checkRoom();
  }, [roomid, router]);

  return (
    <SettingsProvider>
      <GameSystemTypography roomId={roomid ?? null} />
      <GameSystemStyles roomId={roomid ?? null} />
      <ExtensionHost roomId={roomid ?? null} />
      {children}
    </SettingsProvider>
  )
}
