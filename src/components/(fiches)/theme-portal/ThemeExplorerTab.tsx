import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, limit, doc, updateDoc, arrayUnion, arrayRemove, increment } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { ThemeCard } from './ThemeCard';
import { Loader2 } from 'lucide-react';
import { ThemeConfig, CommunityTheme } from './types';

interface ThemeExplorerTabProps {
    onApplyTheme: (config: ThemeConfig) => void;
    onPreviewTheme: (config: ThemeConfig) => void;
    onStopPreview: () => void;
    searchQuery?: string;
}

export function ThemeExplorerTab({ onApplyTheme, onPreviewTheme, onStopPreview, searchQuery = '' }: ThemeExplorerTabProps) {
    const [themes, setThemes] = useState<CommunityTheme[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lockedPreviewId, setLockedPreviewId] = useState<string | null>(null);

    useEffect(() => {
        fetchThemes();
        console.log("ThemeExplorerTab mounted");
        return () => console.log("ThemeExplorerTab unmounted");
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

    const handleToggleLike = async (themeId: string, isCurrentlyLiked: boolean) => {
        const user = auth.currentUser;
        if (!user) return;

        const userId = user.uid;
        const themeRef = doc(db, 'community_themes', themeId);

        // Optimistic UI updates
        setThemes(prevThemes => prevThemes.map(t => {
            if (t.id === themeId) {
                const likedBy = t.likedBy || [];
                if (isCurrentlyLiked) {
                    return { ...t, likes: Math.max(0, t.likes - 1), likedBy: likedBy.filter(id => id !== userId) };
                } else {
                    return { ...t, likes: t.likes + 1, likedBy: [...likedBy, userId] };
                }
            }
            return t;
        }));

        try {
            if (isCurrentlyLiked) {
                await updateDoc(themeRef, {
                    likedBy: arrayRemove(userId),
                    likes: increment(-1)
                });
            } else {
                await updateDoc(themeRef, {
                    likedBy: arrayUnion(userId),
                    likes: increment(1)
                });
            }
        } catch (err) {
            console.error("Error toggling like:", err);
            // Optionally rollback or refetch if it fails
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

    const filteredThemes = themes.filter(theme => {
        if (!searchQuery.trim()) return true;
        const lowerQuery = searchQuery.toLowerCase();
        return theme.name.toLowerCase().includes(lowerQuery) || theme.authorName.toLowerCase().includes(lowerQuery);
    });

    if (filteredThemes.length === 0 && searchQuery.trim() !== '') {
        return (
            <div className="py-12 text-center text-[#a0a0a0]">
                <p className="text-lg">🔍 Aucun thème ne correspond à "{searchQuery}".</p>
                <p className="text-sm mt-2">Essayez d'autres mots-clés (par nom ou par auteur).</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {filteredThemes.map((theme) => (
                    <ThemeCard
                        key={theme.id}
                        theme={theme}
                        currentUserId={auth.currentUser?.uid}
                        onToggleLike={handleToggleLike}
                        isPreviewLocked={lockedPreviewId === theme.id}
                        onTogglePreviewLock={() => {
                            if (lockedPreviewId === theme.id) {
                                setLockedPreviewId(null);
                                onStopPreview(); // Unlock and revert
                            } else {
                                setLockedPreviewId(theme.id);
                                onPreviewTheme(theme.config); // Lock and preview this one
                            }
                        }}
                        onApply={(config) => {
                            setLockedPreviewId(null);
                            onApplyTheme(config);
                        }}
                        onHover={() => {
                            if (!lockedPreviewId) {
                                onPreviewTheme(theme.config);
                            }
                        }}
                        onLeave={() => {
                            if (!lockedPreviewId) {
                                onStopPreview();
                            } else if (lockedPreviewId !== theme.id) {
                                // Restore the locked preview if leaving a non-locked hovered card
                                const lockedTheme = themes.find(t => t.id === lockedPreviewId);
                                if (lockedTheme) {
                                    onPreviewTheme(lockedTheme.config);
                                }
                            }
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
