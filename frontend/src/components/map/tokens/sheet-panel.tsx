'use client';

/**
 * Fiche d'un personnage posé, ouverte depuis la carte (menu « Fiche », inspecteur) : la fiche
 * complète (`FichePersonnage` en panneau), avec les droits habituels décidés par le service
 * character (le MJ la modifie, un joueur celle de son personnage).
 */
import { IdCard } from 'lucide-react';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useCharacterInfo, useLibrary, useTokens } from './use-tokens';
import { MapPanel } from '../map-panel';

export function TokenSheetPanel({ engine }: { engine: MapEngine }) {
  const tokens = useTokens(engine);
  const characterId = useLibrary(tokens, (s) => s.sheetFor);
  const info = useCharacterInfo(tokens, characterId);
  if (!characterId) return null;
  const close = () => tokens.library.setState({ sheetFor: null });
  const name = info?.name ?? 'Personnage';
  return (
    <MapPanel
      id="token-sheet"
      label={`Fiche : ${name}`}
      icon={IdCard}
      title={name}
      closeLabel="Fermer la fiche"
      onClose={close}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      className="w-[36rem]"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <FichePersonnage key={characterId} id={characterId} dansPanneau />
      </div>
    </MapPanel>
  );
}
