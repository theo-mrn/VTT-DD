import React, { useState } from 'react';
import { collection, addDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { ThemeConfig } from './types';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';


interface ThemePublishTabProps {
    currentConfig: ThemeConfig;
    onSuccess: () => void;
}

export function ThemePublishTab({ currentConfig, onSuccess }: ThemePublishTabProps) {
    const [themeName, setThemeName] = useState('');
    const [isPublishing, setIsPublishing] = useState(false);

    const handlePublish = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!themeName.trim()) {
            toast.error("Veuillez donner un nom à votre thème.");
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            toast.error("Vous devez être connecté pour publier un thème.");
            return;
        }

        setIsPublishing(true);
        try {
            // JSON round-trip removes all `undefined` values, which Firestore does not accept
            const sanitizedConfig = JSON.parse(JSON.stringify(currentConfig));
            await addDoc(collection(db, 'community_themes'), {
                name: themeName.trim(),
                authorId: user.uid,
                authorName: user.displayName || 'Utilisateur Anonyme',
                createdAt: Date.now(),
                likes: 0,
                likedBy: [],
                config: sanitizedConfig
            });

            toast.success("Votre thème a été publié avec succès !");
            setThemeName('');
            onSuccess();
        } catch (error) {
            console.error("Error publishing theme:", error);
            toast.error("Erreur lors de la publication du thème.");
        } finally {
            setIsPublishing(false);
        }
    };

    return (
        <form onSubmit={handlePublish} className="flex flex-col gap-3 mt-2">
            <p className="text-xs text-[#a0a0a0] leading-relaxed">
                Publiez votre configuration actuelle (couleurs, fond, bordures, et disposition des blocs)
                pour que d'autres joueurs puissent l'utiliser.
            </p>

            <div className="flex flex-col gap-1.5 mt-2">
                <label htmlFor="themeName" className="text-xs font-semibold text-[#d4d4d4] ml-1">Nom du Thème *</label>
                <input
                    id="themeName"
                    type="text"
                    value={themeName}
                    onChange={(e) => setThemeName(e.target.value)}
                    placeholder="Ex: Nuit Sombre, Thème Forêt..."
                    className="bg-[#111] border border-[#3a3a3a] rounded-lg px-3 py-2 text-sm text-[#d4d4d4] focus:outline-none focus:border-[#80c0a0] transition-colors"
                    required
                    disabled={isPublishing}
                    maxLength={40}
                />
            </div>

            <button
                type="submit"
                disabled={isPublishing || !themeName.trim()}
                className="mt-2 bg-[#80c0a0]/20 text-[#80c0a0] border border-[#80c0a0]/30 hover:bg-[#80c0a0]/30 hover:border-[#80c0a0]/50 px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isPublishing ? (
                    <>
                        <Loader2 size={16} className="animate-spin" />
                        Publication...
                    </>
                ) : (
                    <>
                        <Send size={16} />
                        Publier sur le portail
                    </>
                )}
            </button>
        </form>
    );
}
