import { useState, useEffect, useCallback } from "react";
import {
    db,
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
} from "@/lib/firebase";

interface FriendData {
    id: string;
    name: string;
    titre: string;
    pp: string;
}

interface UseFriendsReturn {
    friends: FriendData[];
    friendRequests: FriendData[];
    sentRequests: FriendData[];
    loading: boolean;
    sendRequest: (targetUserId: string, targetUserData: FriendData, currentUserData: { name: string; titre: string; pp: string }) => Promise<void>;
    acceptRequest: (requestId: string, friendData: FriendData, currentUserData: { name: string; titre: string; pp: string }) => Promise<void>;
    declineRequest: (requestId: string) => Promise<void>;
    removeFriend: (friendId: string) => Promise<void>;
    cancelRequest: (requestId: string) => Promise<void>;
    refreshData: () => Promise<void>;
}

export function useFriends(uid: string | null): UseFriendsReturn {
    const [friends, setFriends] = useState<FriendData[]>([]);
    const [friendRequests, setFriendRequests] = useState<FriendData[]>([]);
    const [sentRequests, setSentRequests] = useState<FriendData[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchFriends = useCallback(async () => {
        if (!uid) return;
        try {
            const friendsRef = collection(db, "friendships", uid, "friends");
            const querySnapshot = await getDocs(friendsRef);
            setFriends(
                querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendData))
            );
        } catch (error) {
            console.error("Error fetching friends:", error);
        }
    }, [uid]);

    const fetchFriendRequests = useCallback(async () => {
        if (!uid) return;
        try {
            const requestsRef = collection(db, "requests", uid, "received");
            const querySnapshot = await getDocs(requestsRef);
            setFriendRequests(
                querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendData))
            );
        } catch (error) {
            console.error("Error fetching friend requests:", error);
        }
    }, [uid]);

    const fetchSentRequests = useCallback(async () => {
        if (!uid) return;
        try {
            const sentRequestsRef = collection(db, "requests", uid, "sent");
            const querySnapshot = await getDocs(sentRequestsRef);
            setSentRequests(
                querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendData))
            );
        } catch (error) {
            console.error("Error fetching sent requests:", error);
        }
    }, [uid]);

    const refreshData = useCallback(async () => {
        if (!uid) return;
        setLoading(true);
        try {
            await Promise.all([fetchFriends(), fetchFriendRequests(), fetchSentRequests()]);
        } finally {
            setLoading(false);
        }
    }, [uid, fetchFriends, fetchFriendRequests, fetchSentRequests]);

    useEffect(() => {
        refreshData();
    }, [refreshData]);

    const sendRequest = useCallback(
        async (targetUserId: string, targetUserData: FriendData, currentUserData: { name: string; titre: string; pp: string }) => {
            if (!uid) return;

            const requestRef = doc(db, "requests", targetUserId, "received", uid);
            const sentRef = doc(db, "requests", uid, "sent", targetUserId);

            await setDoc(requestRef, {
                name: currentUserData.name,
                titre: currentUserData.titre,
                pp: currentUserData.pp,
            });

            await setDoc(sentRef, {
                name: targetUserData.name,
                titre: targetUserData.titre,
                pp: targetUserData.pp,
            });

            const { id: _, ...friendDataWithoutId } = targetUserData;
            setSentRequests((prev) => [...prev, { id: targetUserId, ...friendDataWithoutId }]);
        },
        [uid]
    );

    const acceptRequest = useCallback(
        async (requestId: string, friendData: FriendData, currentUserData: { name: string; titre: string; pp: string }) => {
            if (!uid) return;

            const requestRef = doc(db, "requests", uid, "received", requestId);
            const sentRequestRef = doc(db, "requests", requestId, "sent", uid);
            const friendRef = doc(db, "friendships", uid, "friends", requestId);
            const reverseFriendRef = doc(db, "friendships", requestId, "friends", uid);

            await setDoc(friendRef, {
                name: friendData.name,
                titre: friendData.titre,
                pp: friendData.pp,
            });

            await setDoc(reverseFriendRef, {
                name: currentUserData.name,
                titre: currentUserData.titre,
                pp: currentUserData.pp,
            });

            await deleteDoc(requestRef);
            await deleteDoc(sentRequestRef);

            setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
            setFriends((prev) => [...prev, friendData]);
        },
        [uid]
    );

    const declineRequest = useCallback(
        async (requestId: string) => {
            if (!uid) return;

            const requestRef = doc(db, "requests", uid, "received", requestId);
            const sentRequestRef = doc(db, "requests", requestId, "sent", uid);

            await deleteDoc(requestRef);
            await deleteDoc(sentRequestRef);

            setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
        },
        [uid]
    );

    const removeFriend = useCallback(
        async (friendId: string) => {
            if (!uid) return;

            const friendRef = doc(db, "friendships", uid, "friends", friendId);
            const reverseFriendRef = doc(db, "friendships", friendId, "friends", uid);

            await deleteDoc(friendRef);
            await deleteDoc(reverseFriendRef);

            setFriends((prev) => prev.filter((friend) => friend.id !== friendId));
        },
        [uid]
    );

    const cancelRequest = useCallback(
        async (requestId: string) => {
            if (!uid) return;

            const sentRef = doc(db, "requests", uid, "sent", requestId);
            const receivedRef = doc(db, "requests", requestId, "received", uid);

            await deleteDoc(sentRef);
            await deleteDoc(receivedRef);

            setSentRequests((prev) => prev.filter((req) => req.id !== requestId));
        },
        [uid]
    );

    return {
        friends,
        friendRequests,
        sentRequests,
        loading,
        sendRequest,
        acceptRequest,
        declineRequest,
        removeFriend,
        cancelRequest,
        refreshData,
    };
}
