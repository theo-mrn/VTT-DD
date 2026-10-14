/**
 * MJ : déclenche un effet ponctuel chez toute la table (événement `table.fx`, joué par chacun à
 * sa réception, MJ compris).
 */
import { toast } from 'sonner';
import { translate } from '@/i18n/runtime';
import { messageErreur } from '@/lib/api';
import { tableStateApi, tableStateStore } from '../shared/table-state';
import type { OneShot } from './state';

/** `userIds` : ces joueurs seulement. */
export function triggerOneShot(fx: OneShot, userIds?: readonly string[]) {
  const { campaignId } = tableStateStore.getState();
  if (!campaignId) return;
  void tableStateApi
    .playFx(campaignId, fx, userIds)
    .catch((e: unknown) =>
      toast.error(translate('table.state.saveFailed'), { description: messageErreur(e) }),
    );
}
