"use client";

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Search as SearchIcon, UserPlus, Check, XCircle, Users,
    Inbox, Send, ArrowLeft, Loader2, X as XIcon
} from "lucide-react";
import FriendCard from "../FriendCard";
import EmptyState from "../EmptyState";
import { useUserSearch } from "@/hooks/useUserSearch";

interface FriendData {
    id: string;
    name: string;
    titre: string;
    pp: string;
}

interface MergedFriendsTabProps {
    currentUserId: string | null;
    friends: FriendData[];
    friendRequests: FriendData[];
    sentRequests: FriendData[];
    onSendRequest: (targetUserId: string, targetUserData: FriendData) => Promise<void>;
    onAcceptRequest: (requestId: string, friendData: FriendData) => Promise<void>;
    onDeclineRequest: (requestId: string) => Promise<void>;
    onCancelRequest: (requestId: string) => Promise<void>;
    onRemoveFriend: (friendId: string) => Promise<void>;
    loading?: boolean;
    actionLoading?: string | null;
}

type ViewMode = "main" | "requests";

export default function MergedFriendsTab({
    currentUserId,
    friends,
    friendRequests,
    sentRequests,
    onSendRequest,
    onAcceptRequest,
    onDeclineRequest,
    onCancelRequest,
    onRemoveFriend,
    loading: initialLoading,
    actionLoading,
}: MergedFriendsTabProps) {
    const [view, setView] = useState<ViewMode>("main");
    const [searchQuery, setSearchQuery] = useState("");
    const [debouncedQuery, setDebouncedQuery] = useState("");

    const { results, loading: searchLoading, search } = useUserSearch();

    // Pending requests count
    const totalRequests = friendRequests.length;

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Handle search
    useEffect(() => {
        if (debouncedQuery.trim()) {
            search(debouncedQuery);
        }
    }, [debouncedQuery, search]);

    const isFriend = (userId: string) => friends.some((f) => f.id === userId);
    const hasSentRequest = (userId: string) => sentRequests.some((r) => r.id === userId);

    if (initialLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="h-20 bg-[var(--bg-darker)] rounded-lg animate-pulse" />
                ))}
            </div>
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // VIEW: REQUESTS
    // ────────────────────────────────────────────────────────────────────────
    if (view === "requests") {
        return (
            <div className="space-y-6">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setView("main")} className="p-2 h-auto text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                        <ArrowLeft className="w-5 h-5 mr-1" /> Retour
                    </Button>
                    <h3 className="font-semibold text-lg text-[var(--text-primary)]">Demandes d'amis</h3>
                </div>

                <div className="space-y-8">
                    {/* Received */}
                    <section className="space-y-3">
                        <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1 flex items-center gap-2">
                            <Inbox className="w-4 h-4" /> Reçues ({friendRequests.length})
                        </h4>
                        {friendRequests.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {friendRequests.map((req) => (
                                    <FriendCard
                                        key={req.id}
                                        id={req.id}
                                        name={req.name}
                                        titre={req.titre}
                                        pp={req.pp}
                                        loading={actionLoading === req.id}
                                        actions={
                                            <div className="flex gap-2">
                                                <Button size="sm" onClick={() => onAcceptRequest(req.id, req)} disabled={actionLoading === req.id} className="bg-green-500 hover:bg-green-600 text-white">
                                                    <Check className="w-4 h-4 mr-2" /> Accepter
                                                </Button>
                                                <Button size="icon" variant="outline" onClick={() => onDeclineRequest(req.id)} disabled={actionLoading === req.id} className="border-[var(--border-color)]">
                                                    <XIcon className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--text-secondary)] py-2">Aucune demande reçue.</p>
                        )}
                    </section>

                    {/* Sent */}
                    <section className="space-y-3 border-t border-[var(--border-color)] pt-6">
                        <h4 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1 flex items-center gap-2">
                            <Send className="w-4 h-4" /> Envoyées ({sentRequests.length})
                        </h4>
                        {sentRequests.length > 0 ? (
                            <div className="grid gap-3 md:grid-cols-2">
                                {sentRequests.map((req) => (
                                    <FriendCard
                                        key={req.id}
                                        id={req.id}
                                        name={req.name}
                                        titre={req.titre}
                                        pp={req.pp}
                                        loading={actionLoading === req.id}
                                        badge={<div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />}
                                        actions={
                                            <Button size="sm" variant="outline" onClick={() => onCancelRequest(req.id)} disabled={actionLoading === req.id} className="border-[var(--border-color)]">
                                                Annuler
                                            </Button>
                                        }
                                    />
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-[var(--text-secondary)] py-2">Aucune demande envoyée.</p>
                        )}
                    </section>
                </div>
            </div>
        );
    }

    // ────────────────────────────────────────────────────────────────────────
    // VIEW: MAIN (Search + Friends List)
    // ────────────────────────────────────────────────────────────────────────
    const isSearching = searchQuery.trim().length > 0;

    return (
        <div className="space-y-6">
            {/* Top Bar: Search + Requests Button */}
            <div className="flex flex-col sm:flex-row items-stretch gap-3">
                <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                    <Input
                        type="text"
                        placeholder="Rechercher des utilisateurs ou amis..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)] rounded-full h-11 focus-visible:ring-1 focus-visible:ring-[var(--accent-brown)] focus-visible:border-[var(--accent-brown)] focus-visible:ring-offset-0 transition-colors"
                    />
                    {isSearching && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-secondary)] hover:text-white"
                        >
                            <XCircle className="w-4 h-4" />
                        </button>
                    )}
                </div>

                <Button
                    onClick={() => setView("requests")}
                    variant="outline"
                    className="h-11 min-h-[44px] rounded-full px-6 border-[var(--border-color)] bg-[var(--bg-darker)] hover:bg-[var(--bg-card)] relative flex-shrink-0"
                >
                    <Inbox className="w-4 h-4 mr-2 text-[var(--text-secondary)]" />
                    <span>Demandes</span>
                    {totalRequests > 0 && (
                        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-[var(--bg-card)]">
                            {totalRequests > 99 ? "99+" : totalRequests}
                        </span>
                    )}
                </Button>
            </div>

            {/* Content Switch: Global Search vs Friends List */}
            {isSearching ? (
                // ── SEARCH RESULTS ──
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
                        Résultats de recherche
                    </h3>
                    {searchLoading ? (
                        <div className="flex justify-center p-8">
                            <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" />
                        </div>
                    ) : results.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2">
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
                                        badge={
                                            isAlreadyFriend ? <div className="w-2 h-2 bg-green-500 rounded-full" />
                                                : requestSent ? <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                                                    : undefined
                                        }
                                        actions={
                                            isCurrentUser ? (
                                                <span className="text-[var(--accent-blue)] font-semibold text-sm">C'est vous</span>
                                            ) : isAlreadyFriend ? (
                                                <span className="text-green-500 font-semibold flex items-center gap-1.5 text-sm">
                                                    <Check className="w-4 h-4" /> Ami
                                                </span>
                                            ) : requestSent ? (
                                                <span className="text-[var(--text-secondary)] font-medium text-sm">En attente</span>
                                            ) : (
                                                <Button size="sm" onClick={() => onSendRequest(result.id, result)} disabled={actionLoading === result.id} className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-white">
                                                    <UserPlus className="mr-2 h-4 w-4" /> Ajouter
                                                </Button>
                                            )
                                        }
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-12 text-[var(--text-secondary)]">
                            <SearchIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                            <p>Aucun utilisateur trouvé pour "{searchQuery}"</p>
                        </div>
                    )}
                </div>
            ) : (
                // ── FRIENDS LIST ──
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Mes Amis ({friends.length})
                    </h3>

                    {friends.length > 0 ? (
                        <div className="grid gap-3 md:grid-cols-2">
                            {friends.map((friend) => (
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
                                            variant="ghost"
                                            onClick={() => {
                                                if (confirm("Êtes-vous sûr de vouloir retirer cet ami ?")) {
                                                    onRemoveFriend(friend.id);
                                                }
                                            }}
                                            disabled={actionLoading === friend.id}
                                            className="text-red-400 hover:text-red-500 hover:bg-red-500/10"
                                        >
                                            <XCircle className="w-4 h-4" />
                                            <span className="sr-only">Retirer</span>
                                        </Button>
                                    }
                                />
                            ))}
                        </div>
                    ) : (
                        <EmptyState
                            icon={Users}
                            title="Aucun ami"
                            description="Utilisez la barre de recherche pour trouver des joueurs et les ajouter."
                        />
                    )}
                </div>
            )}
        </div>
    );
}
