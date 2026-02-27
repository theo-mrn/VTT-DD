import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { ThemeCard } from './ThemeCard';
import { Loader2, Edit2, AlertTriangle, Send } from 'lucide-react';
import { ThemeConfig, CommunityTheme } from './types';
import { toast } from 'sonner';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";

interface MyThemesTabProps {
    onApplyTheme: (config: ThemeConfig) => void;
    onPreviewTheme: (config: ThemeConfig) => void;
    onStopPreview: () => void;
    currentConfig: ThemeConfig;
}

export function MyThemesTab({ onApplyTheme, onPreviewTheme, onStopPreview, currentConfig }: MyThemesTabProps) {
    const [themes, setThemes] = useState<CommunityTheme[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lockedPreviewId, setLockedPreviewId] = useState<string | null>(null);

    // Editing state
    const [editingTheme, setEditingTheme] = useState<CommunityTheme | null>(null);
    const [editName, setEditName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Deleting state
    const [deletingThemeId, setDeletingThemeId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchThemes();
    }, []);

    const fetchThemes = async () => {
        const user = auth.currentUser;
        if (!user) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            const q = query(
                collection(db, 'community_themes'),
                where('authorId', '==', user.uid)
            );

            const querySnapshot = await getDocs(q);
            const fetchedThemes = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as CommunityTheme[];

            // Sort client-side by createdAt desc
            fetchedThemes.sort((a, b) => b.createdAt - a.createdAt);

            setThemes(fetchedThemes);
        } catch (err) {
            console.error('Error fetching my themes:', err);
            setError('Erreur lors du chargement de vos thèmes.');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingThemeId) return;

        setIsDeleting(true);
        try {
            await deleteDoc(doc(db, 'community_themes', deletingThemeId));
            setThemes(prev => prev.filter(t => t.id !== deletingThemeId));
            toast.success("Thème supprimé avec succès.");
            if (lockedPreviewId === deletingThemeId) {
                setLockedPreviewId(null);
                onStopPreview();
            }
        } catch (err) {
            console.error("Error deleting theme:", err);
            toast.error("Erreur lors de la suppression.");
        } finally {
            setIsDeleting(false);
            setDeletingThemeId(null);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingTheme) return;
        if (!editName.trim()) {
            toast.error("Veuillez donner un nom à votre thème.");
            return;
        }

        setIsSaving(true);
        try {
            const sanitizedConfig = JSON.parse(JSON.stringify(currentConfig));
            await updateDoc(doc(db, 'community_themes', editingTheme.id), {
                name: editName.trim(),
                config: sanitizedConfig
            });

            setThemes(prev => prev.map(t =>
                t.id === editingTheme.id
                    ? { ...t, name: editName.trim(), config: sanitizedConfig }
                    : t
            ));
            toast.success("Thème mis à jour avec la configuration actuelle !");
            setEditingTheme(null);
        } catch (err) {
            console.error("Error updating theme:", err);
            toast.error("Erreur lors de la mise à jour.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!auth.currentUser) {
        return (
            <div className="py-12 text-center text-[#a0a0a0]">
                <p>Vous devez être connecté pour voir vos thèmes.</p>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-[#a0a0a0]">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p>Chargement de vos thèmes...</p>
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
                <p className="text-lg">✨ Vous n'avez pas encore publié de thème.</p>
                <p className="text-sm mt-2">Allez dans "Partager mon thème" pour commencer !</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2 relative">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {themes.map((theme) => (
                    <ThemeCard
                        key={theme.id}
                        theme={theme}
                        currentUserId={auth.currentUser?.uid}
                        isPreviewLocked={lockedPreviewId === theme.id}
                        onEdit={(t) => {
                            setEditingTheme(t);
                            setEditName(t.name);
                        }}
                        onDelete={(id) => setDeletingThemeId(id)}
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

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deletingThemeId} onOpenChange={(open) => !open && setDeletingThemeId(null)}>
                <DialogContent className="bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4] max-w-sm p-5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#d4d4d4] text-lg font-bold flex items-center gap-2">
                            <AlertTriangle size={18} className="text-red-400" />
                            Supprimer ce thème ?
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-[#a0a0a0] my-2">
                        Cette action est irréversible. Le thème sera définitivement supprimé de la communauté.
                    </p>
                    <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
                        <button
                            onClick={() => setDeletingThemeId(null)}
                            disabled={isDeleting}
                            className="bg-transparent hover:bg-[#2a2a2a] px-3 py-1.5 rounded text-sm font-semibold text-[#a0a0a0] hover:text-white transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="bg-red-900/40 text-red-300 hover:bg-red-800/60 px-4 py-1.5 rounded text-sm font-semibold transition-all disabled:opacity-50"
                        >
                            {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Supprimer'}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Theme Dialog */}
            <Dialog open={!!editingTheme} onOpenChange={(open) => !open && setEditingTheme(null)}>
                <DialogContent className="bg-[#1c1c1c] border border-[#3a3a3a] text-[#d4d4d4] max-w-sm p-5 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-[#d4d4d4] text-lg font-bold flex items-center gap-2">
                            <Edit2 size={18} className="text-yellow-400" />
                            Modifier le thème
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col gap-3 mt-2">
                        <p className="text-xs text-[#a0a0a0] leading-relaxed">
                            Mettez à jour le nom de votre thème ou remplacez sa configuration par votre <strong>configuration actuelle</strong> (couleurs, fond, blocs).
                        </p>

                        <div className="flex flex-col gap-1.5 mt-2">
                            <label htmlFor="editThemeName" className="text-xs font-semibold text-[#d4d4d4] ml-1">Nom du thème</label>
                            <input
                                id="editThemeName"
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-[#d4d4d4] focus:outline-none focus:border-[#80c0a0] transition-colors"
                                required
                                disabled={isSaving}
                                maxLength={40}
                            />
                        </div>
                    </div>

                    <DialogFooter className="mt-4 flex gap-2 sm:justify-end">
                        <button
                            onClick={() => setEditingTheme(null)}
                            disabled={isSaving}
                            className="bg-transparent hover:bg-[#2a2a2a] px-3 py-1.5 rounded text-sm font-semibold text-[#a0a0a0] hover:text-white transition-colors"
                        >
                            Annuler
                        </button>
                        <button
                            onClick={handleSaveEdit}
                            disabled={isSaving || !editName.trim()}
                            className="bg-yellow-900/40 text-yellow-300 hover:bg-yellow-800/60 px-4 py-1.5 rounded text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <><Send size={16} /> Mettre à jour</>}
                        </button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
