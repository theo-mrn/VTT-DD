/**
 * Description d'un lieu par un modèle Claude, à l'import (docs/bibliotheque.md § Import) : titre,
 * description et mots-clés en français et en anglais, facettes. Une réponse JSON validée (sortie
 * structurée), puis nettoyée. Le modèle ne voit que l'image et l'indice du nom de fichier.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BackgroundMood, BackgroundPlace, BackgroundSetting, BackgroundTime } from '@vtt/contracts';
import { z } from 'zod';

/** Version du gabarit de description : la changer redécrit tout (`described_by`). */
export const DESCRIBE_TEMPLATE = 1;

export const EFFORTS = ['low', 'medium', 'high'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Réponse demandée au modèle (API ou agent). */
export const Answer = z.object({
  title_fr: z.string(),
  title_en: z.string(),
  description_fr: z.string(),
  description_en: z.string(),
  keywords_fr: z.array(z.string()),
  keywords_en: z.array(z.string()),
  place: BackgroundPlace,
  setting: BackgroundSetting,
  time_of_day: BackgroundTime,
  moods: z.array(BackgroundMood),
});
export type Answer = z.infer<typeof Answer>;

export interface Description {
  titleFr: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEn: string;
  keywordsFr: string[];
  keywordsEn: string[];
  place: BackgroundPlace;
  setting: BackgroundSetting;
  timeOfDay: BackgroundTime;
  moods: BackgroundMood[];
}

export interface DescribeUsage {
  /** Modèle qui a répondu (un repli peut en changer). */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export type Describer = (
  image: Buffer,
  context: { hint: string; collection: string | null },
) => Promise<{ description: Description; usage: DescribeUsage }>;

export const SYSTEM = `You catalogue background illustrations for a virtual tabletop used by French-speaking game masters (D&D and other fantasy role-playing games). Game masters search the library by what a picture shows: the kind of place, inside or outside, light, weather, time of day, atmosphere and notable elements ("a huge tree", "a cave lit by crystals", "the inside of a castle"). Describe only what is visible in the image.

Write every field in both French and English (French fields in natural French, English fields in natural English):
- title: 2 to 6 words naming the place, sentence case, no final punctuation, no quotes.
- description: one or two sentences a game master can read at a glance: the place, its notable elements, the light and the mood. No game mechanics, no invented story, no artist, tool or prompt names.
- keywords: 12 to 25 lowercase words or short phrases: the kind of place, visible elements (tree, waterfall, statue, crystals, bridge…), materials, light (lit, dark, glowing), weather, time of day, mood, and the synonyms a game master might type (in French for example grotte, caverne, souterrain). No duplicates.
- place: the main kind of location; "other" when none fits.
- setting: indoor, outdoor or underground.
- time_of_day: day, dusk (dawn or sunset), night, or unknown when nothing shows it.
- moods: one to three.

The file name hint is the truncated prompt that generated the picture: use it only to settle an ambiguity, and trust the image when they disagree.`;

/** Nettoie une réponse : espaces, longueurs, doublons de mots-clés. */
export function cleanAnswer(a: Answer): Description {
  const line = (s: string, max: number) =>
    s
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.。]+$/u, '')
      .slice(0, max);
  const keywords = (list: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const k of list) {
      const v = k.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 60);
      if (v && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
    return out.slice(0, 40);
  };
  return {
    titleFr: line(a.title_fr, 120),
    titleEn: line(a.title_en, 120),
    descriptionFr: a.description_fr.replace(/\s+/g, ' ').trim().slice(0, 1000),
    descriptionEn: a.description_en.replace(/\s+/g, ' ').trim().slice(0, 1000),
    keywordsFr: keywords(a.keywords_fr),
    keywordsEn: keywords(a.keywords_en),
    place: a.place,
    setting: a.setting,
    timeOfDay: a.time_of_day,
    moods: [...new Set(a.moods)].slice(0, 3),
  };
}

/**
 * Descripteur branché sur l'API Claude. La clé vient de l'environnement (ANTHROPIC_API_KEY).
 * Un refus du modèle repasse côté serveur sur le modèle de repli recommandé (`fallbacks`).
 */
export function claudeDescriber(opts: { model: string; effort: Effort }): Describer {
  const client = new Anthropic({ maxRetries: 4 });
  return async (image, { hint, collection }) => {
    const response = await client.beta.messages.parse({
      model: opts.model,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      output_config: { effort: opts.effort, format: betaZodOutputFormat(Answer) },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/webp', data: image.toString('base64') },
            },
            {
              type: 'text',
              text: `File name hint: "${hint}".${collection ? ` Collection: "${collection}".` : ''}`,
            },
          ],
        },
      ],
    });
    if (response.stop_reason === 'refusal')
      throw new Error(
        `description refusée (${response.stop_details?.category ?? 'sans catégorie'})`,
      );
    if (response.stop_reason === 'max_tokens') throw new Error('description coupée (max_tokens)');
    if (!response.parsed_output) throw new Error('réponse illisible (JSON attendu)');
    return {
      description: cleanAnswer(response.parsed_output),
      usage: {
        model: response.model,
        inputTokens:
          response.usage.input_tokens +
          (response.usage.cache_creation_input_tokens ?? 0) +
          (response.usage.cache_read_input_tokens ?? 0),
        outputTokens: response.usage.output_tokens,
      },
    };
  };
}

/** Prix publics en dollars par million de jetons (entrée, sortie), pour l'estimation du coût. */
const PRICES: Record<string, [number, number]> = {
  'claude-opus-5-5': [4, 20],
  'claude-sonnet-5-5': [2, 10],
  'claude-haiku-5-5': [0.1, 0.5],
};

/** Coût estimé en dollars, ou null pour un modèle sans prix connu ici. */
export function estimatedCost(u: DescribeUsage): number | null {
  const p = PRICES[u.model];
  return p ? (u.inputTokens * p[0] + u.outputTokens * p[1]) / 1_000_000 : null;
}
