'use client';

/**
 * Panneau « Son » de la table (touche S) : ce qui joue pour toute la table
 * (musique, ambiance), mon mixeur, et pour le MJ la bibliothèque, les
 * playlists et le catalogue. Les joueurs n'ont que la lecture et leur mixeur :
 * les titres de la bibliothèque peuvent divulguer l'intrigue.
 */
import { AlertTriangle } from 'lucide-react';
import { Notice } from '@/components/resources/parts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAudioLibrary } from '@/lib/audio';
import { CatalogTab } from './catalog-tab';
import { ChannelCard } from './channel-card';
import { LibraryTab } from './library-tab';
import { MixerPanel } from './mixer-panel';
import { SectionTitle } from './parts';
import { PlaylistsTab } from './playlists-tab';

function GmLibrary({ campaignId, systemId }: { campaignId: string; systemId: string }) {
  const library = useAudioLibrary(campaignId);
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
    <Tabs defaultValue="library">
      <TabsList>
        <TabsTrigger value="library">Bibliothèque</TabsTrigger>
        <TabsTrigger value="playlists">Playlists</TabsTrigger>
        <TabsTrigger value="catalog">Catalogue</TabsTrigger>
      </TabsList>
      <TabsContent value="library">
        <LibraryTab campaignId={campaignId} library={library} />
      </TabsContent>
      <TabsContent value="playlists">
        <PlaylistsTab campaignId={campaignId} library={library} />
      </TabsContent>
      <TabsContent value="catalog">
        <CatalogTab library={library} systemId={systemId} />
      </TabsContent>
    </Tabs>
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
      <section aria-label="Lecture pour la table" className="space-y-2">
        <SectionTitle>Pour toute la table</SectionTitle>
        <ChannelCard campaignId={campaignId} channel="music" gm={gm} />
        <ChannelCard campaignId={campaignId} channel="ambience" gm={gm} />
      </section>
      <MixerPanel />
      {gm && <GmLibrary campaignId={campaignId} systemId={systemId} />}
    </div>
  );
}
