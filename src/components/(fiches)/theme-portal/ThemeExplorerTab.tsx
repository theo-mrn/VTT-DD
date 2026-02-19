import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ThemeCard } from './ThemeCard';
import { Loader2 } from 'lucide-react';
import { ThemeConfig, CommunityTheme } from './types';

interface ThemeExplorerTabProps {
    onApplyTheme: (config: ThemeConfig) => void;
    onPreviewTheme: (config: ThemeConfig) => void;
    onStopPreview: () => void;
}

export function ThemeExplorerTab({ onApplyTheme, onPreviewTheme, onStopPreview }: ThemeExplorerTabProps) {
    const [themes, setThemes] = useState<CommunityTheme[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchThemes();
    }, []);

    const fetchThemes = async () => {
        try {
            setLoading(true);
            const q = query(
                collection(db, 'community_themes'),
                orderBy('createdAt', 'desc'),
                limit(50)
            );

            const querySnapshot = await getDocs(q);
            const fetchedThemes = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as CommunityTheme[];

            setThemes(fetchedThemes);
        } catch (err) {
            console.error('Error fetching community themes:', err);
            setError('Erreur lors du chargement des thèmes communautaires.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[#a0a0a0]">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Chargement des thèmes de la communauté...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-8 text-center text-red-400">
                <p>{error}</p>
                <button onClick={fetchThemes} className="mt-4 text-xs underline">Réessayer</button>
            </div>
        );
    }

    if (themes.length === 0) {
        return (
            <div className="py-12 text-center text-[#a0a0a0]">
                <p className="text-lg">✨ Aucun thème communautaire pour l'instant.</p>
                <p className="text-sm mt-2">Soyez le premier à partager votre création dans l'onglet Publier !</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs text-[#666] italic mb-1">
                Survolez un thème pour l'aperçu en direct sur votre fiche, cliquez « Appliquer » pour l'adopter.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {themes.map((theme) => (
                    <ThemeCard
                        key={theme.id}
                        theme={theme}
                        onApply={onApplyTheme}
                        onHover={(t) => onPreviewTheme(theme.config)}
                        onLeave={onStopPreview}
                    />
                ))}
            </div>
        </div>
    );
}
