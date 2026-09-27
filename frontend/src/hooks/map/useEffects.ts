import { useState, useEffect } from 'react';

interface EffectMapping {
  name: string;
  path: string;
  localPath: string;
  category: string;
  type: string;
}

interface EffectsData {
  effects: EffectMapping[];
  grouped: Record<string, EffectMapping[]>;
  total: number;
}

export function useEffects(category?: 'Cone' | 'Fireballs') {
  const [effects, setEffects] = useState<EffectMapping[]>([]);
  const [grouped, setGrouped] = useState<Record<string, EffectMapping[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchEffects = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Même données que l'ancienne route /api/effects : les assets « Effect/* » publiés,
        // lus directement dans la table des assets (pas de route API dans le nouveau front)
        const response = await fetch('/asset-mappings.json');

        if (!response.ok) {
          throw new Error(`Failed to fetch effects: ${response.statusText}`);
        }

        const all = (await response.json()) as EffectMapping[];
        let list = all.filter((m) => m.category?.startsWith('Effect'));
        if (category) list = list.filter((m) => m.category?.includes(category));
        const byGroup = list.reduce(
          (acc, effect) => {
            // Extract subcategory (e.g., "Effect/Cone" -> "Cone")
            const subcategory = effect.category.split('/')[1] || 'Other';
            (acc[subcategory] ??= []).push(effect);
            return acc;
          },
          {} as Record<string, EffectMapping[]>,
        );
        const data: EffectsData = { effects: list, grouped: byGroup, total: list.length };
        setEffects(data.effects);
        setGrouped(data.grouped);
      } catch (err) {
        console.error('Error fetching effects:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchEffects();
  }, [category]);

  return { effects, grouped, isLoading, error };
}

/**
 * Helper function to get the R2 URL for a given effect filename
 * This looks up the mapping and returns the R2 public URL
 */
export function getEffectUrl(filename: string, effects: EffectMapping[]): string {
  // Normalize the filename - ensure it doesn't start with / or /Effect/
  let normalizedFilename = filename.replace(/^\/+/, ''); // Remove leading slashes
  if (normalizedFilename.startsWith('Effect/')) {
    normalizedFilename = normalizedFilename.substring(7); // Remove 'Effect/' prefix
  }

  // Try to find the effect by matching the filename
  const effect = effects.find((e) => {
    // Normalize the localPath for comparison
    let normalizedLocalPath = e.localPath.replace(/^\/+/, '');
    if (normalizedLocalPath.startsWith('Effect/')) {
      normalizedLocalPath = normalizedLocalPath.substring(7);
    }

    // Match by name (exact) or by normalized path (ends with)
    return (
      e.name === normalizedFilename ||
      normalizedLocalPath === normalizedFilename ||
      normalizedLocalPath.endsWith(normalizedFilename) ||
      e.name === filename
    );
  });

  if (effect) {
    return effect.path; // Return R2 URL
  }

  // Fallback to local path if not found in mappings
  console.warn(
    `[getEffectUrl] Effect "${filename}" not found in R2 mappings (${effects.length} effects loaded)`,
  );
  return `/Effect/${normalizedFilename}`;
}
