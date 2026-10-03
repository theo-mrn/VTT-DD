'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { CampaignChat } from '@/components/chat/campaign-chat';
import { useTable } from '../contexte';
import { usePanelVisible } from '../panels/navigation';
import { TABLE_PARAMS } from '../panels/registry';
import { writePanelLocation } from '../panels/store';

/** Chat : la discussion de la campagne, ouverte sur un chuchotement par `?chuchoter=<userId>`. */
export function ChatPanel() {
  const { campagne } = useTable();
  const visible = usePanelVisible();
  const whisperTo = useSearchParams().get(TABLE_PARAMS.whisper);
  // Le paramètre a servi : l'adresse redevient celle du panneau
  const handled = useCallback(
    () => writePanelLocation('chat', { [TABLE_PARAMS.whisper]: null }),
    [],
  );
  return (
    <CampaignChat
      campaign={campagne}
      visible={visible}
      whisperTo={visible ? whisperTo : null}
      onWhisperHandled={handled}
    />
  );
}
