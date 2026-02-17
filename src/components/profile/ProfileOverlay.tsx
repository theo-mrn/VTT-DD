"use client";

import { useEffect, useState } from "react";
import { db, auth, doc, getDoc, onSnapshot } from "@/lib/firebase";
import { X as XIcon, Edit, Loader2, Users, Inbox, Search as SearchIcon, UserPlus, Check, XCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import EditProfileModal from "@/components/profile/EditProfileModal";
import FriendCard from "@/components/profile/FriendCard";
import EmptyState from "@/components/profile/EmptyState";
import { useFriends } from "@/hooks/useFriends";
import { useUserSearch } from "@/hooks/useUserSearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

interface UserData {
    name: string;
    titre: string;
    imageURL: string;
    pp: string;
}

interface ProfileOverlayProps {
    onClose: () => void;
}

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
    const [uid, setUid] = useState<string | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [showEditModal, setShowEditModal] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");

    // Use custom hooks
    const {
        friends,
        friendRequests,
        sentRequests,
        loading: friendsLoading,
        sendRequest,
        acceptRequest,
        declineRequest,
        removeFriend,
        cancelRequest,
    } = useFriends(uid);

    const { results, loading: searchLoading, search } = useUserSearch();

    // Get current user
    useEffect(() => {
        const user = auth.currentUser;
        if (user) {
            setUid(user.uid);
        } else {
            setLoading(false);
        }
    }, []);

    // Fetch user data real-time
    useEffect(() => {
        if (!uid) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const userDocRef = doc(db, "users", uid);

        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setUserData(docSnap.data() as UserData);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching user data:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [uid]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.trim()) {
                search(searchQuery);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery, search]);

    // Wrapper functions
    const handleSendRequest = async (targetUserId: string, targetUserData: any) => {
        if (!userData) return;
        setActionLoading(targetUserId);
        try {
            await sendRequest(targetUserId, targetUserData, {
                name: userData.name,
                titre: userData.titre,
                pp: userData.pp,
            });
        } finally {
            setActionLoading(null);
        }
    };

    const handleAcceptRequest = async (requestId: string, friendData: any) => {
        if (!userData) return;
        setActionLoading(requestId);
        try {
            await acceptRequest(requestId, friendData, {
                name: userData.name,
                titre: userData.titre,
                pp: userData.pp,
            });
        } finally {
            setActionLoading(null);
        }
    };

    const handleDeclineRequest = async (requestId: string) => {
        setActionLoading(requestId);
        try {
            await declineRequest(requestId);
        } finally {
            setActionLoading(null);
        }
    };

    // Simplified remove without native confirm for smoother UI, or use a custom small dialog if needed.
    // For now, keeping native confirm but making the button smaller.
    const handleRemoveFriend = async (friendId: string) => {
        if (!confirm("Retirer cet ami ?")) return;
        setActionLoading(friendId);
        try {
            await removeFriend(friendId);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelRequest = async (requestId: string) => {
        setActionLoading(requestId);
        try {
            await cancelRequest(requestId);
        } finally {
            setActionLoading(null);
        }
    };

    const isFriend = (userId: string) => friends.some((f) => f.id === userId);
    const hasSentRequest = (userId: string) => sentRequests.some((r) => r.id === userId);

    return (
        <>
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[200]"
                onClick={onClose}
            />

            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 pointer-events-none">
                {/* Changed to max-w-2xl for a balanced size */}
                <div
                    className="w-full max-w-2xl bg-[var(--bg-card)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col max-h-[85vh] border border-[var(--border-color)] animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {loading ? (
                        <div className="flex items-center justify-center h-80">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-brown)]" />
                        </div>
                    ) : !userData ? (
                        <div className="flex items-center justify-center h-80">
                            <p className="text-[var(--text-secondary)]">Profil introuvable</p>
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="relative h-48 w-full flex-shrink-0">
                                {/* Banner */}
                                <div
                                    className={`absolute inset-0 bg-cover bg-center ${!userData.imageURL ? "bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-blue)] opacity-50" : ""}`}
                                    style={userData.imageURL ? { backgroundImage: `url(${userData.imageURL})` } : {}}
                                >
                                    <div className="absolute inset-0 bg-black/30" />
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors"
                                >
                                    <XIcon className="w-5 h-5" />
                                </button>

                                {/* Edit Button */}
                                <Button
                                    onClick={() => setShowEditModal(true)}
                                    size="sm"
                                    className="absolute top-4 left-4 bg-black/40 hover:bg-black/60 text-white border-none backdrop-blur-sm"
                                >
                                    <Edit className="w-4 h-4 mr-2" />
                                    Modifier
                                </Button>

                                {/* Profile Info overlaid on banner bottom */}
                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent flex items-end gap-5">
                                    <Avatar className="h-24 w-24 border-4 border-[var(--bg-card)] shadow-lg">
                                        <AvatarImage src={userData.pp} alt={userData.name} className="object-cover" />
                                        <AvatarFallback className="bg-[var(--accent-brown)] text-white text-3xl font-bold">
                                            {userData.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="pb-2 min-w-0 flex-1">
                                        <h1 className="text-2xl font-bold text-white leading-tight truncate drop-shadow-md">
                                            {userData.name}
                                        </h1>
                                        <p className="text-gray-200 truncate drop-shadow-sm font-medium">
                                            {userData.titre}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto p-0 scrollbar-thin">

                                {/* Search Bar */}
                                <div className="p-4 bg-[var(--bg-dark)] border-b border-[var(--border-color)] sticky top-0 z-10">
                                    <div className="relative">
                                        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
                                        <Input
                                            type="text"
                                            placeholder="Rechercher des utilisateurs..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="pl-10 h-10 bg-[var(--bg-card)] border-[var(--border-color)]"
                                        />
                                    </div>
                                </div>

                                <div className="p-6 space-y-8">
                                    {/* Search Results */}
                                    {searchQuery && (
                                        <section className="space-y-3">
                                            <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">Résultats de recherche</h3>
                                            {searchLoading ? (
                                                <div className="flex justify-center p-6"><Loader2 className="w-6 h-6 animate-spin text-[var(--accent-brown)]" /></div>
                                            ) : results.length > 0 ? (
                                                <div className="grid gap-2 sm:grid-cols-2">
                                                    {results.map(user => {
                                                        const isCurrentUser = user.id === uid;
                                                        const isAlreadyFriend = isFriend(user.id);
                                                        const requestSent = hasSentRequest(user.id);

                                                        return (
                                                            <div key={user.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[var(--bg-darker)] transition-colors border border-transparent hover:border-[var(--border-color)]">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <Avatar className="h-10 w-10">
                                                                        <AvatarImage src={user.pp} alt={user.name} className="object-cover" />
                                                                        <AvatarFallback className="bg-[var(--accent-brown)] text-white">
                                                                            {user.name.charAt(0).toUpperCase()}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium text-[var(--text-primary)] truncate">{user.name}</p>
                                                                        <p className="text-xs text-[var(--text-secondary)] truncate">{user.titre}</p>
                                                                    </div>
                                                                </div>

                                                                {isCurrentUser ? null : isAlreadyFriend ? (
                                                                    <Check className="w-4 h-4 text-green-500" />
                                                                ) : requestSent ? (
                                                                    <span className="text-xs text-[var(--text-secondary)]">Envoyé</span>
                                                                ) : (
                                                                    <Button size="icon" className="h-7 w-7 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-[var(--bg-dark)]" onClick={() => handleSendRequest(user.id, user)} disabled={actionLoading === user.id}>
                                                                        {actionLoading === user.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <p className="text-xs text-center text-[var(--text-secondary)] py-2">Aucun résultat</p>
                                            )}
                                            <Separator className="my-2" />
                                        </section>
                                    )}

                                    {/* Friend Requests */}
                                    {(friendRequests.length > 0 || sentRequests.length > 0) && (
                                        <section className="space-y-4">
                                            {friendRequests.length > 0 && (
                                                <div className="space-y-2">
                                                    <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1 flex justify-between items-center">
                                                        Demandes reçues <span className="bg-[var(--accent-brown)] text-white text-xs px-2 py-0.5 rounded-full">{friendRequests.length}</span>
                                                    </h3>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {friendRequests.map(req => (
                                                            <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-[var(--bg-darker)] border border-[var(--border-color)]">
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <Avatar className="h-10 w-10">
                                                                        <AvatarImage src={req.pp} alt={req.name} className="object-cover" />
                                                                        <AvatarFallback className="bg-[var(--accent-brown)] text-white">
                                                                            {req.name.charAt(0).toUpperCase()}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <div className="min-w-0">
                                                                        <p className="font-medium truncate">{req.name}</p>
                                                                    </div>
                                                                </div>
                                                                <div className="flex gap-1">
                                                                    <Button size="icon" className="h-8 w-8 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-[var(--bg-dark)]" onClick={() => handleAcceptRequest(req.id, req)} disabled={actionLoading === req.id}>
                                                                        <Check className="w-4 h-4" />
                                                                    </Button>
                                                                    <Button size="icon" variant="outline" className="h-8 w-8 border-[var(--border-color)]" onClick={() => handleDeclineRequest(req.id)} disabled={actionLoading === req.id}>
                                                                        <XIcon className="w-4 h-4" />
                                                                    </Button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {sentRequests.length > 0 && (
                                                <div className="space-y-2 mt-4">
                                                    <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">En attente ({sentRequests.length})</h3>
                                                    <div className="grid gap-2 sm:grid-cols-2">
                                                        {sentRequests.map(req => (
                                                            <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)]">
                                                                <div className="flex items-center gap-3 min-w-0 opacity-70">
                                                                    <Avatar className="h-8 w-8 opacity-70">
                                                                        <AvatarImage src={req.pp} alt={req.name} className="object-cover" />
                                                                        <AvatarFallback className="bg-[var(--accent-brown)] text-white text-xs">
                                                                            {req.name.charAt(0).toUpperCase()}
                                                                        </AvatarFallback>
                                                                    </Avatar>
                                                                    <p className="text-sm font-medium truncate">{req.name}</p>
                                                                </div>
                                                                <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-red-400 hover:text-red-500 hover:bg-transparent" onClick={() => handleCancelRequest(req.id)} disabled={actionLoading === req.id}>
                                                                    Annuler
                                                                </Button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                            <Separator className="my-4" />
                                        </section>)}

                                    {/* Friends List */}
                                    <section className="space-y-3">
                                        <h3 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider px-1">Mes Amis ({friends.length})</h3>
                                        {friends.length > 0 ? (
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {friends.map(friend => (
                                                    <div key={friend.id} className="group flex items-center justify-between p-3 rounded-lg hover:bg-[var(--bg-darker)] transition-colors border border-transparent hover:border-[var(--border-color)]">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <Avatar className="h-10 w-10 border border-[var(--border-color)]">
                                                                <AvatarImage src={friend.pp} alt={friend.name} className="object-cover" />
                                                                <AvatarFallback className="bg-[var(--accent-brown)] text-white">
                                                                    {friend.name.charAt(0).toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="min-w-0">
                                                                <p className="font-medium text-[var(--text-primary)] truncate">{friend.name}</p>
                                                                <p className="text-xs text-[var(--text-secondary)] truncate">{friend.titre}</p>
                                                            </div>
                                                        </div>
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600 hover:bg-red-50"
                                                            onClick={() => handleRemoveFriend(friend.id)}
                                                            disabled={actionLoading === friend.id}
                                                        >
                                                            <XCircle className="w-4 h-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-center py-12">
                                                <Users className="w-10 h-10 text-[var(--text-secondary)] mx-auto mb-3 opacity-50" />
                                                <p className="text-sm text-[var(--text-secondary)]">Ajoutez des amis pour les voir ici</p>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {showEditModal && uid && userData && (
                <EditProfileModal
                    uid={uid}
                    currentName={userData.name}
                    currentTitre={userData.titre}
                    currentPp={userData.pp}
                    currentImageURL={userData.imageURL}
                    onClose={() => setShowEditModal(false)}
                    onSave={(newData) => {
                        setUserData(newData);
                        setShowEditModal(false);
                    }}
                />
            )}
        </>
    );
}
