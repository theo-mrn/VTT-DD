"use client"

import { SettingsProvider } from '@/contexts/SettingsContext';
import { db, doc, getDoc } from '@/lib/firebase';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter();
  const params = useParams();
  const roomid = params?.roomid as string;
  const [isValidated, setIsValidated] = useState(false);

  useEffect(() => {
    if (!roomid) {
      router.replace('/Salle');
      return;
    }

    const checkRoom = async () => {
      try {
        const roomRef = doc(db, 'Salle', roomid);
        const roomDoc = await getDoc(roomRef);

        if (!roomDoc.exists()) {
          console.error("Room not found:", roomid);
          router.replace('/Salle');
        } else {
          setIsValidated(true);
        }
      } catch (error) {
        console.error("Error fetching room:", error);
        router.replace('/Salle');
      }
    };

    checkRoom();
  }, [roomid, router]);

  // Optionally, return null or a loading state while validating
  if (!isValidated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Chargement de la salle...</div>
      </div>
    );
  }

  return (
    <SettingsProvider>
      {children}
    </SettingsProvider>
  )
}
