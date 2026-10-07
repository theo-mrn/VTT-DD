/**
 * Activités déduites des événements du bus (docs/progression.md § 3) : fonction
 * pure de l'enveloppe, sans base de données. Le consommateur
 * identity-progression les enregistre ensuite (consumer.ts, service.ts).
 *
 * Critère « vrai jet » repris des titres (titres/event-rules.ts) : sources 3d,
 * mixed, free et action ; jamais import ni api. Contrairement aux titres, un jet
 * personnel (hors campagne) compte aussi : seule la séance demande une campagne.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { z } from 'zod';
import { COUNTED_ROLL_SOURCES } from '../titres/event-rules.js';
import { parisDay } from './periods.js';
import type { ActivityKind } from './rules.js';

/** Sujets du bus lus par le consommateur de la progression. */
export const PROGRESSION_SUBJECTS = [
  'vtt.*.dice.rolled',
  'vtt.*.campaign.message_posted',
  'vtt.*.campaign.created',
  'vtt.*.campaign.member_joined',
  'vtt.*.campaign.session_scheduled',
  'vtt.*.note.created',
  'vtt.*.character.created',
  'vtt.global.identity.play_time_added',
  'vtt.global.identity.friend_request_accepted',
  'vtt.global.identity.profile_updated',
];

/** Condition à vérifier en base avant d'enregistrer l'activité. */
export type ActivityCondition = 'profile_complete';

export interface Activity {
  userId: string;
  kind: ActivityKind;
  units: number;
  /** Clé d'unicité : une activité déjà vue avec cette clé est ignorée. */
  key?: string;
  condition?: ActivityCondition;
}

const Uuid = z.uuid();
const DiceRolled = z.object({ authorId: Uuid.nullish(), source: z.string() });
const WithAuthor = z.object({ authorId: Uuid.nullish() });
const NoteCreated = z.object({ ownerId: Uuid.nullish() });
const CharacterCreated = z.object({ kind: z.string().nullish() });
const PlayTime = z.object({ minutes: z.number().int().min(1).max(60) });
const FriendAccepted = z.object({ friendId: Uuid });
const ProfileUpdated = z.object({ fields: z.array(z.string()) });

/** Champs dont un changement peut compléter le profil (avatar ou bio). */
const PROFILE_FIELDS = new Set(['avatarUrl', 'bio']);

const actorOf = (event: EventEnvelope) => event.actor.userId;

/** Séance jouée : une par campagne et par jour de Paris. */
function sessionPlayed(userId: string, event: EventEnvelope): Activity | null {
  if (!event.roomId) return null;
  const day = parisDay(new Date(event.occurredAt));
  return { userId, kind: 'session_played', units: 1, key: `${event.roomId}:${day}` };
}

function withSession(first: Activity, event: EventEnvelope): Activity[] {
  const session = sessionPlayed(first.userId, event);
  return session ? [first, session] : [first];
}

/** Activités d'un événement ; [] s'il n'en porte aucune. */
export function activitiesOf(event: EventEnvelope): Activity[] {
  switch (event.type) {
    case 'dice.rolled': {
      const p = DiceRolled.safeParse(event.payload);
      if (!p.success || !COUNTED_ROLL_SOURCES.has(p.data.source)) return [];
      const userId = p.data.authorId ?? actorOf(event);
      if (!userId) return [];
      return withSession({ userId, kind: 'dice_roll', units: 1 }, event);
    }
    case 'campaign.message_posted': {
      const p = WithAuthor.safeParse(event.payload);
      const userId = (p.success ? p.data.authorId : null) ?? actorOf(event);
      if (!p.success || !userId) return [];
      return withSession({ userId, kind: 'chat_message', units: 1 }, event);
    }
    case 'campaign.created': {
      // L'import (acteur système) ne compte pas
      const userId = actorOf(event);
      if (!userId || event.actor.role === 'system') return [];
      return [{ userId, kind: 'campaign_created', units: 1 }];
    }
    case 'campaign.member_joined': {
      const userId = actorOf(event);
      if (!userId || !event.roomId) return [];
      return [{ userId, kind: 'campaign_joined', units: 1, key: event.roomId }];
    }
    case 'campaign.session_scheduled': {
      const userId = actorOf(event);
      if (!userId || event.actor.role === 'system') return [];
      return [{ userId, kind: 'session_scheduled', units: 1 }];
    }
    case 'note.created': {
      const p = NoteCreated.safeParse(event.payload);
      const userId = (p.success ? p.data.ownerId : null) ?? actorOf(event);
      if (!userId) return [];
      return [{ userId, kind: 'note_written', units: 1 }];
    }
    case 'character.created': {
      // Personnage d'un joueur seulement : ni PNJ posé par le MJ, ni import
      const p = CharacterCreated.safeParse(event.payload);
      const userId = actorOf(event);
      if (!p.success || !userId || event.actor.role !== 'user' || p.data.kind === 'npc') return [];
      return [{ userId, kind: 'character_created', units: 1 }];
    }
    case 'identity.play_time_added': {
      const p = PlayTime.safeParse(event.payload);
      const userId = actorOf(event);
      if (!p.success || !userId) return [];
      return [{ userId, kind: 'play_minutes', units: p.data.minutes }];
    }
    case 'identity.friend_request_accepted': {
      const p = FriendAccepted.safeParse(event.payload);
      const userId = actorOf(event);
      if (!p.success || !userId || p.data.friendId === userId) return [];
      return [
        { userId, kind: 'friend_added', units: 1, key: p.data.friendId },
        { userId: p.data.friendId, kind: 'friend_added', units: 1, key: userId },
      ];
    }
    case 'identity.profile_updated': {
      const p = ProfileUpdated.safeParse(event.payload);
      const userId = actorOf(event);
      if (!p.success || !userId || !p.data.fields.some((f) => PROFILE_FIELDS.has(f))) return [];
      return [
        {
          userId,
          kind: 'profile_completed',
          units: 1,
          key: 'once',
          condition: 'profile_complete',
        },
      ];
    }
    default:
      return [];
  }
}
