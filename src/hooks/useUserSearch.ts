import { useState, useCallback } from "react";
import { db, collection, getDocs } from "@/lib/firebase";

interface UserResult {
    id: string;
    name: string;
    titre: string;
    pp: string;
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
