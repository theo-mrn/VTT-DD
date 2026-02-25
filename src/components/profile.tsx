"use client";

import { useEffect, useState, ChangeEvent } from "react";
import {
  db,
  auth,
  storage,
  doc,
  getDoc,
  collection,
  setDoc,
  getDocs,
  onAuthStateChanged,
  deleteDoc,
} from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Search,
  UserPlus,
  XCircle,
  Camera,
  Crown,
  Sparkles,
  Dices,
  ShieldCheck,
  Heart,
  Settings,
  ExternalLink,
  Loader2,
  Check,
  CalendarDays,
} from "lucide-react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";

interface UserData {
  name: string;
  titre: string;
  imageURL: string;
  pp?: string;
  premium?: boolean;
  premiumSince?: string;
  stripeCustomerId?: string;
}

interface FriendRequestData {
  id: string;
  name: string;
  titre: string;
  imageURL: string;
  pp?: string;
}

export default function ProfilePage() {
  const pathname = usePathname();
  const [uid, setUid] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchResults, setSearchResults] = useState<FriendRequestData[]>([]);
  const [friendRequests, setFriendRequests] = useState<FriendRequestData[]>([]);
  const [friends, setFriends] = useState<FriendRequestData[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequestData[]>([]);

  // Subscription state
  const [subscribing, setSubscribing] = useState(false);
  const [managingPortal, setManagingPortal] = useState(false);
  const [subError, setSubError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);
        setUserEmail(user.email);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (uid) {
      const fetchUserData = async () => {
        try {
          const userDocRef = doc(db, "users", uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            setUserData(userDoc.data() as UserData);
          } else {
            setUserData(null);
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
        }
      };

      const fetchFriendRequests = async () => {
        try {
          const requestsRef = collection(db, "requests", uid, "received");
          const querySnapshot = await getDocs(requestsRef);
          setFriendRequests(
            querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendRequestData))
          );
        } catch (error) {
          console.error("Error fetching friend requests:", error);
        }
      };

      const fetchFriends = async () => {
        try {
          const friendsRef = collection(db, "friendships", uid, "friends");
          const querySnapshot = await getDocs(friendsRef);
          setFriends(
            querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendRequestData))
          );
        } catch (error) {
          console.error("Error fetching friends:", error);
        }
      };

      const fetchSentRequests = async () => {
        try {
          const sentRequestsRef = collection(db, "requests", uid, "sent");
          const querySnapshot = await getDocs(sentRequestsRef);
          setSentRequests(
            querySnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FriendRequestData))
          );
        } catch (error) {
          console.error("Error fetching sent friend requests:", error);
        }
      };

      fetchUserData();
      fetchFriendRequests();
      fetchFriends();
      fetchSentRequests();
    }
  }, [uid]);

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>, field: string) => {
    const file = event.target.files?.[0];
    if (!file || !uid) return;

    try {
      const storageRef = ref(storage, `users/${uid}/${field}`);
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);

      const userRef = doc(db, "users", uid);
      await setDoc(userRef, { [field]: downloadURL }, { merge: true });

      setUserData((prevData) => prevData ? { ...prevData, [field]: downloadURL } : null);
    } catch (error) {
      console.error("Error updating image:", error);
    }
  };

  const handleSearch = async () => {
    if (searchQuery.trim() === "") return;
    try {
      const usersRef = collection(db, "users");
      const querySnapshot = await getDocs(usersRef);
      const results = querySnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<FriendRequestData, "id">),
        }))
        .filter((user) => user.name.toLowerCase() === searchQuery.toLowerCase());

      setSearchResults(results);
    } catch (error) {
      console.error("Error searching users:", error);
    }
  };

  const sendFriendRequest = async (targetUserId: string, targetUserData: FriendRequestData) => {
    if (
      !uid ||
      !userData ||
      friends.some((friend) => friend.id === targetUserId) ||
      sentRequests.some((req) => req.id === targetUserId)
    ) {
      return;
    }

    try {
      const requestRef = doc(db, "requests", targetUserId, "received", uid);
      const sentRef = doc(db, "requests", uid, "sent", targetUserId);

      await setDoc(requestRef, {
        name: userData.name,
        titre: userData.titre,
        imageURL: userData.pp,
      });

      await setDoc(sentRef, {
        targetUserId,
        name: targetUserData.name,
        titre: targetUserData.titre,
        imageURL: targetUserData.imageURL,
      });

      alert("Friend request sent!");
    } catch (error) {
      console.error("Error sending friend request:", error);
    }
  };

  const handleAcceptRequest = async (requestId: string, friendData: FriendRequestData) => {
    if (!uid || !userData) return;

    try {
      const requestRef = doc(db, "requests", uid, "received", requestId);
      const friendRef = doc(db, "friendships", uid, "friends", requestId);
      const reverseFriendRef = doc(db, "friendships", requestId, "friends", uid);

      await setDoc(friendRef, friendData);
      await setDoc(reverseFriendRef, {
        name: userData.name,
        titre: userData.titre,
        imageURL: userData.pp,
      });

      await deleteDoc(requestRef);
      setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
      setFriends((prev) => [...prev, friendData]);
    } catch (error) {
      console.error("Error accepting friend request:", error);
    }
  };

  const handleDeclineRequest = async (requestId: string) => {
    if (!uid) return;

    try {
      const requestRef = doc(db, "requests", uid, "received", requestId);
      await deleteDoc(requestRef);
      setFriendRequests((prev) => prev.filter((request) => request.id !== requestId));
    } catch (error) {
      console.error("Error declining friend request:", error);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!uid) return;

    try {
      const friendRef = doc(db, "friendships", uid, "friends", friendId);
      const reverseFriendRef = doc(db, "friendships", friendId, "friends", uid);

      await deleteDoc(friendRef);
      await deleteDoc(reverseFriendRef);

      setFriends((prev) => prev.filter((friend) => friend.id !== friendId));
    } catch (error) {
      console.error("Error removing friend:", error);
    }
  };

  // ── Stripe ──────────────────────────────────────────────────────────────────

  const handleSubscribe = async () => {
    setSubscribing(true);
    setSubError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, userEmail, returnUrl: pathname }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur Stripe");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setSubError(err.message);
      setSubscribing(false);
    }
  };

  const handleManagePortal = async () => {
    if (!userData?.stripeCustomerId) return;
    setManagingPortal(true);
    try {
      const res = await fetch("/api/stripe-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeCustomerId: userData.stripeCustomerId, returnUrl: pathname }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch (err) {
      console.error(err);
    } finally {
      setManagingPortal(false);
    }
  };

  const premiumSinceFormatted = userData?.premiumSince
    ? new Date(userData.premiumSince).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="container mx-auto p-4 space-y-8">
      {/* Banner + Avatar */}
      {userData ? (
        <div className="w-full h-[300px] relative overflow-hidden rounded-lg">
          <div
            className="absolute inset-0 bg-cover bg-center z-0"
            style={{ backgroundImage: `url(${userData.imageURL})` }}
          >
            <div className="absolute inset-0 bg-black/50 z-10" />
            <Button
              onClick={() => document.getElementById("backgroundImageInput")?.click()}
              className="absolute top-4 right-4 z-20"
            >
              <Camera className="w-4 h-4 mr-2" /> Modifier
            </Button>
            <input
              id="backgroundImageInput"
              type="file"
              accept="image/*"
              onChange={(e) => handleImageChange(e, "imageURL")}
              className="hidden"
            />
          </div>

          <div className="relative z-20 w-full h-full p-8 flex items-center">
            <div className="flex items-center gap-6">
              <div className="relative group">
                <div className="absolute -inset-1 rounded-full bg-purple-600/75 blur-md animate-pulse" />
                <div className="relative h-32 w-32 rounded-full border-2 border-yellow-400 overflow-hidden">
                  <img
                    src={userData.pp}
                    alt={userData.name}
                    className="h-full w-full object-cover"
                  />
                  <label className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 cursor-pointer">
                    <Camera className="text-white w-6 h-6" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange(e, "pp")}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-4xl font-bold text-white">{userData.name}</h2>
                  {userData.premium && (
                    <span
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-full font-semibold"
                      style={{
                        background: "var(--accent-brown)/20",
                        border: "1px solid var(--accent-brown)/50",
                        color: "var(--accent-brown)",
                      }}
                    >
                      <Crown className="w-3 h-3" />
                      Premium
                    </span>
                  )}
                </div>
                <p className="text-gray-300 text-lg">{userData.titre}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p>No profile found for the specified UID.</p>
      )}

      {/* Tabs */}
      <Tabs defaultValue="search" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="search">Rechercher</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="friends">Mes amis</TabsTrigger>
          <TabsTrigger value="sent-requests">Requêtes envoyées</TabsTrigger>
          <TabsTrigger value="premium" className="flex items-center gap-1.5">
            <Crown className="w-3.5 h-3.5" />
            Abonnement
          </TabsTrigger>
        </TabsList>

        {/* Search */}
        <TabsContent value="search">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 mb-4">
                <Input
                  type="text"
                  placeholder="Rechercher un utilisateur"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full"
                />
                <Button onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                  <span className="sr-only">Search</span>
                </Button>
              </div>
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <div key={result.id} className="flex items-center justify-between p-4 bg-gray-100 rounded mb-4">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={result.imageURL} alt={result.name} />
                        <AvatarFallback>{result.name[0]}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{result.name}</p>
                        <p className="text-sm text-gray-500">{result.titre}</p>
                      </div>
                    </div>
                    {result.id !== uid ? (
                      friends.some((friend) => friend.id === result.id) ? (
                        <p className="text-green-500 font-medium">Amis</p>
                      ) : sentRequests.some((req) => req.id === result.id) ? (
                        <p className="text-gray-500 font-medium">Demande envoyée</p>
                      ) : (
                        <Button onClick={() => sendFriendRequest(result.id, result)}>
                          <UserPlus className="mr-2 h-4 w-4" />
                          Add Friend
                        </Button>
                      )
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-gray-500">Aucun profile</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Notifications */}
        <TabsContent value="notifications">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-lg font-semibold">Demandes reçues</h3>
              {friendRequests.length > 0 ? (
                friendRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={request.imageURL} alt={request.name} />
                        <AvatarFallback>{request.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{request.name}</p>
                        <p className="text-sm text-gray-500">{request.titre}</p>
                      </div>
                    </div>
                    <div className="space-x-2">
                      <Button size="sm" onClick={() => handleAcceptRequest(request.id, request)}>
                        Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDeclineRequest(request.id)}>
                        Decline
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">Aucune demande</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Friends */}
        <TabsContent value="friends">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-lg font-semibold">Mes amis</h3>
              {friends.length > 0 ? (
                friends.map((friend) => (
                  <div key={friend.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Avatar>
                        <AvatarImage src={friend.imageURL} alt={friend.name} />
                        <AvatarFallback>{friend.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{friend.name}</p>
                        <p className="text-sm text-gray-500">{friend.titre}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="destructive" onClick={() => handleRemoveFriend(friend.id)}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Remove Friend
                    </Button>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">No friends added yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sent Requests */}
        <TabsContent value="sent-requests">
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h3 className="text-lg font-semibold">Demandes d'amis envoyées</h3>
              {sentRequests.length > 0 ? (
                sentRequests.map((request) => (
                  <div key={request.id} className="flex items-center gap-4">
                    <Avatar>
                      <AvatarImage src={request.imageURL} alt={request.name} />
                      <AvatarFallback>{request.name.split(' ').map((n) => n[0]).join('')}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{request.name}</p>
                      <p className="text-sm text-gray-500">{request.titre}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">No sent friend requests.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Premium Tab ─────────────────────────────────────────────────────── */}
        <TabsContent value="premium">
          <div className="grid gap-4 md:grid-cols-2">

            {/* Statut actuel */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="h-full overflow-hidden" style={{ border: "1px solid var(--border-color)" }}>
                <CardContent className="pt-6 h-full flex flex-col">
                  <h3 className="text-base font-semibold mb-4 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <Crown className="w-4 h-4" style={{ color: "var(--accent-brown)" }} />
                    Statut de l'abonnement
                  </h3>

                  {userData?.premium ? (
                    <div className="flex-1 flex flex-col gap-4">
                      {/* Badge actif */}
                      <div
                        className="flex items-center gap-3 p-4 rounded-xl"
                        style={{
                          background: "var(--accent-brown)/10",
                          border: "1px solid var(--accent-brown)/30",
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                          style={{ background: "var(--accent-brown)/20" }}
                        >
                          <Crown className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />
                        </div>
                        <div>
                          <p className="font-bold" style={{ color: "var(--accent-brown)" }}>
                            Membre Premium actif
                            <Sparkles className="inline w-3.5 h-3.5 ml-1 opacity-70" />
                          </p>
                          {premiumSinceFormatted && (
                            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--text-primary)", opacity: 0.6 }}>
                              <CalendarDays className="w-3 h-3" />
                              Membre depuis le {premiumSinceFormatted}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Avantages actifs */}
                      <div className="space-y-2">
                        {[
                          { icon: <Dices className="w-4 h-4" />, label: "Tous les dés débloqués" },
                          { icon: <Crown className="w-4 h-4" />, label: "Badge Premium sur votre profil" },
                          { icon: <ShieldCheck className="w-4 h-4" />, label: "Soutien aux serveurs actif" },
                          { icon: <Heart className="w-4 h-4" />, label: "Reconnaissance éternelle du développeur" },
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <Check className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent-brown)" }} />
                            <span style={{ color: "var(--text-primary)" }}>{item.label}</span>
                          </div>
                        ))}
                      </div>

                      {/* Bouton portail */}
                      <div className="mt-auto pt-2">
                        {userData.stripeCustomerId ? (
                          <Button
                            onClick={handleManagePortal}
                            disabled={managingPortal}
                            variant="outline"
                            className="w-full"
                            style={{
                              borderColor: "var(--border-color)",
                              color: "var(--text-primary)",
                            }}
                          >
                            {managingPortal ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Settings className="w-4 h-4 mr-2" />
                            )}
                            Gérer mon abonnement
                            <ExternalLink className="w-3 h-3 ml-2 opacity-50" />
                          </Button>
                        ) : (
                          <p className="text-xs text-center opacity-40" style={{ color: "var(--text-primary)" }}>
                            Contactez le support pour gérer votre abonnement.
                          </p>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Pas premium */
                    <div className="flex-1 flex flex-col gap-4">
                      <div
                        className="flex items-center gap-3 p-4 rounded-xl"
                        style={{
                          background: "var(--bg-darker)/50",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div className="w-10 h-10 rounded-full bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                          <Crown className="w-5 h-5 text-gray-400" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-400">Pas d'abonnement actif</p>
                          <p className="text-xs mt-0.5 text-gray-500">Abonnez-vous pour débloquer tous les avantages.</p>
                        </div>
                      </div>

                      {subError && (
                        <p className="text-sm text-red-400 text-center">{subError}</p>
                      )}

                      <Button
                        onClick={handleSubscribe}
                        disabled={subscribing}
                        className="w-full py-5 font-bold"
                        style={{
                          background: "var(--accent-brown)",
                          color: "var(--bg-dark)",
                          boxShadow: "0 0 20px -5px var(--accent-brown)",
                        }}
                      >
                        {subscribing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Redirection...
                          </>
                        ) : (
                          <>
                            <Crown className="w-4 h-4 mr-2" />
                            S'abonner — 4,99 € / mois
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-center text-gray-500">
                        Sans engagement · Annulable à tout moment
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Avantages Premium */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
            >
              <Card className="h-full" style={{ border: "1px solid var(--border-color)" }}>
                <CardContent className="pt-6">
                  <h3 className="text-base font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
                    Avantages Premium
                  </h3>
                  <div className="space-y-3">
                    {[
                      {
                        icon: <Dices className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />,
                        title: "Tous les dés",
                        desc: "Accès à l'intégralité de la collection de dés exclusifs.",
                      },
                      {
                        icon: <Crown className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />,
                        title: "Badge exclusif",
                        desc: "Un badge Premium visible sur votre profil et en jeu.",
                      },
                      {
                        icon: <ShieldCheck className="w-5 h-5" style={{ color: "var(--accent-brown)" }} />,
                        title: "Soutien direct",
                        desc: "Aidez à maintenir les serveurs et faire évoluer l'app.",
                      },
                      {
                        icon: <Heart className="w-5 h-5 text-red-400" />,
                        title: "Reconnaissance éternelle",
                        desc: "Le développeur vous remerciera de tout son cœur.",
                      },
                    ].map((item, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 rounded-lg"
                        style={{
                          background: "var(--bg-darker)/30",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <div className="flex-shrink-0 mt-0.5">{item.icon}</div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                            {item.title}
                          </p>
                          <p className="text-xs mt-0.5 opacity-60" style={{ color: "var(--text-primary)" }}>
                            {item.desc}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div
                    className="mt-4 p-3 rounded-lg text-center"
                    style={{
                      background: "var(--bg-darker)/50",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <p className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                      4,99 €<span className="text-sm font-normal opacity-50"> / mois</span>
                    </p>
                    <p className="text-xs opacity-40 mt-0.5" style={{ color: "var(--text-primary)" }}>
                      Paiement sécurisé par Stripe
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
