'use client'

import React from 'react';
import { useGame } from '@/contexts/GameContext';
import SyncedYouTubePlayer from '@/components/SyncedYouTubePlayer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Music } from 'lucide-react';

export default function MusicPage() {
  const { user, isLoading } = useGame();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user || !user.roomId) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Lecteur Musical
            </CardTitle>
            <CardDescription>
              Vous devez être connecté et dans une salle pour utiliser le lecteur musical.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* En-tête */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Lecteur Musical Synchronisé
          </h1>
          <p className="text-muted-foreground">
            Écoutez de la musique ensemble, synchronisée en temps réel
          </p>
        </div>

        {/* Lecteur YouTube */}
        <SyncedYouTubePlayer roomId={user.roomId} />

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Comment ça marche ?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Pour le Maître du Jeu (MJ) :</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Collez une URL YouTube dans le champ ci-dessus</li>
                <li>Utilisez les contrôles pour lire, mettre en pause ou ajuster le volume</li>
                <li>Tous les changements sont synchronisés avec tous les joueurs</li>
              </ul>
            </div>
            
            <div className="space-y-2">
              <h3 className="font-semibold">Pour les Joueurs :</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>La musique se synchronise automatiquement</li>
                <li>Vous pouvez ajuster votre volume local sans affecter les autres</li>
                <li>Les contrôles de lecture sont réservés au MJ</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Exemples d'URLs YouTube :</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground font-mono">
                <li>https://www.youtube.com/watch?v=dQw4w9WgXcQ</li>
                <li>https://youtu.be/dQw4w9WgXcQ</li>
                <li>dQw4w9WgXcQ (juste l'ID)</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

