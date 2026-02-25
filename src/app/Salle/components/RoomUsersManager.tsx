import React, { useState, useEffect } from 'react';
import { db, collection, getDocs, doc, getDoc, deleteDoc, updateDoc, auth } from '@/lib/firebase';
import { arrayUnion, arrayRemove } from 'firebase/firestore';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Trash2, Shield, User } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog';

interface RoomUsersManagerProps {
    roomId: string;
    isOwner?: boolean; // Prop gardée pour la rétrocompatibilité
    compact?: boolean; // Ajuste le style (marges/bordures)
}

interface RoomUser {
    uid: string;
    name: string;
    pp: string;
    characterName: string;
    characterImage?: string;
    isMJ: boolean;
}

interface BannedUser {
    uid: string;
    name: string;
    pp: string;
}

export function RoomUsersManager({ roomId, isOwner: propIsOwner, compact }: RoomUsersManagerProps) {
    const [users, setUsers] = useState<RoomUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [userToKick, setUserToKick] = useState<RoomUser | null>(null);
    const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
    const [isOwner, setIsOwner] = useState(propIsOwner ?? false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            // Check if current user is owner
            const roomDocRef = doc(db, 'Salle', roomId);
            const roomDoc = await getDoc(roomDocRef);
            let roomData;
            if (roomDoc.exists()) {
                roomData = roomDoc.data();
                if (auth.currentUser) {
                    setIsOwner(roomData.creatorId === auth.currentUser.uid);
                } else if (propIsOwner) {
                    setIsOwner(propIsOwner);
                }
            } else if (propIsOwner) {
                setIsOwner(propIsOwner);
            }

            // Fetch characters in the room to map characters' images
            const charsSnapshot = await getDocs(collection(db, `cartes/${roomId}/characters`));
            const chars = charsSnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));

            // Fetch users who selected a character in this room
            const nomsSnapshot = await getDocs(collection(db, `salles/${roomId}/Noms`));

            const loadedUsers: RoomUser[] = [];

            for (const nomDoc of nomsSnapshot.docs) {
                const uid = nomDoc.id;
                const nomData = nomDoc.data();
                const characterName = nomData.nom;
                const isMJ = characterName === 'MJ';

                // Fetch user info
                const userDocRef = doc(db, 'users', uid);
                const userDoc = await getDoc(userDocRef);

                if (userDoc.exists()) {
                    const userData = userDoc.data();

                    let characterImage = '';
                    if (!isMJ && characterName) {
                        const matchedChar = chars.find((c: any) => c.Nomperso === characterName);
                        if (matchedChar && matchedChar.imageURL) {
                            characterImage = matchedChar.imageURL;
                        }
                    }

                    loadedUsers.push({
                        uid,
                        name: userData.name || 'Utilisateur inconnu',
                        pp: userData.pp || '',
                        characterName: characterName || 'Sans personnage',
                        characterImage,
                        isMJ,
                    });
                }
            }

            setUsers(loadedUsers);

            if (isOwner || (roomData?.creatorId === auth.currentUser?.uid)) {
                const bannedUids = roomData?.bannedUsers || [];
                const loadedBannedUsers: BannedUser[] = [];
                for (const uid of bannedUids) {
                    const userDocRef = doc(db, 'users', uid);
                    const userDoc = await getDoc(userDocRef);
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        loadedBannedUsers.push({
                            uid,
                            name: userData.name || 'Utilisateur inconnu',
                            pp: userData.pp || ''
                        });
                    }
                }
                setBannedUsers(loadedBannedUsers);
            }

        } catch (error) {
            console.error("Erreur lors de la récupération des joueurs:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (roomId) {
            fetchUsers();
        }
    }, [roomId]);

    const handleKick = async () => {
        if (!userToKick) return;

        try {
            // 0. Add user to bannedUsers list in room
            await updateDoc(doc(db, 'Salle', roomId), {
                bannedUsers: arrayUnion(userToKick.uid)
            });

            // 1. Remove from Noms in the room
            await deleteDoc(doc(db, `salles/${roomId}/Noms`, userToKick.uid));

            // 2. Remove room from user's joined rooms
            await deleteDoc(doc(db, `users/${userToKick.uid}/rooms`, roomId));

            // 3. Clear active room if they are currently inside it
            const userDocRef = doc(db, 'users', userToKick.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
                const userData = userDoc.data();
                if (userData.room_id === roomId) {
                    await updateDoc(userDocRef, { room_id: null, perso: null, persoId: null });
                }
            }

            setBannedUsers(prev => [...prev, { uid: userToKick.uid, name: userToKick.name, pp: userToKick.pp }]);
            setUsers(users.filter(u => u.uid !== userToKick.uid));
            setUserToKick(null);
        } catch (error) {
            console.error("Erreur lors de l'expulsion du joueur:", error);
        }
    };

    const handleUnban = async (bannedUser: BannedUser) => {
        try {
            await updateDoc(doc(db, 'Salle', roomId), {
                bannedUsers: arrayRemove(bannedUser.uid)
            });
            setBannedUsers(bannedUsers.filter(u => u.uid !== bannedUser.uid));
        } catch (error) {
            console.error("Erreur lors du débannissement du joueur:", error);
        }
    };

    return (
        <Card className={compact ? "border-0 shadow-none bg-transparent" : "mt-6 border-[var(--border-color)] bg-[var(--bg-card)] text-[var(--text-primary)]"}>
            {!compact && (
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Joueurs ({users.length})
                    </CardTitle>
                </CardHeader>
            )}
            <CardContent className={compact ? "p-0" : ""}>
                {loading ? (
                    <div className="flex justify-center p-6 bg-muted/5 rounded-lg">
                        <span className="text-muted-foreground animate-pulse text-sm">Chargement des joueurs...</span>
                    </div>
                ) : users.length === 0 ? (
                    <p className="text-muted-foreground italic text-center py-6 text-sm">Aucun joueur dans cette salle pour le moment.</p>
                ) : (
                    <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                        {users.map(u => (
                            <div key={u.uid} className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200">
                                <div className="flex items-center gap-4">
                                    {/* Avatar User */}
                                    <Avatar className="h-10 w-10 border border-[var(--border-color)] group-hover:border-[var(--accent-brown)]/50 transition-colors">
                                        <AvatarImage src={u.pp} alt={u.name} />
                                        <AvatarFallback className="bg-[var(--bg-darker)] text-[var(--accent-brown)]"><User className="h-4 w-4" /></AvatarFallback>
                                    </Avatar>

                                    <div className="flex flex-col">
                                        <p className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                                            {u.name}
                                            {u.isMJ && <span title="Maître du Jeu"><Shield className="h-3.5 w-3.5 text-[#c0a080]" /></span>}
                                        </p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                            {u.isMJ ? (
                                                <span className="font-medium text-[#c0a080]/80">Maître du Jeu</span>
                                            ) : (
                                                <div className="flex items-center gap-2 text-[var(--text-primary)]/70">
                                                    {u.characterImage && (
                                                        <img src={u.characterImage} alt={u.characterName} className="h-4 w-4 rounded-full object-cover border border-white/10" />
                                                    )}
                                                    <span className="truncate max-w-[140px] tracking-wide">{u.characterName}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {isOwner && u.uid !== auth.currentUser?.uid && (
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => setUserToKick(u)}
                                        className="h-8 w-8 text-muted-foreground hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                        title="Bannir"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {isOwner && bannedUsers.length > 0 && (
                    <div className="mt-6 border-t border-[var(--border-color)] pt-4">
                        <h4 className="text-sm font-semibold flex items-center gap-2 text-red-400 mb-3 px-3">
                            <Shield className="h-4 w-4" /> Joueurs Bannis ({bannedUsers.length})
                        </h4>
                        <div className="space-y-1 max-h-[30vh] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {bannedUsers.map(u => (
                                <div key={u.uid} className="group flex items-center justify-between p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-200 opacity-60 hover:opacity-100">
                                    <div className="flex items-center gap-4">
                                        <Avatar className="h-8 w-8 border border-[var(--border-color)] grayscale transition-colors">
                                            <AvatarImage src={u.pp} alt={u.name} />
                                            <AvatarFallback className="bg-[var(--bg-darker)] text-[var(--accent-brown)]"><User className="h-3 w-3" /></AvatarFallback>
                                        </Avatar>
                                        <div className="flex flex-col">
                                            <p className="font-semibold text-sm flex items-center gap-2 text-[var(--text-primary)]">
                                                {u.name}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleUnban(u)}
                                        className="h-8 text-xs text-muted-foreground hover:bg-green-500/20 hover:text-green-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                    >
                                        Débannir
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </CardContent>

            <Dialog open={!!userToKick} onOpenChange={(open) => !open && setUserToKick(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Bannir un joueur</DialogTitle>
                        <DialogDescription>
                            Êtes-vous sûr de vouloir bannir {userToKick?.name} de cette salle ?
                            Ils perdront l'accès à la salle et ne pourront plus la rejoindre.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-4">
                        <DialogClose asChild>
                            <Button variant="outline">Annuler</Button>
                        </DialogClose>
                        <Button variant="destructive" onClick={handleKick}>
                            Confirmer le bannissement
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
