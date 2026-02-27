import React, { useState } from 'react';
import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { ThemeConfig } from './types';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';


interface ThemePublishTabProps {
    currentConfig: ThemeConfig;
    onSuccess: () => void;
}

// Helper for robust deep equality, since JSON.stringify is sensitive to key order
const deepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || obj1 === null || typeof obj2 !== 'object' || obj2 === null) {
        return false;
    }
    const keys1 = Object.keys(obj1);
    const keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (const key of keys1) {
        if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
};


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
            // Check current theme count for the user
            const q = query(
                collection(db, 'community_themes'),
                where('authorId', '==', user.uid)
            );
            const querySnapshot = await getDocs(q);

            if (querySnapshot.size >= 5) {
                toast.error("Vous ne pouvez pas publier plus de 5 thèmes.");
                setIsPublishing(false);
                return;
            }

            // Check if a theme with exactly the same config already exists for this user
            const sanitizedConfig = JSON.parse(JSON.stringify(currentConfig));
            const isDuplicate = querySnapshot.docs.some(doc => {
                const data = doc.data();
                return deepEqual(data.config, sanitizedConfig);
            });

            if (isDuplicate) {
                toast.error("Vous avez déjà publié un thème avec cette exact configuration.");
                setIsPublishing(false);
                return;
            }

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
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                Publiez votre configuration actuelle (couleurs, fond, bordures, et disposition des blocs)
                pour que d'autres joueurs puissent l'utiliser.
            </p>

            <div className="flex flex-col gap-1.5 mt-2">
                <label htmlFor="themeName" className="text-xs font-semibold text-[var(--text-primary)] ml-1">Nom du Thème *</label>
                <input
                    id="themeName"
                    type="text"
                    value={themeName}
                    onChange={(e) => setThemeName(e.target.value)}
                    placeholder="Ex: Nuit Sombre, Thème Forêt..."
                    className="bg-[var(--bg-dark)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-brown)] transition-colors"
                    required
                    disabled={isPublishing}
                    maxLength={40}
                />
            </div>

            <button
                type="submit"
                disabled={isPublishing || !themeName.trim()}
                className="mt-2 button-primary w-full flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
