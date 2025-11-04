/**
 * EXEMPLE D'INTÉGRATION DU LECTEUR MUSICAL FLOTTANT DANS UN LAYOUT
 * 
 * Ce fichier montre comment ajouter le lecteur musical flottant à toutes les pages d'une salle.
 * Copiez ce code dans votre layout.tsx existant ou adaptez-le selon vos besoins.
 */

'use client'

import React from 'react';
import { useParams } from 'next/navigation';
import FloatingMusicPlayer from '@/components/FloatingMusicPlayer';

export default function RoomLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const params = useParams();
  const roomId = params.roomid as string;

  return (
    <>
      {children}
      
      {/* 👇 LECTEUR MUSICAL FLOTTANT - Disponible sur toutes les pages de la salle */}
      <FloatingMusicPlayer 
        roomId={roomId}
        defaultExpanded={false}
        defaultPosition="bottom-right"
      />
    </>
  );
}

/**
 * AUTRES EXEMPLES D'UTILISATION
 */

// Exemple 1 : Position en bas à gauche
export function ExampleBottomLeft({ roomId }: { roomId: string }) {
  return (
    <FloatingMusicPlayer 
      roomId={roomId}
      defaultPosition="bottom-left"
    />
  );
}

// Exemple 2 : Lecteur étendu par défaut
export function ExampleExpanded({ roomId }: { roomId: string }) {
  return (
    <FloatingMusicPlayer 
      roomId={roomId}
      defaultExpanded={true}
    />
  );
}

// Exemple 3 : Lecteur qui utilise automatiquement le roomId du contexte
export function ExampleAutoRoomId() {
  return (
    <FloatingMusicPlayer 
      // roomId non spécifié = utilise automatiquement user.roomId du contexte
      defaultPosition="bottom-right"
    />
  );
}

// Exemple 4 : Dans une page spécifique avec condition
export function ExampleConditional({ roomId, showMusic }: { roomId: string, showMusic: boolean }) {
  return (
    <div>
      {/* Votre contenu */}
      
      {showMusic && (
        <FloatingMusicPlayer 
          roomId={roomId}
          defaultPosition="top-right"
        />
      )}
    </div>
  );
}

/**
 * POUR INTÉGRER DANS VOTRE LAYOUT EXISTANT :
 * 
 * 1. Importez le composant :
 *    import FloatingMusicPlayer from '@/components/FloatingMusicPlayer';
 * 
 * 2. Ajoutez-le dans votre JSX de retour :
 *    return (
 *      <>
 *        {children}
 *        <FloatingMusicPlayer roomId={roomId} />
 *      </>
 *    );
 * 
 * 3. Le lecteur sera disponible sur toutes les pages de la salle !
 */

