import { useState, useCallback } from "react";
import { db, collection, getDocs } from "@/lib/firebase";

interface UserResult {
    id: string;
    name: string;
    titre: string;
    pp: string;
    imageURL?: string;
    bio?: string;
    timeSpent?: number;
    achievements?: number;
    borderType?: string;
    premium?: boolean;
    showPremiumBadge?: boolean;
}

interface UseUserSearchReturn {
    results: UserResult[];
    loading: boolean;
    search: (query: string) => Promise<void>;
    clearResults: () => void;
}

export function useUserSearch(): UseUserSearchReturn {
    const [results, setResults] = useState<UserResult[]>([]);
    const [loading, setLoading] = useState(false);

    const search = useCallback(async (query: string) => {
        if (query.trim() === "") {
            setResults([]);
            return;
        }

        setLoading(true);
        try {
            const usersRef = collection(db, "users");
            const querySnapshot = await getDocs(usersRef);

            const searchResults = querySnapshot.docs
                .map((doc) => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        name: data.name || "Utilisateur",
                        titre: data.titre || "Aucun titre",
                        pp: data.pp || "",
                        imageURL: data.imageURL || "",
                        bio: data.bio || "",
                        timeSpent: data.timeSpent || 0,
                        achievements: data.achievements || 0,
                        borderType: data.borderType || "none",
                        premium: data.premium || false,
                        showPremiumBadge: data.showPremiumBadge ?? true,
                    } as UserResult;
                })
                .filter((user) =>
                    user.name.toLowerCase().includes(query.toLowerCase())
                );

            setResults(searchResults);
        } catch (error) {
            console.error("Error searching users:", error);
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const clearResults = useCallback(() => {
        setResults([]);
    }, []);

    return {
        results,
        loading,
        search,
        clearResults,
    };
}
