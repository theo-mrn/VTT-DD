/**
 * Règles des titres débloqués par les événements du bus, reprises de l'ancienne app :
 *
 * - dice-roller.tsx (handleRoll) : « Maudit des dés » / « Béni des Dieux » au
 *   premier 1 / 20 naturel sur un d20 du jet (tous les d20 physiques, gardés ou
 *   non). L'e-mail qui accompagnait ce déblocage est reporté (voir consumer.ts) ;
 * - challenge-tracker.ts (trackDiceRoll, trackChatMessage) et challenges.ts
 *   (défis actifs récompensés par un titre) : compteurs de jets, de critiques
 *   et de messages. Comme trackDiceRoll, un jet compte pour 1 quel que soit le
 *   nombre de dés, et le critique se lit sur le premier dé du premier groupe,
 *   seulement si c'est un d20. Les seuils sont ceux des défis (50 et 200
 *   messages), pas ceux affichés par le catalogue (100 et 500).
 *
 * Critère « vrai jet » (événement dice.rolled) :
 * - dans une campagne (roomId non nul) : l'ancienne app ne suivait que les jets
 *   lancés dans une salle ;
 * - source 3d, mixed, free ou action : lancé à l'instant par le joueur (dés 3D,
 *   tirage du serveur, action de fiche). `import` (historique Firebase) ne
 *   débloque rien ; `api` (clé d'API) non plus, comme l'ancienne route
 *   /api/roll-dice qui ne suivait pas les défis. Toute autre source est ignorée.
 * - jets cachés (MJ) et privés compris : l'ancienne app ne les excluait pas.
 */
import type { EventEnvelope } from '@vtt/contracts';
import { z } from 'zod';
import { slugDe } from './catalogue.js';

export type Counter = 'dice_rolls' | 'critical_successes' | 'critical_fails' | 'chat_messages';

/** Sujets du bus lus par le consommateur des titres. */
export const TITLE_SUBJECTS = ['vtt.*.dice.rolled', 'vtt.*.campaign.message_posted'];

/** Sources de jet qui comptent (voir le critère en tête de fichier). */
export const COUNTED_ROLL_SOURCES: ReadonlySet<string> = new Set(['3d', 'mixed', 'free', 'action']);

/** Titres à paliers : défis actifs de challenges.ts récompensés par un titre. */
export const COUNTER_TITLES: readonly { counter: Counter; min: number; slug: string }[] = [
  { counter: 'dice_rolls', min: 1, slug: slugDe('Apprenti Lanceur') },
  { counter: 'dice_rolls', min: 50, slug: slugDe('Lanceur Enthousiaste') },
  { counter: 'critical_successes', min: 1, slug: slugDe('Chanceux') },
  { counter: 'critical_fails', min: 10, slug: slugDe('Éternel Malchanceux') },
  { counter: 'chat_messages', min: 1, slug: slugDe('Orateur Novice') },
  { counter: 'chat_messages', min: 50, slug: slugDe('Conteur Bavard') },
  { counter: 'chat_messages', min: 200, slug: slugDe('Barde Légendaire') },
];

export const CURSED_SLUG = slugDe('Maudit des dés');
export const BLESSED_SLUG = slugDe('Béni des Dieux');

/** Ce qu'un événement change pour un joueur. */
export interface TitleEffects {
  userId: string;
  increments: Partial<Record<Counter, number>>;
  /** Titres débloqués directement par l'événement, sans compteur. */
  unlocks: string[];
}

const DiceRolled = z.object({
  authorId: z.uuid().nullish(),
  source: z.string(),
  dice: z
    .array(z.object({ faces: z.number(), values: z.array(z.object({ value: z.number() })) }))
    .nullish(),
});

const MessagePosted = z.object({ authorId: z.uuid().nullish() });

/** Effets d'un événement du bus sur les titres ; null s'il n'en a aucun. */
export function titleEffects(event: EventEnvelope): TitleEffects | null {
  // Hors campagne, rien ne compte (l'ancienne app ne suivait que les salles)
  if (!event.roomId) return null;
  switch (event.type) {
    case 'dice.rolled':
      return diceRolled(event);
    case 'campaign.message_posted': {
      const p = MessagePosted.safeParse(event.payload);
      const userId = (p.success ? p.data.authorId : null) ?? event.actor.userId;
      if (!p.success || !userId) return null;
      return { userId, increments: { chat_messages: 1 }, unlocks: [] };
    }
    default:
      return null;
  }
}

function diceRolled(event: EventEnvelope): TitleEffects | null {
  const p = DiceRolled.safeParse(event.payload);
  if (!p.success || !COUNTED_ROLL_SOURCES.has(p.data.source)) return null;
  const userId = p.data.authorId ?? event.actor.userId;
  if (!userId) return null;
  const groups = p.data.dice ?? [];

  const increments: TitleEffects['increments'] = { dice_rolls: 1 };
  // trackDiceRoll : premier dé du premier groupe, seulement si c'est un d20.
  // (Les dés à symboles n'ont pas de groupe numérique : jamais de critique.)
  const first = groups[0];
  const main = first?.faces === 20 ? first.values[0]?.value : undefined;
  if (main === 20) increments.critical_successes = 1;
  if (main === 1) increments.critical_fails = 1;

  // handleRoll : n'importe quel d20 physique du jet
  const d20 = new Set(
    groups.filter((g) => g.faces === 20).flatMap((g) => g.values.map((v) => v.value)),
  );
  const unlocks: string[] = [];
  if (d20.has(1)) unlocks.push(CURSED_SLUG);
  if (d20.has(20)) unlocks.push(BLESSED_SLUG);

  return { userId, increments, unlocks };
}

/** Titres à paliers atteints avec les nouvelles valeurs des compteurs. */
export function reachedTitles(values: Partial<Record<Counter, number>>): string[] {
  return COUNTER_TITLES.filter((t) => (values[t.counter] ?? 0) >= t.min).map((t) => t.slug);
}
