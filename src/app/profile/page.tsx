"use client";

import { useEffect, useState } from "react";
import {
  db,
  auth,
  doc,
  getDoc,
  collection,
  setDoc,
  getDocs,
  onAuthStateChanged,
  deleteDoc,
} from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Search, UserPlus, XCircle, Edit, Loader2, Check, X } from "lucide-react";
import EditProfileModal from "@/components/profile/EditProfileModal";

interface UserData {
  name: string;
  titre: string;
  imageURL: string;
  pp: string;
}

interface FriendData {
  id: string;
  name: string;
  titre: string;
  pp: string;
}

export default function ProfilePage() {
  const [uid, setUid] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<FriendData[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [friendRequests, setFriendRequests] = useState<FriendData[]>([]);
  const [friends, setFriends] = useState<FriendData[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendData[]>([]);
  const [showEditModal, setShowEditModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
      } else {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // Fetch all user data
  useEffect(() => {
    if (uid) {
      fetchAllData();
    }
  }, [uid]);

  const fetchAllData = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      await Promise.all([
        fetchUserData(),
        fetchFriendRequests(),
        fetchFriends(),
        fetchSentRequests(),
      ]);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserData = async () => {
    if (!uid) return;
    try {
      const userDocRef = doc(db, "users", uid);
      const userDoc = await getDoc(userDocRef);
      if (userDoc.exists()) {
        setUserData(userDoc.data() as UserData);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  const fetchFriendRequests = async () => {
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
  };

  const fetchFriends = async () => {
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
  };

  const fetchSentRequests = async () => {
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
  };

  const handleSearch = async () => {
    if (searchQuery.trim() === "") return;
    setSearchLoading(true);
    try {
      const usersRef = collection(db, "users");
      const querySnapshot = await getDocs(usersRef);
      const results = querySnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<FriendData, "id">),
        }))
        .filter((user) => user.name.toLowerCase() === searchQuery.toLowerCase());

      setSearchResults(results);
    } catch (error) {
      console.error("Error searching users:", error);
    } finally {
      setSearchLoading(false);
    }
  };

  const sendFriendRequest = async (targetUserId: string, targetUserData: FriendData) => {
    if (
      !uid ||
      !userData ||
      friends.some((friend) => friend.id === targetUserId) ||
      sentRequests.some((req) => req.id === targetUserId)
    ) {
      return;
    }

    setActionLoading(targetUserId);
    try {
      const requestRef = doc(db, "requests", targetUserId, "received", uid);
      const sentRef = doc(db, "requests", uid, "sent", targetUserId);

      // FIXED: Use pp instead of imageURL
      await setDoc(requestRef, {
        name: userData.name,
        titre: userData.titre,
        pp: userData.pp,
      });

      await setDoc(sentRef, {
        name: targetUserData.name,
        titre: targetUserData.titre,
        pp: targetUserData.pp,
      });

      // Update local state
      setSentRequests((prev) => [...prev, { id: targetUserId, ...targetUserData }]);
    } catch (error) {
      console.error("Error sending friend request:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleAcceptRequest = async (requestId: string, friendData: FriendData) => {
    if (!uid || !userData) return;

    setActionLoading(requestId);
    try {
      const requestRef = doc(db, "requests", uid, "received", requestId);
      const sentRequestRef = doc(db, "requests", requestId, "sent", uid);
      const friendRef = doc(db, "friendships", uid, "friends", requestId);
      const reverseFriendRef = doc(db, "friendships", requestId, "friends", uid);

      // Add to friendships
      await setDoc(friendRef, {
        name: friendData.name,
        titre: friendData.titre,
        pp: friendData.pp,
      });

      await setDoc(reverseFriendRef, {
        name: userData.name,
        titre: userData.titre,
        pp: userData.pp,
      });

      // Delete requests
      await deleteDoc(requestRef);
      await deleteDoc(sentRequestRef);

      // Update local state
      setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
      setFriends((prev) => [...prev, friendData]);
    } catch (error) {
      console.error("Error accepting friend request:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!uid) return;

    setActionLoading(requestId);
    try {
      const requestRef = doc(db, "requests", uid, "received", requestId);
      const sentRequestRef = doc(db, "requests", requestId, "sent", uid);

      await deleteDoc(requestRef);
      await deleteDoc(sentRequestRef);

      setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
    } catch (error) {
      console.error("Error declining friend request:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!uid) return;
    if (!confirm("Êtes-vous sûr de vouloir retirer cet ami ?")) return;

    setActionLoading(friendId);
    try {
      const friendRef = doc(db, "friendships", uid, "friends", friendId);
      const reverseFriendRef = doc(db, "friendships", friendId, "friends", uid);

      await deleteDoc(friendRef);
      await deleteDoc(reverseFriendRef);

      setFriends((prev) => prev.filter((friend) => friend.id !== friendId));
    } catch (error) {
      console.error("Error removing friend:", error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelSentRequest = async (requestId: string) => {
    if (!uid) return;

    setActionLoading(requestId);
    try {
      const sentRef = doc(db, "requests", uid, "sent", requestId);
      const receivedRef = doc(db, "requests", requestId, "received", uid);

      await deleteDoc(sentRef);
      await deleteDoc(receivedRef);

      setSentRequests((prev) => prev.filter((req) => req.id !== requestId));
    } catch (error) {
      console.error("Error canceling friend request:", error);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-4 flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-brown)]" />
      </div>
    );
  }

  if (!userData) {
    return (
      <div className="container mx-auto p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-[var(--text-secondary)]">Aucun profil trouvé</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      {/* Profile Header */}
      <div className="relative w-full h-[280px] rounded-xl overflow-hidden shadow-lg">
        {/* Banner Image */}
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${userData.imageURL})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-black/70" />
        </div>

        {/* Edit Button */}
        <Button
          onClick={() => setShowEditModal(true)}
          className="absolute top-4 right-4 z-10 bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-white shadow-lg"
        >
          <Edit className="w-4 h-4 mr-2" />
          Modifier le profil
        </Button>

        {/* Profile Info */}
        <div className="absolute bottom-0 left-0 right-0 p-6 z-10">
          <div className="flex items-end gap-6">
            {/* Avatar */}
            <div className="relative group">
              <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[var(--accent-brown)] to-[var(--accent-blue)] blur-md opacity-75 group-hover:opacity-100 transition-opacity" />
              <div className="relative h-32 w-32 rounded-full border-4 border-white overflow-hidden bg-[var(--bg-card)]">
                <img
                  src={userData.pp}
                  alt={userData.name}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>

            {/* Name and Title */}
            <div className="flex-1 pb-2">
              <h1 className="text-4xl font-bold text-white drop-shadow-lg">
                {userData.name}
              </h1>
              <p className="text-xl text-gray-200 mt-1 drop-shadow-md">
                {userData.titre}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="friends" className="w-full">
        <TabsList className="grid w-full grid-cols-3 bg-[var(--bg-card)] border border-[var(--border-color)]">
          <TabsTrigger
            value="friends"
            className="data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-white"
          >
            Mes amis ({friends.length})
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-white"
          >
            Demandes ({friendRequests.length})
          </TabsTrigger>
          <TabsTrigger
            value="search"
            className="data-[state=active]:bg-[var(--accent-brown)] data-[state=active]:text-white"
          >
            Rechercher
          </TabsTrigger>
        </TabsList>

        {/* Friends Tab */}
        <TabsContent value="friends">
          <Card className="border-[var(--border-color)]">
            <CardContent className="pt-6">
              {friends.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-4 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-brown)] transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border-2 border-[var(--accent-brown)]">
                          <AvatarImage src={friend.pp} alt={friend.name} />
                          <AvatarFallback className="bg-[var(--accent-brown)] text-white">
                            {friend.name[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {friend.name}
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {friend.titre}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleRemoveFriend(friend.id)}
                        disabled={actionLoading === friend.id}
                        className="bg-red-500 hover:bg-red-600"
                      >
                        {actionLoading === friend.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <XCircle className="w-4 h-4 mr-2" />
                            Retirer
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-[var(--text-secondary)] text-lg">
                    Vous n'avez pas encore d'amis
                  </p>
                  <p className="text-[var(--text-secondary)] text-sm mt-2">
                    Utilisez la recherche pour trouver des utilisateurs
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests">
          <div className="space-y-4">
            {/* Received Requests */}
            <Card className="border-[var(--border-color)]">
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold text-[var(--accent-brown)] mb-4">
                  Demandes reçues ({friendRequests.length})
                </h3>
                {friendRequests.length > 0 ? (
                  <div className="space-y-3">
                    {friendRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)]"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12 border-2 border-[var(--accent-blue)]">
                            <AvatarImage src={request.pp} alt={request.name} />
                            <AvatarFallback className="bg-[var(--accent-blue)] text-white">
                              {request.name[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">
                              {request.name}
                            </p>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {request.titre}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleAcceptRequest(request.id, request)}
                            disabled={actionLoading === request.id}
                            className="bg-green-500 hover:bg-green-600 text-white"
                          >
                            {actionLoading === request.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="w-4 h-4 mr-2" />
                                Accepter
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeclineRequest(request.id)}
                            disabled={actionLoading === request.id}
                            className="border-[var(--border-color)]"
                          >
                            <X className="w-4 h-4 mr-2" />
                            Refuser
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-secondary)] text-center py-8">
                    Aucune demande reçue
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Sent Requests */}
            <Card className="border-[var(--border-color)]">
              <CardContent className="pt-6">
                <h3 className="text-lg font-bold text-[var(--accent-brown)] mb-4">
                  Demandes envoyées ({sentRequests.length})
                </h3>
                {sentRequests.length > 0 ? (
                  <div className="space-y-3">
                    {sentRequests.map((request) => (
                      <div
                        key={request.id}
                        className="flex items-center justify-between p-4 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)]"
                      >
                        <div className="flex items-center gap-4">
                          <Avatar className="h-12 w-12">
                            <AvatarImage src={request.pp} alt={request.name} />
                            <AvatarFallback>{request.name[0]}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-semibold text-[var(--text-primary)]">
                              {request.name}
                            </p>
                            <p className="text-sm text-[var(--text-secondary)]">
                              {request.titre}
                            </p>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancelSentRequest(request.id)}
                          disabled={actionLoading === request.id}
                          className="border-[var(--border-color)]"
                        >
                          {actionLoading === request.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            "Annuler"
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[var(--text-secondary)] text-center py-8">
                    Aucune demande envoyée
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search">
          <Card className="border-[var(--border-color)]">
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-6">
                <Input
                  type="text"
                  placeholder="Rechercher un utilisateur par nom exact..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="bg-[var(--bg-dark)] border-[var(--border-color)] text-[var(--text-primary)]"
                />
                <Button
                  onClick={handleSearch}
                  disabled={searchLoading}
                  className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] text-white"
                >
                  {searchLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-3">
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="flex items-center justify-between p-4 bg-[var(--bg-darker)] rounded-lg border border-[var(--border-color)]"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={result.pp} alt={result.name} />
                          <AvatarFallback>{result.name[0]}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-semibold text-[var(--text-primary)]">
                            {result.name}
                          </p>
                          <p className="text-sm text-[var(--text-secondary)]">
                            {result.titre}
                          </p>
                        </div>
                      </div>
                      {result.id !== uid ? (
                        friends.some((friend) => friend.id === result.id) ? (
                          <span className="text-green-500 font-semibold flex items-center gap-2">
                            <Check className="w-4 h-4" />
                            Ami
                          </span>
                        ) : sentRequests.some((req) => req.id === result.id) ? (
                          <span className="text-[var(--text-secondary)] font-medium">
                            Demande envoyée
                          </span>
                        ) : (
                          <Button
                            onClick={() => sendFriendRequest(result.id, result)}
                            disabled={actionLoading === result.id}
                            className="bg-[var(--accent-brown)] hover:bg-[var(--accent-brown-hover)] text-white"
                          >
                            {actionLoading === result.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <>
                                <UserPlus className="mr-2 h-4 w-4" />
                                Ajouter
                              </>
                            )}
                          </Button>
                        )
                      ) : (
                        <span className="text-[var(--accent-blue)] font-semibold">
                          C'est vous
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : searchQuery && !searchLoading ? (
                <p className="text-[var(--text-secondary)] text-center py-8">
                  Aucun utilisateur trouvé
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Profile Modal */}
      {showEditModal && uid && (
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
    </div>
  );
}
