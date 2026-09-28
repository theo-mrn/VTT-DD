'use client';

/**
 * Panneau « Son » de la table (touche S), dans l'ordre où on s'en sert :
 *   1. ce qui joue pour la table (musique, ambiance) ;
 *   2. MJ : les effets, un clic pour toute la table ;
 *   3. MJ : la bibliothèque rangée par type, avec « Ajouter un son ».
 * Chacun règle son propre volume (« Mon volume ») sans toucher à la table. Les joueurs ne
 * voient pas la bibliothèque : ses titres peuvent divulguer l'intrigue.
 */
import type { AssetKind } from '@vtt/contracts';
import { AlertTriangle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Notice } from '@/components/resources/parts';
import { useAudioLibrary, useChannel, useSoundCues } from '@/lib/audio';
import { AddSoundDialog } from './add-sound-dialog';
import { Deck } from './deck';
import { MixerButton, MixerPanel } from './mixer-panel';
import { SectionTitle } from './parts';
import { SoundLibrary, type LibraryView } from './sound-library';
import { Soundboard } from './soundboard';

function GmSound({ campaignId, systemId }: { campaignId: string; systemId: string }) {
  const library = useAudioLibrary(campaignId);
  const music = useChannel(campaignId, 'music');
  const ambience = useChannel(campaignId, 'ambience');
  const cues = useSoundCues(campaignId);
  const [view, setView] = useState<LibraryView>('music');
  const [adding, setAdding] = useState<AssetKind | null>(null);
  const effects = useMemo(
    () =>
      library.assets
        .filter((a) => a.kind === 'sfx' && a.status === 'ready')
        .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
    [library.assets],
  );
  const kindOfView: AssetKind = view === 'ambience' || view === 'sfx' ? view : 'music';

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
      <Soundboard effects={effects} cues={cues} onAdd={() => setAdding('sfx')} />
      <SoundLibrary
        campaignId={campaignId}
        systemId={systemId}
        library={library}
        music={music}
        ambience={ambience}
        cues={cues}
        view={view}
        onView={setView}
        onAdd={() => setAdding(kindOfView)}
      />
      <AddSoundDialog
        key={adding ?? 'ferme'}
        library={library}
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
        defaultKind={adding ?? 'music'}
      />
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
