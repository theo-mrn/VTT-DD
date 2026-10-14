/**
 * Consommateur durable `audio-automations` : un automatisme demande du son
 * (`automation.audio`, publié par le service campaign, docs/automatismes.md) ; le canal est
 * joué ou arrêté comme par une commande du MJ, avec ses événements habituels.
 *
 * Au moins une fois : un événement déjà traité (inbox) est écarté. Une demande impossible (son
 * supprimé, playlist vide) est journalisée et abandonnée, jamais relivrée sans fin.
 */
import { AUTOMATION_AUDIO, AutomationAudioPayload, type EventEnvelope } from '@vtt/contracts';
import { consumeEvents, type Bus, type Logger } from '@vtt/platform';
import { eq } from 'drizzle-orm';
import { inbox } from '../db/schema.js';
import type { Deps } from '../deps.js';
import { executeChannelCommand } from '../modules/channels/execute.js';

export const AUTOMATIONS_CONSUMER = 'audio-automations';

/** Auteur affiché d'un changement fait par un automatisme. */
const SYSTEM_ACTOR = {
  userId: '00000000-0000-0000-0000-000000000000',
  role: 'gm' as const,
  characterId: null,
};

export async function handleAutomationAudio(
  deps: Pick<Deps, 'db' | 'config' | 'storage' | 'now' | 'random'>,
  event: Pick<
    EventEnvelope,
    'id' | 'type' | 'roomId' | 'payload' | 'correlationId' | 'traceparent'
  >,
  logger?: Logger,
): Promise<boolean> {
  if (event.type !== AUTOMATION_AUDIO || !event.roomId) return false;
  const [deja] = await deps.db.select().from(inbox).where(eq(inbox.eventId, event.id));
  if (deja) return false;
  const p = AutomationAudioPayload.safeParse(event.payload);
  if (p.success) {
    const { channel, track } = p.data;
    try {
      await executeChannelCommand(deps, {
        campaignId: event.roomId,
        channel,
        command: track
          ? {
              type: 'play',
              ...(track.playlistId
                ? { playlistId: track.playlistId }
                : { assetId: track.assetId! }),
            }
          : { type: 'stop' },
        actor: SYSTEM_ACTOR,
        ctx: { correlationId: event.correlationId, traceparent: event.traceparent },
      });
    } catch (error) {
      logger?.warn(
        { eventId: event.id, error: (error as Error).message },
        'automatisme : demande de son impossible',
      );
    }
  }
  await deps.db
    .insert(inbox)
    .values({ eventId: event.id, consumer: AUTOMATIONS_CONSUMER })
    .onConflictDoNothing();
  return true;
}

export function startAutomationsConsumer(o: {
  bus: Bus;
  deps: Pick<Deps, 'db' | 'config' | 'storage' | 'now' | 'random'>;
  logger: Logger;
}): Promise<() => Promise<void>> {
  return consumeEvents(o.bus, {
    durable: AUTOMATIONS_CONSUMER,
    subjects: [`vtt.*.${AUTOMATION_AUDIO}`],
    deliver: 'new',
    logger: o.logger,
    async handler(event) {
      await handleAutomationAudio(o.deps, event, o.logger);
    },
  });
}
