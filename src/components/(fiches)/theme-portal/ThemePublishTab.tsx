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
        <div className="p-6 max-w-md mx-auto">
            <div className="bg-[#1c1c1c] border border-[#3a3a3a] rounded-lg p-6">
                <h3 className="text-lg font-bold text-[#d4d4d4] mb-2">Partager votre Thème</h3>
                <p className="text-sm text-[#a0a0a0] mb-6">
                    Publiez votre configuration actuelle (couleurs, fond, bordures, et disposition des blocs)
                    pour que d'autres joueurs puissent l'utiliser.
                </p>

                <form onSubmit={handlePublish} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                        <label htmlFor="themeName" className="text-sm font-semibold text-[#d4d4d4]">Nom du Thème *</label>
                        <input
                            id="themeName"
                            type="text"
                            value={themeName}
                            onChange={(e) => setThemeName(e.target.value)}
                            placeholder="Ex: Nuit Sombre, Thème Forêt..."
                            className="bg-[#111] border border-[#3a3a3a] rounded px-3 py-2 text-[#d4d4d4] focus:outline-none focus:border-[#d4b48f] transition-colors"
                            required
                            disabled={isPublishing}
                            maxLength={40}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isPublishing || !themeName.trim()}
                        className="mt-4 bg-[#7a2e2e]/80 text-[#d4b48f] border border-[#7a2e2e] hover:bg-[#7a2e2e] px-4 py-2.5 rounded font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPublishing ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Publication...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                Publier sur le portail
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
