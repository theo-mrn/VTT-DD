"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search as SearchIcon, UserPlus, Check, Loader2, User } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ProfileCard } from "@/components/ui/profile-card";
import FriendCard from "../FriendCard";
import EmptyState from "../EmptyState";
import { useUserSearch } from "@/hooks/useUserSearch";

interface FriendData {
    id: string;
    name: string;
    titre: string;
    pp: string;
    imageURL?: string;
    bio?: string;
    timeSpent?: number;
    achievements?: number;
    borderType?: any;
    premium?: boolean;
    showPremiumBadge?: boolean;
}

interface SearchTabProps {
    currentUserId: string | null;
    friends: FriendData[];
    sentRequests: FriendData[];
    onSendRequest: (targetUserId: string, targetUserData: FriendData) => Promise<void>;
    actionLoading?: string | null;
}

export default function SearchTab({
    currentUserId,
    friends,
    sentRequests,
    onSendRequest,
    actionLoading,
}: SearchTabProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");
    const [selectedProfile, setSelectedProfile] = useState<FriendData | null>(null);
    const { results, loading, search } = useUserSearch();

    // Debounce search query
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Trigger search when debounced query changes
    useEffect(() => {
        if (debouncedQuery.trim()) {
            search(debouncedQuery);
        }
    }, [debouncedQuery, search]);

    const handleSearch = () => {
        if (searchQuery.trim()) {
            search(searchQuery);
        }
    };

    const isFriend = (userId: string) => friends.some((f) => f.id === userId);
    const hasSentRequest = (userId: string) => sentRequests.some((r) => r.id === userId);

    return (
        <div className="space-y-4">
            {/* Search Bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <Input
                        type="text"
                        placeholder="Rechercher un utilisateur..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                        className="pl-10 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]"
                    />
                </div>
                <Button
                    onClick={handleSearch}
                    disabled={loading || !searchQuery.trim()}
                    className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white"
                >
                    {loading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <SearchIcon className="h-4 w-4" />
                    )}
                </Button>
            </div>

            {/* Search Hint */}
            {!searchQuery && (
                <div className="text-sm text-[var(--text-secondary)] text-center py-4">
                    Tapez un nom pour rechercher des utilisateurs
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div
                            key={i}
                            className="h-20 bg-[var(--bg-darker)] rounded-lg animate-pulse"
                        />
                    ))}
                </div>
            )}

            {/* Results */}
            {!loading && searchQuery && results.length > 0 && (
                <div className="space-y-3">
                    <div className="text-sm text-[var(--text-secondary)]">
                        {results.length} résultat{results.length > 1 ? "s" : ""} trouvé{results.length > 1 ? "s" : ""}
                    </div>
                    {results.map((result) => {
                        const isCurrentUser = result.id === currentUserId;
                        const isAlreadyFriend = isFriend(result.id);
                        const requestSent = hasSentRequest(result.id);

                        return (
                            <FriendCard
                                key={result.id}
                                id={result.id}
                                name={result.name}
                                titre={result.titre}
                                pp={result.pp}
                                loading={actionLoading === result.id}
                                onClick={() => setSelectedProfile(result)}
                                badge={
                                    isAlreadyFriend ? (
                                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                                    ) : requestSent ? (
                                        <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                    ) : undefined
                                }
                                actions={
                                    isCurrentUser ? (
                                        <span className="text-[var(--accent-blue)] font-semibold text-sm">
                                            C'est vous
                                        </span>
                                    ) : isAlreadyFriend ? (
                                        <span className="text-green-500 font-semibold flex items-center gap-2 text-sm">
                                            <Check className="w-4 h-4" />
                                            Ami
                                        </span>
                                    ) : requestSent ? (
                                        <span className="text-[var(--text-secondary)] font-medium text-sm">
                                            Demande envoyée
                                        </span>
                                    ) : (
                                        <Button
                                            size="sm"
                                            onClick={() => setSelectedProfile(result)}
                                            className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-white"
                                        >
                                            <User className="mr-2 h-4 w-4" />
                                            Voir profil
                                        </Button>
                                    )
                                }
                            />
                        );
                    })}
                </div>
            )}

            {/* No Results */}
            {!loading && searchQuery && results.length === 0 && (
                <EmptyState
                    icon={SearchIcon}
                    title="Aucun utilisateur trouvé"
                    description={`Aucun utilisateur ne correspond à "${searchQuery}"`}
                />
            )}

            {/* Profile Dialog */}
            <Dialog open={!!selectedProfile} onOpenChange={(open) => !open && setSelectedProfile(null)}>
                <DialogContent unstyled className="sm:max-w-md p-0 bg-transparent border-none">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Profil de {selectedProfile?.name}</DialogTitle>
                        <DialogDescription>Détails du profil du joueur</DialogDescription>
                    </DialogHeader>
                    {selectedProfile && (
                        <ProfileCard
                            name={selectedProfile.name}
                            avatarUrl={selectedProfile.pp}
                            backgroundUrl={selectedProfile.imageURL}
                            bio={selectedProfile.bio}
                            timeSpent={selectedProfile.timeSpent}
                            borderType={selectedProfile.borderType}
                            isPremium={selectedProfile.premium && selectedProfile.showPremiumBadge !== false}
                            isInitialFriend={isFriend(selectedProfile.id) || hasSentRequest(selectedProfile.id)}
                            onAction={async (action) => {
                                if (action === "add_friend" && !hasSentRequest(selectedProfile.id)) {
                                    await onSendRequest(selectedProfile.id, selectedProfile);
                                }
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
