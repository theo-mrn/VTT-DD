'use client';

import { AudioDiagnostics } from '@/components/audio/audio-diagnostics';
import { LiveNow } from '@/components/audio/live-now';
import { MixerPanel } from '@/components/audio/mixer-panel';

/**
 * Volume (joueurs, spectateurs) : ce que j'entends et mon mixeur personnel, pour moi seul.
 * Le son de la table se pilote par le MJ (panneau « Son »).
 */
export function OngletVolume() {
  return (
    <div className="space-y-4 px-4 py-4 sm:px-5">
      <LiveNow />
      <MixerPanel />
      <AudioDiagnostics />
    </div>
  );
}
