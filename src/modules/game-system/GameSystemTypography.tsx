"use client"

import { useEffect } from 'react';
import { useGameSystem } from './useGameSystem';
import type { TypographyConfig } from './types';

// Applique gameSystem.typography à toute la salle : chargement des polices via l'API FontFace puis
// surcharge des variables CSS --font-body/--font-title sur <html> (le style inline bat les classes
// next/font du layout racine — globals.css lit ces variables partout, l'app entière suit). Aucune
// typography => aucun effet : les salles existantes gardent IM Fell English / Cinzel à l'identique.
export function GameSystemTypography({ roomId }: { roomId: string | null }) {
  const { gameSystem } = useGameSystem(roomId);
  // Clé d'effet sur le JSON, jamais sur l'objet gameSystem mémoïsé : son identité change à chaque
  // snapshot d'overlay et rechargerait les polices en boucle.
  const typographyJson = gameSystem.typography ? JSON.stringify(gameSystem.typography) : null;

  useEffect(() => {
    if (!typographyJson) return;
    const typography: TypographyConfig = JSON.parse(typographyJson);
    const addedFaces: FontFace[] = [];
    let cancelled = false;

    const apply = async () => {
      for (const def of typography.fonts ?? []) {
        if (!def?.family || !def?.src) continue;
        try {
          const face = new FontFace(def.family, `url("${def.src}")`, {
            weight: def.weight ?? 'normal',
            style: def.style ?? 'normal',
            display: 'swap',
          });
          await face.load();
          if (cancelled) return;
          document.fonts.add(face);
          addedFaces.push(face);
        } catch (error) {
          // Une police en 404 ne doit bloquer ni les autres polices ni la salle.
          console.warn(`[typography] Police "${def.family}" introuvable (${def.src})`, error);
        }
      }
      if (cancelled) return;
      const root = document.documentElement;
      if (typography.bodyFamily) root.style.setProperty('--font-body', `"${typography.bodyFamily}", serif`);
      if (typography.titleFamily) root.style.setProperty('--font-title', `"${typography.titleFamily}", serif`);
    };
    apply();

    return () => {
      cancelled = true;
      const root = document.documentElement;
      root.style.removeProperty('--font-body');
      root.style.removeProperty('--font-title');
      for (const face of addedFaces) {
        document.fonts.delete(face);
      }
    };
  }, [typographyJson]);

  return null;
}
