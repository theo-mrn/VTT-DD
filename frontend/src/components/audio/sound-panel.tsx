'use client';

/**
 * Panneau « Son » de la table (touche S). En haut, ce que vous entendez vraiment et votre
 * volume. Pour le MJ, trois espaces séparés, chacun avec son lecteur, ses sons et son
 * « Ajouter » : Musique (morceaux et playlists), Ambiance, Effets (table personnalisable).
 * Réservé au MJ : les joueurs n'ont que leur volume (panneau « Volume »).
 */
import { useTranslations } from 'next-intl';
import { AlertTriangle, AudioLines, ListMusic, Music, Wind } from 'lucide-react';
import { useState } from 'react';
import { Notice } from '@/components/resources/parts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAudioLibrary, useChannel, useSoundboard, useSoundCues } from '@/lib/audio';
import { AddSoundDialog, type SoundTarget } from './add-sound-dialog';
import { AudioDiagnostics } from './audio-diagnostics';
import { Deck } from './deck';
import { LiveNow } from './live-now';
import { MixerButton } from './mixer-panel';
import { Segmented } from './parts';
import { PlaylistsTab } from './playlists-tab';
import { SectionList } from './section-list';
import { Soundboard } from './soundboard';

function GmSound({ campaignId, systemId }: Readonly<{ campaignId: string; systemId: string }>) {
  const t = useTranslations();
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
        title={t('resources.images.unavailable')}
        description={t('audio.panel.serviceDown')}
      />
    );

  return (
    <>
      <Tabs defaultValue="music">
        <TabsList variante="ligne" aria-label={t('audio.panel.spaces')} className="w-full">
          <TabsTrigger value="music" className="flex-1">
            <Music aria-hidden />
            {t('audio.kinds.music')}
          </TabsTrigger>
          <TabsTrigger value="ambience" className="flex-1">
            <Wind aria-hidden />
            {t('audio.kinds.ambience')}
          </TabsTrigger>
          <TabsTrigger value="sfx" className="flex-1">
            <AudioLines aria-hidden />
            {t('audio.buses.sfx')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="music" className="mt-4 space-y-3">
          <Deck campaignId={campaignId} channel="music" gm />
          <Segmented
            label={t('audio.kinds.music')}
            value={musicView}
            onChange={(v) => setMusicView(v as typeof musicView)}
            options={[
              { value: 'tracks', label: t('audio.panel.tracks'), icon: Music },
              {
                value: 'playlists',
                label: t('audio.playlists.title'),
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

/** Panneau « Son » du MJ (les autres ont le panneau « Volume », leur mixeur seul). */
export function SoundPanel({
  campaignId,
  systemId,
}: Readonly<{ campaignId: string; systemId: string }>) {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <LiveNow />
        </div>
        <MixerButton />
      </div>
      <GmSound campaignId={campaignId} systemId={systemId} />
      <AudioDiagnostics />
    </div>
  );
}
