"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, XCircle, Users, ArrowUpDown } from "lucide-react";
import FriendCard from "../FriendCard";
import EmptyState from "../EmptyState";

interface FriendData {
    id: string;
    name: string;
    titre: string;
    pp: string;
}

interface FriendsTabProps {
    friends: FriendData[];
    onRemoveFriend: (friendId: string) => Promise<void>;
    loading?: boolean;
    actionLoading?: string | null;
}

type SortOption = "name" | "recent";

export default function FriendsTab({
    friends,
    onRemoveFriend,
    loading,
    actionLoading,
}: FriendsTabProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [sortBy, setSortBy] = useState<SortOption>("name");

    const filteredAndSortedFriends = useMemo(() => {
        let filtered = friends;

        // Filter by search query
        if (searchQuery.trim()) {
            filtered = friends.filter((friend) =>
                friend.name.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }

        // Sort
        const sorted = [...filtered].sort((a, b) => {
            if (sortBy === "name") {
                return a.name.localeCompare(b.name);
            }
            // For "recent", we'd need a timestamp - for now just return as-is
            return 0;
        });

        return sorted;
    }, [friends, searchQuery, sortBy]);

    const handleRemove = async (friendId: string) => {
        if (confirm("Êtes-vous sûr de vouloir retirer cet ami ?")) {
            await onRemoveFriend(friendId);
        }
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        className="h-20 bg-[var(--bg-darker)] rounded-lg animate-pulse"
                    />
                ))}
            </div>
        );
    }

    if (friends.length === 0) {
        return (
            <EmptyState
                icon={Users}
                title="Aucun ami"
                description="Vous n'avez pas encore d'amis. Utilisez la recherche pour trouver et ajouter des utilisateurs."
            />
        );
    }

    return (
        <div className="space-y-4">
            {/* Search and Sort Bar */}
            <div className="flex gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <Input
                        type="text"
                        placeholder="Rechercher dans vos amis..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]"
                    />
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSortBy(sortBy === "name" ? "recent" : "name")}
                    className="border-[var(--border-color)] gap-2"
                >
                    <ArrowUpDown className="w-4 h-4" />
                    {sortBy === "name" ? "Nom" : "Récent"}
                </Button>
            </div>

            {/* Friends Count */}
            <div className="text-sm text-[var(--text-secondary)]">
                {filteredAndSortedFriends.length} ami{filteredAndSortedFriends.length > 1 ? "s" : ""}
                {searchQuery && ` (filtré${filteredAndSortedFriends.length > 1 ? "s" : ""})`}
            </div>

            {/* Friends Grid */}
            {filteredAndSortedFriends.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                    {filteredAndSortedFriends.map((friend) => (
                        <FriendCard
                            key={friend.id}
                            id={friend.id}
                            name={friend.name}
                            titre={friend.titre}
                            pp={friend.pp}
                            loading={actionLoading === friend.id}
                            actions={
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleRemove(friend.id)}
                                    disabled={actionLoading === friend.id}
                                    className="bg-red-500 hover:bg-red-600"
                                >
                                    <XCircle className="w-4 h-4 mr-2" />
                                    Retirer
                                </Button>
                            }
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-8 text-[var(--text-secondary)]">
                    Aucun ami trouvé avec "{searchQuery}"
                </div>
            )}
        </div>
    );
}
