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
                const params = new URLSearchParams();
                if (category) {
                    params.append('category', category);
                }

                const response = await fetch(`/api/effects?${params.toString()}`);

                if (!response.ok) {
                    throw new Error(`Failed to fetch effects: ${response.statusText}`);
                }

                const data: EffectsData = await response.json();
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
    // Try to find the effect by matching the filename
    const effect = effects.find(e => {
        // Match by name or by end of localPath
        return e.name === filename || e.localPath.endsWith(filename);
    });

    if (effect) {
        return effect.path; // Return R2 URL
    }

    // Fallback to local path if not found in mappings
    console.warn(`Effect "${filename}" not found in R2 mappings, using local fallback`);
    return `/Effect/${filename}`;
}
