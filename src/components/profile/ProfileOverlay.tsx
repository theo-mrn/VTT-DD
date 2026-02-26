"use client";

import { useEffect, useState } from "react";
import { db, auth, doc, onSnapshot } from "@/lib/firebase";
import { X as XIcon, Edit, Loader2, Users, Search as SearchIcon, Inbox, Crown, Bell, Shield, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFriends } from "@/hooks/useFriends";
import { useUserSearch } from "@/hooks/useUserSearch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

// Import tabs
import CustomTabs from "@/components/profile/CustomTabs";
import MergedFriendsTab from "@/components/profile/tabs/MergedFriendsTab";
import SubscriptionTab from "@/components/profile/tabs/SubscriptionTab";
import NotificationsTab from "@/components/profile/tabs/NotificationsTab";
import SecurityTab from "@/components/profile/tabs/SecurityTab";
import ProfileTab from "@/components/profile/tabs/ProfileTab";

interface UserData {
    name: string;
    titre: string;
    imageURL: string;
    pp: string;
    premium?: boolean;
    premiumSince?: string;
    stripeCustomerId?: string;
    emailNotifications?: boolean;
}

interface ProfileOverlayProps {
    onClose: () => void;
}

export default function ProfileOverlay({ onClose }: ProfileOverlayProps) {
    const [uid, setUid] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [userData, setUserData] = useState<UserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [isGoogleOnly, setIsGoogleOnly] = useState(false);

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

    // Get current user
    useEffect(() => {
        const user = auth.currentUser;
        if (user) {
            setUid(user.uid);
            setUserEmail(user.email);
            // Vérifier si l'utilisateur est uniquement Google
            const isGoogle = user.providerData.some(p => p.providerId === 'google.com') &&
                !user.providerData.some(p => p.providerId === 'password');
            setIsGoogleOnly(isGoogle);
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

    // Handlers mapped to tabs
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

    const handleRemoveFriend = async (friendId: string) => {
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

    return (
        <>
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-[200]"
                onClick={onClose}
            />

            <div className="fixed inset-0 z-[201] flex items-center justify-center p-4 py-8 md:py-12 pointer-events-none">
                <div
                    className="w-full max-w-3xl h-[85vh] md:h-full bg-[var(--bg-card)] rounded-xl shadow-2xl overflow-hidden pointer-events-auto flex flex-col border border-[var(--border-color)] animate-in fade-in zoom-in-95 duration-200"
                    onClick={(e) => e.stopPropagation()}
                >
                    {loading ? (
                        <div className="flex items-center justify-center h-full flex-1">
                            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-brown)]" />
                        </div>
                    ) : !userData ? (
                        <div className="flex items-center justify-center h-full flex-1">
                            <p className="text-[var(--text-secondary)]">Profil introuvable</p>
                        </div>
                    ) : (
                        <>
                            {/* Header / Banner */}
                            <div className="relative h-48 sm:h-56 w-full flex-shrink-0">
                                <div
                                    className={`absolute inset-0 bg-cover bg-center ${!userData.imageURL ? "bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-blue)] opacity-50" : ""}`}
                                    style={userData.imageURL ? { backgroundImage: `url(${userData.imageURL})` } : {}}
                                >
                                    <div className="absolute inset-0 bg-black/40" />
                                </div>

                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors z-10"
                                >
                                    <XIcon className="w-5 h-5" />
                                </button>

                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[var(--bg-card)] via-[var(--bg-card)]/80 to-transparent flex items-end gap-5 translate-y-px z-0">
                                    <Avatar className="h-24 w-24 sm:h-28 sm:w-28 border-4 border-[var(--bg-card)] shadow-lg bg-[var(--bg-card)] translate-y-4">
                                        <AvatarImage src={userData.pp} alt={userData.name} className="object-cover" />
                                        <AvatarFallback className="bg-[var(--accent-brown)] text-white text-3xl font-bold">
                                            {userData.name.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="pb-1 min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] leading-tight truncate drop-shadow-md">
                                                {userData.name}
                                            </h1>
                                            {userData.premium && (
                                                <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0"
                                                    style={{ background: "rgba(180,130,70,0.15)", border: "1px solid rgba(180,130,70,0.3)", color: "var(--accent-brown)" }}>
                                                    <Crown className="w-3 h-3" />
                                                    Premium
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[var(--text-secondary)] truncate font-medium text-sm sm:text-base">
                                            {userData.titre}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Tabs Area */}
                            <div className="flex-1 overflow-y-auto px-4 md:px-6 pt-10 pb-6 scrollbar-thin bg-[var(--bg-card)] shadow-inner">
                                <CustomTabs
                                    defaultTab="profile_edit"
                                    tabs={[
                                        { id: "profile_edit", label: "Profil", icon: <User className="w-4 h-4" /> },
                                        { id: "friends", label: "Amis & Demandes", icon: <Users className="w-4 h-4" />, badge: friendRequests.length },
                                        { id: "subscription", label: "Abonnement", icon: <Crown className="w-4 h-4" /> },
                                        { id: "notifications", label: "Préférences", icon: <Bell className="w-4 h-4" /> },
                                        ...(!isGoogleOnly ? [{ id: "security", label: "Sécurité", icon: <Shield className="w-4 h-4" /> }] : [])
                                    ]}
                                >
                                    {(activeTab) => (
                                        <div className="pt-2">
                                            {activeTab === "profile_edit" && uid && (
                                                <ProfileTab uid={uid} userData={userData} />
                                            )}
                                            {activeTab === "friends" && (
                                                <MergedFriendsTab
                                                    currentUserId={uid}
                                                    friends={friends}
                                                    friendRequests={friendRequests}
                                                    sentRequests={sentRequests}
                                                    onSendRequest={handleSendRequest}
                                                    onAcceptRequest={handleAcceptRequest}
                                                    onDeclineRequest={handleDeclineRequest}
                                                    onCancelRequest={handleCancelRequest}
                                                    onRemoveFriend={handleRemoveFriend}
                                                    loading={friendsLoading}
                                                    actionLoading={actionLoading}
                                                />
                                            )}
                                            {activeTab === "subscription" && (
                                                <SubscriptionTab
                                                    uid={uid}
                                                    userEmail={userEmail}
                                                    userData={userData}
                                                />
                                            )}
                                            {activeTab === "notifications" && (
                                                <NotificationsTab
                                                    uid={uid}
                                                    userEmail={userEmail}
                                                    userData={userData}
                                                />
                                            )}
                                            {activeTab === "security" && (
                                                <SecurityTab />
                                            )}
                                        </div>
                                    )}
                                </CustomTabs>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Modal removed as it's now a tab */}
        </>
    );
}
