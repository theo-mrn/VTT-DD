'use client';

/**
 * Panneau « Son » de la table (touche S). En haut, ce que vous entendez vraiment et votre
 * volume. Pour le MJ, trois espaces séparés, chacun avec son lecteur, ses sons et son
 * « Ajouter » : Musique (morceaux et playlists), Ambiance, Effets (table personnalisable).
 * Les joueurs voient ce qui joue et règlent leur volume : la bibliothèque du MJ reste privée.
 */
import { AlertTriangle, AudioLines, ListMusic, Music, Wind } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '@/components/resources/parts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAudioLibrary, useChannel, useSoundboard, useSoundCues } from '@/lib/audio';
import { AddSoundDialog, type SoundTarget } from './add-sound-dialog';
import { Deck } from './deck';
import { LiveNow } from './live-now';
import { MixerButton, MixerPanel } from './mixer-panel';
import { Segmented } from './parts';
import { PlaylistsTab } from './playlists-tab';
import { SectionList } from './section-list';
import { Soundboard } from './soundboard';

function GmSound({ campaignId, systemId }: { campaignId: string; systemId: string }) {
  const library = useAudioLibrary(campaignId);
  const music = useChannel(campaignId, 'music');
  const ambience = useChannel(campaignId, 'ambience');
  const cues = useSoundCues(campaignId);
  const board = useSoundboard(campaignId);
  const [adding, setAdding] = useState<SoundTarget | null>(null);
  const [musicView, setMusicView] = useState<'tracks' | 'playlists'>('tracks');

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
      <Tabs defaultValue="music">
        <TabsList variante="ligne" aria-label="Espaces du son" className="w-full">
          <TabsTrigger value="music" className="flex-1">
            <Music aria-hidden />
            Musique
          </TabsTrigger>
          <TabsTrigger value="ambience" className="flex-1">
            <Wind aria-hidden />
            Ambiance
          </TabsTrigger>
          <TabsTrigger value="sfx" className="flex-1">
            <AudioLines aria-hidden />
            Effets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="music" className="mt-4 space-y-3">
          <Deck campaignId={campaignId} channel="music" gm />
          <Segmented
            label="Musique"
            value={musicView}
            onChange={(v) => setMusicView(v as typeof musicView)}
            options={[
              { value: 'tracks', label: 'Morceaux', icon: Music },
              {
                value: 'playlists',
                label: 'Playlists',
                icon: ListMusic,
                count: library.playlists.length,
              },
            ]}
          />
          {musicView === 'tracks' ? (
            <SectionList
              section="music"
              library={library}
              channel={music}
              board={board}
              onAdd={() => setAdding('music')}
            />
          ) : (
            <PlaylistsTab campaignId={campaignId} library={library} />
          )}
        </TabsContent>

        <TabsContent value="ambience" className="mt-4 space-y-3">
          <Deck campaignId={campaignId} channel="ambience" gm />
          <SectionList
            section="ambience"
            library={library}
            channel={ambience}
            board={board}
            onAdd={() => setAdding('ambience')}
          />
        </TabsContent>

        <TabsContent value="sfx" className="mt-4">
          <Soundboard
            board={board}
            library={library.assets}
            cues={cues}
            onAdd={() => setAdding('sfx')}
          />
        </TabsContent>
      </Tabs>

      <AddSoundDialog
        target={adding}
        systemId={systemId}
        library={library}
        board={board}
        onOpenChange={(o) => !o && setAdding(null)}
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
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <LiveNow />
        </div>
        {gm && <MixerButton />}
      </div>
      {gm ? (
        <GmSound campaignId={campaignId} systemId={systemId} />
      ) : (
        <>
          <div className="space-y-2">
            <Deck campaignId={campaignId} channel="music" gm={false} />
            <Deck campaignId={campaignId} channel="ambience" gm={false} />
            <p className="text-xs text-muted-foreground">
              Le MJ choisit la musique et les effets ; vous réglez ce que vous entendez.
            </p>
          </div>
          <MixerPanel />
        </>
      )}
    </div>
  );
}
