'use client';

/**
 * Fiche d'un personnage posé, ouverte depuis la carte (menu « Fiche », inspecteur) : la fiche
 * complète (`FichePersonnage` en panneau), avec les droits habituels décidés par le service
 * character (le MJ la modifie, un joueur celle de son personnage).
 */
import { IdCard, X } from 'lucide-react';
import { FichePersonnage } from '@/components/fiche/fiche-personnage';
import { Button } from '@/components/ui/button';
import type { MapEngine } from '@/lib/map/engine/map-engine';
import { useCharacterInfo, useLibrary, useTokens } from './use-tokens';

export function TokenSheetPanel({ engine }: { engine: MapEngine }) {
  const tokens = useTokens(engine);
  const characterId = useLibrary(tokens, (s) => s.sheetFor);
  const info = useCharacterInfo(tokens, characterId);
  if (!characterId) return null;
  const close = () => tokens.library.setState({ sheetFor: null });
  const name = info?.name ?? 'Personnage';
  return (
    <aside
      aria-label={`Fiche : ${name}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
        }
      }}
      className="pointer-events-auto flex max-h-full w-[36rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border-strong bg-background/95 shadow-elevated backdrop-blur-md"
    >
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <IdCard className="size-4" aria-hidden />
        </span>
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{name}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Fermer la fiche" onClick={close}>
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <FichePersonnage key={characterId} id={characterId} dansPanneau />
      </div>
    </aside>
  );
}
