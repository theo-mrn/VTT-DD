'use client';

/**
 * Son de la table, monté une fois par la scène : attache la campagne au
 * moteur audio (état des canaux, temps réel, mixeur) et affiche le bandeau
 * « Activer le son » quand le navigateur bloque la lecture alors que
 * quelque chose devrait s'entendre.
 */
import { useTranslations } from 'next-intl';
import { Volume2 } from 'lucide-react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getAudioEngine, useAudioStatus, useCampaignAudio } from '@/lib/audio';

export function AudioUnlockBanner() {
  const t = useTranslations();
  const { needsUnlock, unlock } = useAudioStatus();
  if (!needsUnlock) return null;
  return (
    <div
      role="status"
      className="pointer-events-auto fixed bottom-[calc(var(--table-dock-h,0px)+1rem)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-border-strong bg-surface-2 px-4 py-2.5 text-[13px] shadow-surface"
    >
      <Volume2 className="size-4 text-primary" aria-hidden />
      <span>{t('audio.unlockHint')}</span>
      <Button size="sm" onClick={() => void unlock()}>
        {t('handouts.unmute')}
      </Button>
    </div>
  );
}

export function TableAudio({ campaignId, gm }: Readonly<{ campaignId: string; gm: boolean }>) {
  useCampaignAudio(campaignId, { gm });
  useEffect(() => {
    const engine = getAudioEngine();
    engine.onError = (message) => toast.error(message);
    return () => {
      engine.onError = null;
    };
  }, []);
  return <AudioUnlockBanner />;
}
