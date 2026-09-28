'use client';

/**
 * Panneau « Son » de la table (touche S), dans l'ordre où on s'en sert :
 *   1. ce qui joue pour la table (musique, ambiance) ;
 *   2. MJ : sa table d'effets, personnalisable (n'importe quel son, un clic pour la table) ;
 *   3. MJ : la bibliothèque, où chaque son se joue en musique, en ambiance ou sur la table
 *      d'effets, quel que soit son type ou sa provenance.
 * Chacun règle son propre volume (« Mon volume ») sans toucher à la table. Les joueurs ne
 * voient pas la bibliothèque : ses titres peuvent divulguer l'intrigue.
 */
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '@/components/resources/parts';
import { useAudioLibrary, useChannel, useSoundboard, useSoundCues } from '@/lib/audio';
import { AddSoundDialog } from './add-sound-dialog';
import { Deck } from './deck';
import { LiveNow } from './live-now';
import { MixerButton, MixerPanel } from './mixer-panel';
import { SectionTitle } from './parts';
import { SoundLibrary, type LibraryView } from './sound-library';
import { Soundboard } from './soundboard';

function GmSound({ campaignId, systemId }: { campaignId: string; systemId: string }) {
  const library = useAudioLibrary(campaignId);
  const music = useChannel(campaignId, 'music');
  const ambience = useChannel(campaignId, 'ambience');
  const cues = useSoundCues(campaignId);
  const board = useSoundboard(campaignId);
  const [view, setView] = useState<LibraryView>('sounds');
  const [adding, setAdding] = useState(false);

  if (library.error)
    return (
      <Notice
        tone="error"
        icon={AlertTriangle}
        title="Bibliothèque indisponible"
        description="Le service du son ne répond pas. Réessayez dans un instant."
      />
    );
  return (
    <>
      <Soundboard board={board} library={library.assets} cues={cues} />
      <SoundLibrary
        campaignId={campaignId}
        systemId={systemId}
        library={library}
        music={music}
        ambience={ambience}
        board={board}
        view={view}
        onView={setView}
        onAdd={() => setAdding(true)}
      />
      <AddSoundDialog library={library} open={adding} onOpenChange={setAdding} />
    </>
  );
}

export function SoundPanel({
  campaignId,
  systemId,
  gm,
}: {
  campaignId: string;
  systemId: string;
  gm: boolean;
}) {
  return (
    <div className="space-y-6 px-4 py-5 sm:px-6">
      <section aria-label="En ce moment pour la table" className="space-y-2">
        <SectionTitle action={gm ? <MixerButton /> : undefined}>
          En ce moment pour la table
        </SectionTitle>
        <LiveNow />
        <Deck campaignId={campaignId} channel="music" gm={gm} />
        <Deck campaignId={campaignId} channel="ambience" gm={gm} />
        {!gm && (
          <p className="text-xs text-muted-foreground">
            Le MJ choisit la musique et les effets ; vous réglez ce que vous entendez.
          </p>
        )}
      </section>
      {gm ? <GmSound campaignId={campaignId} systemId={systemId} /> : <MixerPanel />}
    </div>
  );
}
